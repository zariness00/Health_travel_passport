import { supabase } from "@/integrations/supabase/client";

export type MedicationSource =
  | "manual"
  | "doctor_letter"
  | "prescription"
  | "extracted";

export type MedicationStatus = "active" | "stopped";

export type MedicationRow = {
  id: string;
  user_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  source: MedicationSource | string;
  source_label: string | null;
  source_doc_id: string | null;
  language: string | null;
  status: MedicationStatus | string;
  created_at: string;
  updated_at: string;
};

export function sourceLabel(source: string): string {
  switch (source) {
    case "manual":
      return "Added manually";
    case "onboarding":
      return "Added during onboarding";
    case "doctor_letter":
      return "Extracted from doctor letter";
    case "prescription":
      return "Extracted from prescription";
    default:
      return "Added manually";
  }
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRow(raw: unknown, userId: string): MedicationRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const now = new Date().toISOString();
  const status = r.status === "stopped" ? "stopped" : "active";
  const source = typeof r.source === "string" ? r.source : "manual";
  return {
    id: typeof r.id === "string" && r.id ? r.id : genId(),
    user_id: userId,
    name,
    dosage: typeof r.dosage === "string" ? r.dosage : null,
    frequency: typeof r.frequency === "string" ? r.frequency : null,
    duration: typeof r.duration === "string" ? r.duration : null,
    instructions: typeof r.instructions === "string" ? r.instructions : null,
    source,
    source_label:
      typeof r.source_label === "string" ? r.source_label : sourceLabel(source),
    source_doc_id:
      typeof r.source_doc_id === "string" ? r.source_doc_id : null,
    language: typeof r.language === "string" ? r.language : null,
    status,
    created_at: typeof r.created_at === "string" ? r.created_at : now,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : now,
  };
}

function parseList(json: string | null, userId: string): MedicationRow[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => normalizeRow(r, userId))
      .filter((m): m is MedicationRow => m !== null);
  } catch {
    return [];
  }
}

async function getCurrentUserId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function readList(userId: string): Promise<MedicationRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("medications_json")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Failed to load medications", error);
    return [];
  }
  const json = (data as { medications_json?: string | null } | null)?.medications_json ?? null;
  return parseList(json, userId);
}

async function writeList(userId: string, list: MedicationRow[]): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ medications_json: JSON.stringify(list) })
    .eq("id", userId);
  if (error) throw error;
}

export async function listMedications(userId?: string): Promise<MedicationRow[]> {
  const id = await getCurrentUserId(userId);
  if (!id) return [];
  return readList(id);
}

/**
 * Sync free-text medication names from onboarding/profile into the structured
 * medications list. Existing manual medications not in the list are removed;
 * new names are inserted. Extracted medications (from documents) are left
 * untouched.
 */
export async function syncManualMedications(
  userId: string,
  names: string[],
  source: "manual" | "onboarding" = "manual",
) {
  if (!userId) return;
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  const list = await readList(userId);
  const lower = (s: string) => s.toLowerCase();

  const userEnteredSources = new Set(["manual", "onboarding"]);
  const isUserEntered = (m: MedicationRow) =>
    userEnteredSources.has((m.source as string) ?? "manual");

  // Untouched: anything extracted from documents.
  const nonUserEntered = list.filter((m) => !isUserEntered(m));
  // User-entered meds added through other flows (e.g. onboarding when syncing manual)
  const otherUserEntered = list.filter(
    (m) => isUserEntered(m) && m.source !== source,
  );
  const sameSource = list.filter((m) => m.source === source);

  const desiredSet = new Set(trimmed.map(lower));
  // Dedupe against ALL user-entered meds so we don't insert a duplicate
  // already added through the other flow.
  const existingUserEnteredNames = new Set(
    [...otherUserEntered, ...sameSource].map((m) => lower(m.name)),
  );
  const sameSourceSet = new Set(sameSource.map((m) => lower(m.name)));

  const keptSameSource = sameSource.filter((m) => desiredSet.has(lower(m.name)));
  const now = new Date().toISOString();
  const newRows: MedicationRow[] = trimmed
    .filter((n) => !existingUserEnteredNames.has(lower(n)))
    .map((name) => ({
      id: genId(),
      user_id: userId,
      name,
      dosage: null,
      frequency: null,
      duration: null,
      instructions: null,
      source,
      source_label: sourceLabel(source),
      source_doc_id: null,
      language: null,
      status: "active",
      created_at: now,
      updated_at: now,
    }));

  void sameSourceSet;
  await writeList(userId, [
    ...nonUserEntered,
    ...otherUserEntered,
    ...keptSameSource,
    ...newRows,
  ]);
}

export async function updateMedicationStatus(
  id: string,
  status: MedicationStatus,
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in");
  const list = await readList(userId);
  const next = list.map((m) =>
    m.id === id ? { ...m, status, updated_at: new Date().toISOString() } : m,
  );
  await writeList(userId, next);
}

export async function deleteMedication(id: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in");
  const list = await readList(userId);
  await writeList(
    userId,
    list.filter((m) => m.id !== id),
  );
}

export async function updateMedication(
  id: string,
  patch: Partial<
    Pick<
      MedicationRow,
      "name" | "dosage" | "frequency" | "duration" | "instructions" | "status"
    >
  >,
) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in");
  const list = await readList(userId);
  const next = list.map((m) =>
    m.id === id
      ? { ...m, ...patch, updated_at: new Date().toISOString() }
      : m,
  );
  await writeList(userId, next);
}

export async function createManualMedication(
  patch: Partial<
    Pick<
      MedicationRow,
      "name" | "dosage" | "frequency" | "duration" | "instructions"
    >
  >,
): Promise<MedicationRow> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in");
  if (!patch.name || !patch.name.trim()) {
    throw new Error("Medication name is required");
  }
  const now = new Date().toISOString();
  const row: MedicationRow = {
    id: genId(),
    user_id: userId,
    name: patch.name.trim(),
    dosage: patch.dosage?.trim() || null,
    frequency: patch.frequency?.trim() || null,
    duration: patch.duration?.trim() || null,
    instructions: patch.instructions?.trim() || null,
    source: "manual",
    source_label: "Added manually",
    source_doc_id: null,
    language: null,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  const list = await readList(userId);
  await writeList(userId, [...list, row]);
  return row;
}
