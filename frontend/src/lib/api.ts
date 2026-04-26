import { supabase } from "@/integrations/supabase/client";

export const API_BASE_URL =
  "https://medical-backend-748034533014.us-central1.run.app/api";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = new URL(API_BASE_URL + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await authHeader()),
    ...(opts.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    body = opts.body;
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ||
      (parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : null) ||
      (typeof parsed === "string" && parsed) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }

  return parsed as T;
}

// ===== Profile =====

export type BackendProfile = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  sex?: string;
  onboarded?: boolean;
  created_at?: string;
  updated_at?: string;
};

export function getMe() {
  return apiRequest<BackendProfile>("/me");
}

export function getBackendProfile() {
  return apiRequest<BackendProfile>("/profile");
}

export function patchBackendProfile(patch: Partial<BackendProfile>) {
  return apiRequest<BackendProfile>("/profile", {
    method: "PATCH",
    json: patch,
  });
}

// ===== Documents =====

export type DocCategoryName =
  | "Lab Results"
  | "Doctor Letters"
  | "Medications"
  | "Imaging & Scans"
  | "Unknown";

export type BackendDocStatus = "PENDING" | "PROCESSED" | "FAILED";

export type BackendDocument = {
  id: string;
  original_name: string;
  category: DocCategoryName;
  status: BackendDocStatus;
  storage_path?: string;
  metadata?: unknown;
  created_at: string;
  updated_at: string;
};

export type CategoryCount = {
  category: DocCategoryName;
  count: number;
};

export function getDocumentCounts() {
  return apiRequest<CategoryCount[]>("/documents/counts");
}

export function listDocuments(
  category: DocCategoryName,
  page = 1,
  size = 20,
) {
  return apiRequest<BackendDocument[]>("/documents", {
    query: { category, page, size },
  });
}

export function getDocument(id: string) {
  return apiRequest<BackendDocument>(`/documents/${encodeURIComponent(id)}`);
}

export async function uploadDocuments(
  files: File[],
  category: DocCategoryName,
) {
  const fd = new FormData();
  // Backend accepts: Lab Results, Doctor Letters, Medications, Imaging & Scans
  // Map our internal "Unknown" to "Lab Results" as a safe default.
  const backendCategory = category === "Unknown" ? "Lab Results" : category;
  fd.append("category", backendCategory);
  for (const f of files) fd.append("documents", f);
  return apiRequest<BackendDocument[]>("/documents", {
    method: "POST",
    body: fd,
  });
}

// ===== Doctor Pack =====

export type DoctorPack = {
  id: string;
  user_id?: string;
  status?: string;
  content?: unknown;
  created_at?: string;
  updated_at?: string;
};

export function generateDoctorPack() {
  return apiRequest<DoctorPack>("/doctor-pack", { method: "POST" });
}

// Medications are stored in the user profile (Lovable Cloud), not the
// backend API. See src/lib/medications.ts.

