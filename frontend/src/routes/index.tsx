import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  CloudUpload,
  Download,
  FileHeart,
  FileQuestion,
  FileText,
  FlaskConical,
  Globe2,
  HeartPulse,
  Home,
  Image as ImageIcon,
  Languages,
  LogOut,
  MapPin,
  Phone,
  Pill,
  Plus,
  ScanLine,
  Search,
  Share2,
  Sparkles,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateAge, useAuth, type Profile } from "@/lib/auth";
import type { ClinicResult } from "@/lib/find-care.functions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import {
  createManualMedication,
  deleteMedication,
  listMedications,
  sourceLabel as medSourceLabel,
  updateMedicationStatus,
  type MedicationRow,
} from "@/lib/medications";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  generateDoctorPack,
  getDocumentCounts,
  getDocument,
  listDocuments,
  uploadDocuments,
  type BackendDocument,
  type DocCategoryName,
  type DoctorPack,
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Health Passport — for expats & travelers" },
      {
        name: "description",
        content:
          "Store, translate, and summarize medical records across countries. Built for expats, international students, and travelers.",
      },
      { property: "og:title", content: "Health Passport — for expats & travelers" },
      {
        property: "og:description",
        content:
          "Multilingual medical records, doctor-ready summaries, and English-speaking clinic finder for people on the move.",
      },
    ],
  }),
  component: HealthPassportPrototype,
});

type ScreenKey =
  | "welcome"
  | "home"
  | "records"
  | "recordsCategory"
  | "add"
  | "review"
  | "summary"
  | "timeline"
  | "doctor"
  | "doctorResult"
  | "find"
  | "documentDetail"
  | "medicationDetail"
  | "explainSelect"
  | "explainResult";

type ExtraLanguage =
  | "Japanese"
  | "German"
  | "Spanish"
  | "French"
  | "Italian"
  | "Hungarian"
  | "Korean"
  | "Chinese"
  | "Turkish"
  | "Arabic"
  | "Portuguese"
  | "Russian";

type DocCategory =
  | "Lab Results"
  | "Doctor Letters"
  | "Medications"
  | "Imaging & Scans"
  | "Other / Unknown";

type DocStatus = "processing" | "ready" | "failed";

type MedDocument = {
  id: string;
  type: string;
  category: DocCategory;
  country: string;
  date: string;
  language: string;
  Icon: LucideIcon;
  status: DocStatus;
  storage_path?: string;
};

const CATEGORY_META: { key: DocCategory; Icon: LucideIcon }[] = [
  { key: "Lab Results", Icon: FlaskConical },
  { key: "Doctor Letters", Icon: FileText },
  { key: "Medications", Icon: Pill },
  { key: "Imaging & Scans", Icon: ScanLine },
  { key: "Other / Unknown", Icon: FileQuestion },
];

// Map between backend category names and UI labels.
function backendCategoryToUi(c: DocCategoryName): DocCategory {
  return c === "Unknown" ? "Other / Unknown" : (c as DocCategory);
}
function uiCategoryToBackend(c: DocCategory): DocCategoryName {
  return c === "Other / Unknown" ? "Unknown" : (c as DocCategoryName);
}

function backendStatusToUi(s: BackendDocument["status"]): DocStatus {
  if (s === "PROCESSED") return "ready";
  if (s === "FAILED") return "failed";
  return "processing";
}

function iconForCategory(c: DocCategory): LucideIcon {
  return CATEGORY_META.find((m) => m.key === c)?.Icon ?? FileQuestion;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit" });
}

function backendDocToMed(d: BackendDocument): MedDocument {
  const category = backendCategoryToUi(d.category);
  const language = "—";
  return {
    id: d.id,
    type: d.original_name || category,
    category,
    country: "",
    date: shortDate(d.created_at),
    language,
    Icon: iconForCategory(category),
    status: backendStatusToUi(d.status),
    storage_path: d.storage_path,
  };
}

const extraLanguageMeta: Record<ExtraLanguage, { flag: string; label: string }> = {
  Japanese: { flag: "🇯🇵", label: "Japanese" },
  German: { flag: "🇩🇪", label: "German" },
  Spanish: { flag: "🇪🇸", label: "Spanish" },
  French: { flag: "🇫🇷", label: "French" },
  Italian: { flag: "🇮🇹", label: "Italian" },
  Hungarian: { flag: "🇭🇺", label: "Hungarian" },
  Korean: { flag: "🇰🇷", label: "Korean" },
  Chinese: { flag: "🇨🇳", label: "Chinese" },
  Turkish: { flag: "🇹🇷", label: "Turkish" },
  Arabic: { flag: "🇸🇦", label: "Arabic" },
  Portuguese: { flag: "🇵🇹", label: "Portuguese" },
  Russian: { flag: "🇷🇺", label: "Russian" },
};

const flow: ScreenKey[] = [
  "welcome",
  "home",
  "records",
  "add",
  "review",
  "summary",
  "timeline",
  "doctor",
  "doctorResult",
  "find",
];

function HealthPassportPrototype() {
  const navigate = useNavigate();
  const { session, profile, loading, signOut } = useAuth();
  const [screen, setScreen] = useState<ScreenKey>("welcome");
  const activeIndex = flow.findIndex((item) => item === screen);
  const nextScreen = flow[Math.min(activeIndex + 1, flow.length - 1)] ?? "home";

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/login" });
      return;
    }
    if (session && profile && !profile.onboarded) {
      void navigate({ to: "/onboarding" });
      return;
    }
    if (session && screen === "welcome") {
      setScreen("home");
    }
  }, [session, profile, loading, navigate, screen]);

  if (loading || !session) {
    return (
      <main className="wellness-shell grid min-h-screen place-items-center text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="wellness-shell min-h-screen overflow-hidden px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_430px] lg:items-center">
        <section className="hidden lg:block">
          <div className="max-w-xl space-y-7">
            <Badge icon={Globe2}>For expats, students & travelers</Badge>
            <div className="space-y-4">
              <h1 className="text-5xl font-semibold leading-tight tracking-normal text-foreground">
                Health Passport
              </h1>
              <p className="text-xl leading-8 text-muted-foreground">
                Store, translate, and summarize your medical records — in any language, any country.
                Walk into any clinic abroad with a doctor-ready pack in seconds.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                "Upload from any country",
                "Translate to local language",
                "Doctor-ready summaries",
                "Find English-speaking care",
              ].map((item) => (
                <div className="medical-card rounded-3xl p-5" key={item}>
                  <Check className="mb-4 size-5 safe-text" />
                  <p className="font-medium">{item}</p>
                </div>
              ))}
            </div>
            <Button
              className="mt-2"
              onClick={() => void signOut()}
              size="mobile"
              variant="calm"
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <PhoneFrame>
            <div className="flex h-full flex-col overflow-hidden rounded-[2.25rem] bg-background">
              <ScreenContent
                screen={screen}
                setScreen={setScreen}
                nextScreen={nextScreen}
                profile={profile}
              />
              <BottomNav screen={screen} setScreen={setScreen} />
            </div>
          </PhoneFrame>
        </section>
      </div>
    </main>
  );
}

function ScreenContent({
  screen,
  setScreen,
  nextScreen,
  profile,
}: {
  screen: ScreenKey;
  setScreen: (screen: ScreenKey) => void;
  nextScreen: ScreenKey;
  profile: Profile | null;
}) {
  const [extraLang, setExtraLang] = useState<ExtraLanguage>("Japanese");
  const [doctorPack, setDoctorPack] = useState<DoctorPack | null>(null);
  const [generatingPack, setGeneratingPack] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<MedDocument[]>([]);
  const [counts, setCounts] = useState<Record<DocCategory, number>>({
    "Lab Results": 0,
    "Doctor Letters": 0,
    Medications: 0,
    "Imaging & Scans": 0,
    "Other / Unknown": 0,
  });
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<DocCategory>("Lab Results");
  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? null;
  const selectedMed = medications.find((m) => m.id === selectedMedId) ?? null;

  const reloadMeds = async () => {
    if (!user) return;
    try {
      const list = await listMedications(user.id);
      setMedications(list);
    } catch (e) {
      console.error("Failed to load medications", e);
    }
  };

  const reloadCounts = async () => {
    try {
      const data = await getDocumentCounts();
      const next: Record<DocCategory, number> = {
        "Lab Results": 0,
        "Doctor Letters": 0,
        Medications: 0,
        "Imaging & Scans": 0,
        "Other / Unknown": 0,
      };
      for (const row of data ?? []) {
        const ui = backendCategoryToUi(row.category);
        // Medications are user-entered profile data, not documents.
        if (ui === "Medications") continue;
        next[ui] = row.count;
      }
      setCounts(next);
    } catch (e) {
      console.error("Failed to load document counts", e);
    }
  };

  const reloadCategory = async (cat: DocCategory) => {
    if (cat === "Medications") {
      // Medications are loaded from the user profile, not from the backend.
      setDocsLoading(false);
      setDocsError(null);
      return;
    }
    setDocsLoading(true);
    setDocsError(null);
    try {
      const list = await listDocuments(uiCategoryToBackend(cat), 1, 50);
      const mapped = (list ?? []).map(backendDocToMed);
      setDocuments((prev) => {
        const others = prev.filter((d) => d.category !== cat);
        return [...mapped, ...others];
      });
    } catch (e) {
      console.error("Failed to load documents", e);
      setDocsError(e instanceof Error ? e.message : "Failed to load documents.");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    void reloadMeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.medications, profile?.medications_json]);

  useEffect(() => {
    if (!user) return;
    void reloadCounts();
    // also prefetch lab results so explainSelect has data
    void reloadCategory("Lab Results");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Keep the Medications category count in sync with the local profile list.
  useEffect(() => {
    setCounts((prev) =>
      prev.Medications === medications.length
        ? prev
        : { ...prev, Medications: medications.length },
    );
  }, [medications.length]);

  const handleSelectForExplain = (id: string) => {
    setSelectedDocId(id);
    setScreen("explainResult");
  };
  const openCategory = (cat: DocCategory) => {
    setActiveCategory(cat);
    void reloadCategory(cat);
    setScreen("recordsCategory");
  };
  const handleUpload = async (category: DocCategory, files: File[]) => {
    if (!files.length) {
      toast.error("Please choose a file to upload.");
      return;
    }
    setUploading(true);
    setActiveCategory(category);
    setScreen("recordsCategory");
    try {
      await uploadDocuments(files, uiCategoryToBackend(category));
      toast.success(
        files.length === 1 ? "Document uploaded" : `${files.length} documents uploaded`,
      );
      await Promise.all([reloadCounts(), reloadCategory(category)]);
    } catch (e) {
      console.error("Upload failed", e);
      toast.error(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const screenMap = useMemo(
    () => ({
      welcome: <WelcomeScreen setScreen={setScreen} />,
      home: <HomeScreen setScreen={setScreen} profile={profile} medications={medications} />,
      records: (
        <RecordsScreen counts={counts} onOpenCategory={openCategory} />
      ),
      recordsCategory: (
        <RecordsCategoryScreen
          category={activeCategory}
          documents={documents.filter((d) => d.category === activeCategory)}
          medications={activeCategory === "Medications" ? medications : []}
          loading={docsLoading}
          uploading={uploading}
          error={docsError}
          onBack={() => setScreen("records")}
          onUpload={() => setScreen("add")}
          onView={async (id) => {
            const d = documents.find((x) => x.id === id);
            if (!d || d.status !== "ready") return;
            setSelectedDocId(id);
            // Refresh detail in case backend has more metadata
            try {
              const fresh = await getDocument(id);
              const mapped = backendDocToMed(fresh);
              setDocuments((prev) =>
                prev.map((x) => (x.id === id ? { ...x, ...mapped } : x)),
              );
            } catch (err) {
              console.warn("Failed to refresh document detail", err);
            }
            if (d.category === "Lab Results") {
              setScreen("explainResult");
            } else {
              setScreen("documentDetail");
            }
          }}
          onViewMedication={(id) => {
            setSelectedMedId(id);
            setScreen("medicationDetail");
          }}
          onChangeMedStatus={async (id, status) => {
            try {
              await updateMedicationStatus(id, status);
              await reloadMeds();
            } catch (e) {
              console.error(e);
            }
          }}
          onDeleteMed={async (id) => {
            try {
              await deleteMedication(id);
              await reloadMeds();
            } catch (e) {
              console.error(e);
            }
          }}
          onAddMed={async (input) => {
            try {
              await createManualMedication(input);
              await reloadMeds();
              toast.success("Medication added");
            } catch (e) {
              console.error(e);
              toast.error(
                e instanceof Error ? e.message : "Failed to add medication",
              );
              throw e;
            }
          }}
          onDemoAnalysis={(id) => {
            setSelectedDocId(id);
            setScreen("explainResult");
          }}
        />
      ),
      add: <AddRecordScreen onUpload={handleUpload} uploading={uploading} />,
      review: <ReviewScreen setScreen={setScreen} />,
      summary: <SummaryScreen />,
      timeline: <TimelineScreen />,
      doctor: (
        <DoctorPackScreen
          setScreen={setScreen}
          extraLang={extraLang}
          setExtraLang={setExtraLang}
          profile={profile}
          medications={medications}
          generating={generatingPack}
          onGenerate={async () => {
            setGeneratingPack(true);
            try {
              const pack = await generateDoctorPack();
              setDoctorPack(pack);
              setScreen("doctorResult");
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "Could not generate Doctor Pack.",
              );
            } finally {
              setGeneratingPack(false);
            }
          }}
        />
      ),
      doctorResult: (
        <DoctorPackResultScreen
          extraLang={extraLang}
          profile={profile}
          medications={medications}
          pack={doctorPack}
        />
      ),
      find: <FindCareScreen />,
      documentDetail: (
        <DocumentDetailScreen
          doc={selectedDoc}
          onBack={() => setScreen("recordsCategory")}
        />
      ),
      medicationDetail: (
        <MedicationDetailScreen
          medication={selectedMed}
          onBack={() => setScreen("recordsCategory")}
          onAfterChange={() => void reloadMeds()}
          onOpenSource={() => {
            if (selectedMed?.source_doc_id) {
              setSelectedDocId(selectedMed.source_doc_id);
              setScreen("documentDetail");
            }
          }}
        />
      ),
      explainSelect: (
        <SelectDocumentScreen
          title="Choose lab results to explain"
          subtitle="Only your lab results are shown here."
          docs={documents.filter((d) => d.category === "Lab Results" && d.status === "ready")}
          onSelect={handleSelectForExplain}
        />
      ),
      explainResult: (
        <LabExplanationScreen doc={selectedDoc} setScreen={setScreen} />
      ),
    }),
    [setScreen, extraLang, profile, selectedDoc, selectedMed, documents, medications, activeCategory, generatingPack, doctorPack],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
      {screenMap[screen]}
      {screen !== "welcome" &&
        screen !== "find" &&
        screen !== "records" &&
        screen !== "recordsCategory" &&
        screen !== "add" &&
        screen !== "documentDetail" &&
        screen !== "medicationDetail" &&
        screen !== "explainSelect" &&
        screen !== "explainResult" && (
        <button
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground transition active:scale-[0.98]"
          onClick={() => setScreen(nextScreen)}
          type="button"
        >
          Continue demo flow <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[2.75rem] border border-border bg-card p-3 shadow-soft">
      <div className="h-[820px] max-h-[calc(100vh-3rem)] min-h-[680px] overflow-hidden rounded-[2.35rem] border border-border bg-background">
        {children}
      </div>
    </div>
  );
}

function WelcomeScreen({ setScreen }: { setScreen: (screen: ScreenKey) => void }) {
  return (
    <div className="flex min-h-full flex-col justify-between gap-8 py-3">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Globe2 className="size-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Health</p>
          <h2 className="text-xl font-semibold">Passport</h2>
        </div>
      </div>
      <div className="aurora-field relative overflow-hidden rounded-[2rem] p-6 shadow-card">
        <div className="float-slow mx-auto grid aspect-square w-56 place-items-center rounded-full bg-wellness-pink">
          <div className="grid size-40 place-items-center rounded-[2rem] bg-card shadow-card">
            <UserRound className="size-14 text-primary" />
            <div className="mt-2 flex gap-2">
              <FileText className="size-6 text-accent-foreground" />
              <Languages className="size-6 text-primary" />
              <HeartPulse className="size-6 safe-text" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-6 rounded-2xl bg-card/90 px-4 py-3 shadow-card">
          <p className="text-xs font-semibold text-muted-foreground">Across borders</p>
          <div className="mt-2 h-2 w-28 rounded-full bg-wellness-teal" />
        </div>
      </div>
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold leading-tight">Your medical records, anywhere you go</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Built for expats, international students, and travelers. Translate documents, prepare doctor-ready
          summaries, and find English-speaking care abroad.
        </p>
      </div>
      <div className="space-y-3">
        <Button className="w-full" onClick={() => setScreen("home")} size="mobile" variant="wellness">
          Get Started
        </Button>
        <Button className="w-full" size="mobile" variant="calm">
          Log In
        </Button>
        <p className="px-3 text-center text-xs leading-5 text-muted-foreground">
          We help you organize and translate health information. We do not diagnose or prescribe.
        </p>
      </div>
    </div>
  );
}

function activeMedicationsSummary(meds: MedicationRow[]): string {
  const active = meds.filter((m) => m.status === "active");
  if (active.length === 0) return "None recorded";
  const names = active.map((m) => m.name);
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

function activeMedicationNames(meds: MedicationRow[]): string[] {
  return meds.filter((m) => m.status === "active").map((m) => m.name);
}

function HomeScreen({
  setScreen,
  profile,
  medications,
}: {
  setScreen: (screen: ScreenKey) => void;
  profile: Profile | null;
  medications: MedicationRow[];
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await signOut();
    void navigate({ to: "/login" });
  };
  const firstName =
    (profile?.full_name ?? "").trim().split(/\s+/)[0] ||
    profile?.email?.split("@")[0] ||
    "there";
  const profileLocation = profile?.current_location || "";
  const [locationOverride, setLocationOverride] = useState<string>("");
  const [editingLocation, setEditingLocation] = useState(false);
  const location = locationOverride || profileLocation || "Add your location";
  const age = calculateAge(profile?.date_of_birth ?? null);

  const snapshotRows: [string, string][] = [];
  if (age !== null) snapshotRows.push(["Age", String(age)]);
  snapshotRows.push(["Sex", profile?.sex || "Not specified"]);
  if (profile?.conditions && profile.conditions.trim()) {
    snapshotRows.push(["Condition", profile.conditions]);
  }
  snapshotRows.push([
    "Current medications",
    activeMedicationsSummary(medications),
  ]);
  snapshotRows.push([
    "Allergies",
    profile?.allergies && profile.allergies.trim()
      ? profile.allergies
      : "None recorded",
  ]);
  snapshotRows.push(["Last test", "Mar 12 (Italy)"]);

  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? "Good morning"
      : hour >= 12 && hour < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <ScreenStack>
      <div className="pb-2">
        <p className="text-base font-normal text-muted-foreground">
          {greeting},
        </p>
        <h1 className="mt-0.5 text-3xl font-bold leading-tight tracking-tight text-foreground">
          {firstName} <span aria-hidden>👋</span>
        </h1>
        {editingLocation ? (
          <div className="mt-3 rounded-2xl border border-border bg-card p-3 shadow-card">
            <LocationAutocomplete
              value={locationOverride || profileLocation}
              onChange={(v) => {
                setLocationOverride(v);
                setEditingLocation(false);
              }}
              placeholder="City, Country"
            />
            <button
              type="button"
              onClick={() => setEditingLocation(false)}
              className="mt-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingLocation(true)}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
          >
            <MapPin className="size-3.5" /> {location}
            <span className="ml-1 text-[10px] font-medium text-muted-foreground">✏️ Change</span>
          </button>
        )}
      </div>

      <div className="medical-card mt-4 rounded-[1.75rem] p-5">
        <h2 className="text-lg font-semibold">Your health snapshot</h2>
        <dl className="mt-4 space-y-2.5">
          {snapshotRows.map(([label, value]) => (
            <div className="flex items-baseline justify-between gap-4 text-sm" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ActionCard icon={CloudUpload} label="Upload Record" onClick={() => setScreen("add")} />
        <ActionCard icon={FileText} label="View Records" onClick={() => setScreen("records")} />
        <ActionCard icon={FileHeart} label="Explain Lab Results" onClick={() => setScreen("explainSelect")} />
        <DoctorPackActionCard onClick={() => setScreen("doctor")} />
      </div>

      <div className="aurora-field rounded-[1.75rem] border border-border p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-wellness-teal">
            <Globe2 className="size-5 text-accent-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Need care abroad?</p>
            <h3 className="mt-1 font-semibold leading-snug">
              Find a clinic that speaks your language
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Nearby English-speaking specialists in Tokyo.
            </p>
          </div>
        </div>
        <Button
          className="mt-4 w-full"
          onClick={() => setScreen("find")}
          size="mobile"
          variant="wellness"
        >
          <Search className="size-4" /> Find English-speaking doctor
        </Button>
      </div>
      <button
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground transition hover:bg-muted active:scale-[0.99]"
        onClick={() => void navigate({ to: "/profile" })}
        type="button"
      >
        <UserRound className="size-4" /> Edit health profile
      </button>
      <button
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3.5 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary/80 active:scale-[0.99]"
        onClick={handleLogout}
        type="button"
      >
        <LogOut className="size-4" /> Log out
      </button>
    </ScreenStack>
  );
}

function RecordsScreen({
  counts,
  onOpenCategory,
}: {
  counts: Record<DocCategory, number>;
  onOpenCategory: (cat: DocCategory) => void;
}) {
  return (
    <ScreenStack>
      <Header
        title="Medical Records"
        subtitle="All your documents, organized by category."
      />
      <div className="grid grid-cols-2 gap-3">
        {CATEGORY_META.map(({ Icon, key }) => {
          const count = counts[key] ?? 0;
          return (
            <button
              className="medical-card rounded-[1.5rem] p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.98]"
              key={key}
              onClick={() => onOpenCategory(key)}
              type="button"
            >
              <Icon className="mb-4 size-6 text-primary" />
              <p className="text-sm font-semibold leading-5">{key}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {count === 0
                  ? "No documents yet"
                  : `${count} document${count === 1 ? "" : "s"}`}
              </p>
            </button>
          );
        })}
      </div>
    </ScreenStack>
  );
}

function RecordsCategoryScreen({
  category,
  documents,
  medications,
  loading,
  uploading,
  error,
  onBack,
  onUpload,
  onView,
  onViewMedication,
  onChangeMedStatus,
  onDeleteMed,
  onAddMed,
  onDemoAnalysis,
}: {
  category: DocCategory;
  documents: MedDocument[];
  medications: MedicationRow[];
  loading?: boolean;
  uploading?: boolean;
  error?: string | null;
  onBack: () => void;
  onUpload: () => void;
  onView: (id: string) => void;
  onViewMedication: (id: string) => void;
  onChangeMedStatus: (id: string, status: "active" | "stopped") => void;
  onDeleteMed: (id: string) => void;
  onAddMed: (input: {
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }) => Promise<void>;
  onDemoAnalysis?: (id: string) => void;
}) {
  const isLab = category === "Lab Results";
  const isMedications = category === "Medications";
  const isUnknown = category === "Other / Unknown";
  const [addOpen, setAddOpen] = useState(false);

  // ----- Subtitle -----
  let subtitle: string;
  if (isMedications) {
    const activeCount = medications.filter((m) => m.status === "active").length;
    subtitle =
      medications.length === 0
        ? "No medications recorded yet."
        : `${activeCount} active · ${medications.length} total`;
  } else if (isUnknown) {
    subtitle =
      documents.length === 0
        ? "Documents will appear here only if the system cannot identify their type."
        : `${documents.length} unclassified document${documents.length === 1 ? "" : "s"}.`;
  } else {
    subtitle =
      documents.length === 0
        ? "No records yet."
        : `${documents.length} document${documents.length === 1 ? "" : "s"} in this category.`;
  }

  return (
    <ScreenStack>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        ← All categories
      </button>
      <Header title={category} subtitle={subtitle} />

      {uploading && (
        <div className="medical-card rounded-[1.5rem] p-4 text-sm text-muted-foreground">
          Uploading and analyzing your document…
        </div>
      )}
      {error && !loading && (
        <div className="medical-card rounded-[1.5rem] p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading && documents.length === 0 && !isMedications && (
        <div className="medical-card rounded-[1.5rem] p-6 text-center text-sm text-muted-foreground">
          Loading documents…
        </div>
      )}

      {isMedications ? (
        medications.length === 0 ? (
          <div className="medical-card rounded-[1.5rem] p-6 text-center">
            <p className="text-sm font-medium">No medications yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a medication you take, or upload a doctor letter or
              prescription and we'll extract them automatically.
            </p>
            <Button
              type="button"
              variant="wellness"
              size="mobile"
              className="mt-4 w-full"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" />
              Add medication
            </Button>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="wellness"
                size="sm"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-4" />
                Add medication
              </Button>
            </div>
            <div className="space-y-2.5">
              {medications.map((med) => (
                <MedicationCard
                  key={med.id}
                  med={med}
                  onOpen={() => onViewMedication(med.id)}
                  onToggleStatus={() =>
                    onChangeMedStatus(
                      med.id,
                      med.status === "active" ? "stopped" : "active",
                    )
                  }
                  onDelete={() => onDeleteMed(med.id)}
                />
              ))}
            </div>
          </>
        )
      ) : isUnknown ? (
        documents.length === 0 ? (
          <div className="medical-card rounded-[1.5rem] p-6 text-center">
            <p className="text-sm font-medium">No unclassified records yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Documents will appear here only if the system cannot identify their type.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onView={onView} />
            ))}
          </div>
        )
      ) : documents.length === 0 ? (
        <div className="medical-card rounded-[1.5rem] p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No records yet. Upload your first document.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={onUpload}
            size="mobile"
            variant="wellness"
          >
            <CloudUpload className="size-4" /> Upload document
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onView={onView}
              onDemoAnalysis={isLab ? onDemoAnalysis : undefined}
            />
          ))}
        </div>
      )}
      {isMedications && (
        <AddMedicationDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSubmit={onAddMed}
        />
      )}
    </ScreenStack>
  );
}

function AddMedicationDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: {
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDosage("");
      setFrequency("");
      setDuration("");
      setInstructions("");
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Medication name is required");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: trimmed,
        dosage: dosage.trim() || undefined,
        frequency: frequency.trim() || undefined,
        duration: duration.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      // toast handled upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add medication</DialogTitle>
          <DialogDescription>
            Record a medication you currently take. You can edit or stop it
            anytime.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="med-name">Medication name *</Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Iron supplement"
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="med-dosage">Dosage</Label>
              <Input
                id="med-dosage"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="1 tablet"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-frequency">Frequency</Label>
              <Input
                id="med-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Once daily"
                maxLength={80}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-duration">Duration</Label>
            <Input
              id="med-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="30 days"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-notes">Notes</Label>
            <Textarea
              id="med-notes"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Take after food"
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="wellness"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Save medication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentRow({
  doc,
  onView,
  onDemoAnalysis,
}: {
  doc: MedDocument;
  onView: (id: string) => void;
  onDemoAnalysis?: (id: string) => void;
}) {
  const showDemoLink = Boolean(onDemoAnalysis) && doc.status !== "ready";
  return (
    <div className="medical-card overflow-hidden rounded-2xl p-0">
      <button
        type="button"
        onClick={() => onView(doc.id)}
        disabled={doc.status === "processing"}
        className="flex w-full items-center gap-3 p-4 text-left transition enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:opacity-90"
      >
        <doc.Icon className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.type}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doc.date} · {doc.language}
          </p>
          {doc.status === "processing" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Analyzing your document…
            </p>
          )}
        </div>
        {doc.status === "processing" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-wellness-lavender px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Analyzing…
          </span>
        ) : doc.status === "failed" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold text-destructive">
            Failed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-wellness-teal px-2.5 py-1 text-[10px] font-semibold text-accent-foreground">
            Ready
          </span>
        )}
      </button>
      {showDemoLink && (
        <button
          type="button"
          onClick={() => onDemoAnalysis!(doc.id)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 text-xs font-semibold text-primary transition hover:bg-secondary/60"
        >
          <Sparkles className="size-3.5" />
          View demo analysis
        </button>
      )}
    </div>
  );
}

function AddRecordScreen({
  onUpload,
  uploading,
}: {
  onUpload: (category: DocCategory, files: File[]) => void;
  uploading?: boolean;
}) {
  const [category, setCategory] = useState<DocCategory>("Lab Results");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onUpload(category, Array.from(fileList));
  };

  return (
    <ScreenStack>
      <Header
        title="Add medical information"
        subtitle="Upload any medical document, in any language. AI will organize, translate, and summarize it."
      />
      <div className="medical-card rounded-[1.5rem] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Category
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORY_META.map(({ key }) => {
            const active = category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
      <label
        className="block cursor-pointer rounded-[2rem] border-2 border-dashed border-primary/35 bg-wellness-pink/40 p-8 text-center transition hover:bg-wellness-pink/60"
      >
        <CloudUpload className="mx-auto mb-4 size-12 text-primary" />
        <h2 className="text-xl font-semibold">
          {uploading ? "Uploading…" : "Drop your file here"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          PDF or photo — any language. Tap to choose a file.
        </p>
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid gap-3">
        <button
          className="medical-card flex items-center gap-3 rounded-2xl p-4 text-left transition hover:scale-[1.01] disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          type="button"
          disabled={uploading}
        >
          <FileText className="size-5 text-primary" />
          <span className="font-medium">Upload PDF</span>
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </button>
        <button
          className="medical-card flex items-center gap-3 rounded-2xl p-4 text-left transition hover:scale-[1.01] disabled:opacity-50"
          onClick={() => cameraInputRef.current?.click()}
          type="button"
          disabled={uploading}
        >
          <Camera className="size-5 text-primary" />
          <span className="font-medium">Take Photo</span>
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        </button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Supported: lab results, prescriptions, imaging reports, doctor letters, discharge summaries — in any language.
      </p>
    </ScreenStack>
  );
}

function ReviewScreen({ setScreen }: { setScreen: (screen: ScreenKey) => void }) {
  return (
    <ScreenStack>
      <Header title="We analyzed your document" subtitle="Please confirm the extracted details." />
      <SummaryCard
        title="Document"
        rows={[
          ["Document type", "Blood Test"],
          ["Original language", "Italian"],
          ["Date", "March 12, 2026"],
          ["Country", "Italy"],
          ["Clinic", "Milan Health Lab"],
          ["Patient", "Milan Toth"],
          ["Category", "Lab Results"],
        ]}
      />
      <LabValues />
      <div className="grid gap-3">
        <Button size="mobile" variant="wellness">
          Save to Records
        </Button>
        <Button size="mobile" variant="calm">
          <Languages className="size-4" /> Translate to Japanese
        </Button>
        <Button onClick={() => setScreen("summary")} size="mobile" variant="calm">
          <Stethoscope className="size-4" /> Generate Doctor Summary
        </Button>
      </div>
    </ScreenStack>
  );
}

function SummaryScreen() {
  return (
    <ScreenStack>
      <Header title="Blood Test — March 12" subtitle="Italy · Milan Health Lab · Original: Italian" />

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 font-semibold">Original document</h2>
        <div className="rounded-2xl bg-muted p-4 text-xs leading-5 text-muted-foreground">
          <p className="font-mono">Esami del sangue — 12/03/2026</p>
          <p className="font-mono">Ferritina: 8 ng/mL · Emoglobina: 13.1 g/dL · PCR: 2 mg/L</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Pill2 label="🇮🇹 Italian" />
          <Pill2 label="📄 PDF" />
        </div>
      </div>

      <InfoCard title="Plain-language summary">
        Your blood test from March 12 looks mostly within normal range. Iron stores (ferritin) appear lower
        than the reference range. Your doctor can confirm what this means for you.
      </InfoCard>

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 font-semibold">Abnormal values</h2>
        <div className="space-y-2">
          <ValueRow name="Ferritin" value="8 ng/mL" status="Low" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Flagged automatically. Not a diagnosis.</p>
      </div>

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 font-semibold">Translation</h2>
        <div className="rounded-2xl bg-secondary/50 p-4 text-sm leading-6 text-secondary-foreground">
          Blood test — March 12, 2026. Ferritin: 8 ng/mL. Hemoglobin: 13.1 g/dL. CRP: 2 mg/L.
        </div>
        <div className="mt-3 flex gap-2">
          <Pill2 label="🇬🇧 English" />
          <Pill2 label="🇯🇵 Japanese" />
        </div>
      </div>

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 font-semibold">Doctor-ready summary</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Patient: Milan Toth · 28 y · M. Recent lab (Italy, Mar 12): ferritin 8 ng/mL (low), hemoglobin
          13.1 g/dL (WNL), CRP 2 mg/L (WNL). No current medications. Patient currently in Japan.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button size="mobile" variant="calm">
          <Languages className="size-4" /> Translate
        </Button>
        <Button size="mobile" variant="calm">
          <Share2 className="size-4" /> Share
        </Button>
        <Button size="mobile" variant="wellness">
          <Download className="size-4" /> PDF
        </Button>
      </div>
    </ScreenStack>
  );
}

function TimelineScreen() {
  const events: {
    date: string;
    country?: string;
    language?: string;
    title: string;
    detail: string;
    Icon: LucideIcon;
  }[] = [
    {
      date: "March 12",
      country: "Italy",
      language: "Italian",
      title: "Blood test uploaded",
      detail: "Ferritin low, hemoglobin normal",
      Icon: FlaskConical,
    },
    {
      date: "March 13",
      language: "Italian → English",
      title: "Summary created",
      detail: "Doctor-ready translation generated",
      Icon: Languages,
    },
    {
      date: "March 15",
      country: "Japan",
      title: "Doctor Pack shared",
      detail: "Sent to Tokyo International Clinic",
      Icon: Share2,
    },
    {
      date: "March 18",
      country: "Japan",
      language: "Japanese",
      title: "Prescription added",
      detail: "Iron supplement, 30 days",
      Icon: Pill,
    },
  ];
  return (
    <ScreenStack>
      <Header title="Health Timeline" subtitle="Everything in one place — across countries and languages." />
      <FilterRow filters={["All", "Italy", "Japan", "Translations", "Shared"]} />
      <div className="space-y-3">
        {events.map(({ date, title, detail, Icon, country, language }) => (
          <div className="grid grid-cols-[72px_1fr] gap-3" key={title}>
            <p className="pt-4 text-xs font-semibold text-muted-foreground">{date}</p>
            <div className="medical-card rounded-2xl p-4">
              <div className="flex gap-3">
                <Icon className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {country && <BadgePill icon={MapPin} label={country} tone="teal" />}
                    {language && <BadgePill icon={Languages} label={language} tone="lavender" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenStack>
  );
}

function DoctorPackScreen({
  setScreen,
  extraLang,
  setExtraLang,
  profile,
  medications,
  generating,
  onGenerate,
}: {
  setScreen: (screen: ScreenKey) => void;
  extraLang: ExtraLanguage;
  setExtraLang: (lang: ExtraLanguage) => void;
  profile: Profile | null;
  medications: MedicationRow[];
  generating: boolean;
  onGenerate: () => void;
}) {
  const age = calculateAge(profile?.date_of_birth ?? null);
  const snapshot: [string, string][] = [];
  if (age !== null) snapshot.push(["Age", String(age)]);
  snapshot.push(["Sex", profile?.sex || "Not specified"]);
  if (profile?.conditions && profile.conditions.trim()) {
    snapshot.push(["Condition", profile.conditions]);
  }
  snapshot.push([
    "Current medications",
    activeMedicationsSummary(medications),
  ]);
  snapshot.push([
    "Allergies",
    profile?.allergies && profile.allergies.trim()
      ? profile.allergies
      : "None recorded",
  ]);
  snapshot.push(["Last test", "Mar 12 (Italy)"]);

  const languageOptions = Object.keys(extraLanguageMeta) as ExtraLanguage[];

  return (
    <ScreenStack>
      <Header
        title="Doctor Pack"
        subtitle="Create a doctor-ready summary for your next visit abroad."
      />

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="text-sm font-semibold">Your health snapshot</h2>
        <dl className="mt-4 space-y-2.5">
          {snapshot.map(([label, value]) => (
            <div className="flex items-baseline justify-between gap-4 text-sm" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="medical-card rounded-[1.75rem] p-5">
        <p className="text-sm font-semibold">Language for doctor</p>
        <p className="mt-1 text-xs text-muted-foreground">
          English is always included. Add one local language.
        </p>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm">
          <span className="font-medium">English 🇬🇧</span>
          <span className="text-xs font-semibold text-muted-foreground">Default</span>
        </div>

        <div className="mt-3">
          <Select
            value={extraLang}
            onValueChange={(v) => setExtraLang(v as ExtraLanguage)}
          >
            <SelectTrigger className="h-12 rounded-2xl bg-secondary border-0 text-sm font-medium">
              <SelectValue placeholder="Add translation language" />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {extraLanguageMeta[lang].flag} {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-3 text-xs text-muted-foreground">
            Doctor Pack will be available in English + {extraLang}
          </p>
        </div>
      </div>

      <Button
        className="w-full rounded-full"
        onClick={onGenerate}
        disabled={generating}
        size="mobile"
        variant="wellness"
      >
        <Sparkles className="size-4" />
        {generating ? "Generating Doctor Pack…" : "Generate Doctor Pack"}
      </Button>
    </ScreenStack>
  );
}

function DoctorPackResultScreen({
  extraLang,
  profile,
  medications,
  pack,
}: {
  extraLang: ExtraLanguage;
  profile: Profile | null;
  medications: MedicationRow[];
  pack: DoctorPack | null;
}) {
  const extra = extraLanguageMeta[extraLang];
  const [activeLang, setActiveLang] = useState<"English" | ExtraLanguage>("English");

  // ---- Parse the structured Doctor Pack response ----
  const raw: any =
    pack && typeof pack === "object" && "content" in pack ? (pack as any).content : pack;
  const parsed: any = (() => {
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return { _text: raw };
      }
    }
    return raw;
  })();

  const dp: any = parsed?.doctor_pack ?? {};
  const apiOverview: any = dp.patient_overview ?? {};
  const historySummary: any = dp.medical_history_summary ?? {};
  const recentActivities: any[] = Array.isArray(dp.recent_medical_activities)
    ? dp.recent_medical_activities
    : [];
  const apiMedications: any[] = Array.isArray(dp.current_medications)
    ? dp.current_medications
    : [];
  const abnormalValues: any[] = Array.isArray(dp.abnormal_values) ? dp.abnormal_values : [];
  // lab_explanation and lab_extracted intentionally ignored in MVP

  const docsProcessed: number | null =
    typeof parsed?.documents_processed === "number" ? parsed.documents_processed : null;
  const docsByType: Record<string, any> =
    parsed?.documents_by_type && typeof parsed.documents_by_type === "object"
      ? parsed.documents_by_type
      : {};

  // ---- Patient overview (prefer API, fall back to local profile) ----
  const formatSex = (s: any): string => {
    const v = typeof s === "string" ? s.trim().toUpperCase() : "";
    if (v === "F" || v === "FEMALE") return "Female";
    if (v === "M" || v === "MALE") return "Male";
    if (typeof s === "string" && s.trim()) return s;
    return "Not recorded";
  };
  const orRecorded = (v: any): string => {
    if (v === null || v === undefined) return "Not recorded";
    if (typeof v === "string") return v.trim() || "Not recorded";
    if (Array.isArray(v)) {
      const j = v.filter((x) => x != null && String(x).trim()).join(", ");
      return j || "Not recorded";
    }
    return String(v);
  };

  const localAge = calculateAge(profile?.date_of_birth ?? null);
  const localName = profile?.full_name || profile?.email?.split("@")[0] || "";
  const localLanguages = [profile?.preferred_language, profile?.other_languages]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(", ");

  const overviewName = orRecorded(apiOverview.name ?? apiOverview.full_name ?? localName);
  const overviewAge = orRecorded(
    apiOverview.age ?? (localAge !== null ? localAge : undefined),
  );
  const overviewSex = formatSex(apiOverview.sex ?? profile?.sex);
  const overviewLives = orRecorded(
    apiOverview.currently_lives ??
      apiOverview.current_location ??
      profile?.current_location,
  );
  const overviewHome = orRecorded(apiOverview.home_country ?? profile?.home_country);
  const overviewLangs = orRecorded(apiOverview.languages ?? localLanguages);

  const overviewRows: string[][] = [
    ["Name", overviewName],
    ["Age", overviewAge],
    ["Sex", overviewSex],
    ["Currently lives", overviewLives],
    ["Home country", overviewHome],
    ["Languages", overviewLangs],
  ];

  // ---- Medical history summary entries ----
  const historyLabels: Record<string, string> = {
    blood_tests: "Blood tests",
    doctor_letters: "Doctor letters",
    prescriptions: "Prescriptions",
    xray_reports: "Imaging / X-ray reports",
    imaging: "Imaging / X-ray reports",
    other: "Other",
  };
  const historyEntries: { label: string; text: string }[] = Object.entries(
    historySummary as Record<string, unknown>,
  )
    .map(([k, v]) => ({
      label: historyLabels[k] ?? humanize(k),
      text: typeof v === "string" ? v.trim() : "",
    }))
    .filter((e) => e.text.length > 0);

  // ---- Medications: merge API + local ----
  const apiMedNames: string[] = apiMedications
    .map((m) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object") {
        const name = m.name || m.medication || m.drug || "";
        const dose = m.dose || m.dosage || "";
        return [name, dose].filter(Boolean).join(" — ");
      }
      return "";
    })
    .filter((s) => s && s.trim());
  const localMedNames = activeMedicationNames(medications);
  const allMeds = Array.from(new Set([...apiMedNames, ...localMedNames]));

  // ---- Abnormal values normalized ----
  const abnormalNormalized = abnormalValues
    .map((v) => {
      if (typeof v === "string") return { label: v, detail: "" };
      if (v && typeof v === "object") {
        const label = v.name || v.test || v.label || "Finding";
        const detail = [v.value, v.unit].filter(Boolean).join(" ");
        const note = v.note || v.status || v.flag || "";
        return { label, detail: [detail, note].filter(Boolean).join(" · ") };
      }
      return null;
    })
    .filter((x): x is { label: string; detail: string } => x !== null);

  // Lab values intentionally not displayed in MVP


  // ---- Recent activity normalized ----
  const recentNormalized = recentActivities
    .map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const t = a.title || a.type || a.name || "";
        const d = a.date || a.when || "";
        const loc = a.location || a.country || "";
        return [t, [loc, d].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
      }
      return "";
    })
    .filter((s) => s && s.trim());

  const handleExportPDF = () => {
    const printable = document.getElementById("doctor-pack-printable");
    if (!printable) {
      toast.error("Doctor Pack content is not ready yet.");
      return;
    }

    const printWindow = window.open("", "doctor-pack-print", "width=900,height=1200");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>Doctor Pack</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; background: white; color: #111827; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.55; }
            body { padding: 18mm; }
            .print-document { max-width: 780px; margin: 0 auto; }
            .print-header { margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #dbe3f0; }
            h1 { margin: 0; font-size: 28px; line-height: 1.15; }
            h2 { margin: 0 0 12px; font-size: 17px; line-height: 1.25; }
            p { margin: 0; }
            ul { margin: 0; padding-left: 18px; }
            li { margin: 0 0 6px; }
            svg { width: 14px; height: 14px; color: #059669; }
            .no-print, button { display: none !important; }
            .doctor-pack-sections { display: block; }
            .medical-card { margin: 0 0 14px; padding: 18px; border: 1px solid #dbe3f0; border-radius: 18px; background: white; box-shadow: none; break-inside: avoid; page-break-inside: avoid; }
            .medical-card > div { max-width: 100%; }
            .text-muted-foreground { color: #5f6b7d; }
            .font-semibold, .font-medium { font-weight: 700; }
            .uppercase { text-transform: uppercase; letter-spacing: 0.04em; }
            .whitespace-pre-line { white-space: pre-line; }
            .safe-text { color: #059669; }
            .bg-destructive\/10 { background: #feecec; }
            .text-destructive { color: #dc2626; }
            .rounded-2xl { border-radius: 16px; }
            .rounded-full { border-radius: 999px; }
            .p-3 { padding: 12px; }
            .px-3 { padding-left: 12px; padding-right: 12px; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .justify-between { justify-content: space-between; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }
            .space-y-1 > * + * { margin-top: 4px; }
            .space-y-2 > * + * { margin-top: 8px; }
            .space-y-3 > * + * { margin-top: 12px; }
            .space-y-4 > * + * { margin-top: 16px; }
            @media print { body { padding: 0; } .medical-card { margin-bottom: 12px; } }
          </style>
        </head>
        <body>
          <main class="print-document">
            <header class="print-header">
              <h1>Doctor Pack</h1>
              <p class="text-muted-foreground">Optimized for your doctor visit</p>
            </header>
            ${printable.innerHTML}
          </main>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const handleShare = async () => {
    const shareData = {
      title: "Doctor Pack",
      text: "Doctor Pack summary is ready for review.",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Share link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share Doctor Pack.");
    }
  };

  return (
    <ScreenStack>
      <Header title="Doctor Pack" subtitle="Optimized for your visit in Tokyo" />

      <div id="doctor-pack-printable" className="doctor-pack-sections flex flex-col gap-5">

      <div className="medical-card rounded-[1.75rem] p-5 no-print">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Doctor Pack available in
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="font-medium">English 🇬🇧</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">
            {extra.label} {extra.flag}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
          {(["English", extraLang] as const).map((lang) => {
            const active = lang === activeLang;
            const flag = lang === "English" ? "🇬🇧" : extraLanguageMeta[lang as ExtraLanguage].flag;
            return (
              <button
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                key={lang}
                onClick={() => setActiveLang(lang)}
                type="button"
              >
                {flag} {lang}
              </button>
            );
          })}
        </div>
      </div>

      <div data-pdf-section>
        <SummaryCard title="Patient overview" rows={overviewRows} />
      </div>

      {historyEntries.length > 0 && (
        <div data-pdf-section>
          <div className="medical-card rounded-[1.75rem] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Medical history summary</h2>
            </div>
            <div className="space-y-4">
              {historyEntries.map((e) => (
                <div key={e.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {e.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-foreground whitespace-pre-line">
                    {e.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div data-pdf-section>
        <ListCard
          title="Current medications"
          items={
            allMeds.length > 0
              ? allMeds
              : ["No current medications found in uploaded documents."]
          }
        />
      </div>

      <div data-pdf-section>
        <div className="medical-card rounded-[1.75rem] p-5">
          <h2 className="mb-3 font-semibold">Abnormal / important findings</h2>
          {abnormalNormalized.length > 0 ? (
            <div className="space-y-2">
              {abnormalNormalized.map((v, i) => (
                <div
                  key={`${v.label}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{v.label}</p>
                    {v.detail && (
                      <p className="text-xs text-muted-foreground">{v.detail}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-semibold text-destructive">
                    Flagged
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No abnormal values detected.</p>
          )}
        </div>
      </div>

      <div data-pdf-section>
        <div className="medical-card rounded-[1.75rem] p-5">
          <h2 className="mb-3 font-semibold">Recent medical activity</h2>
          {recentNormalized.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
              {recentNormalized.map((s, i) => (
                <li key={`${s}-${i}`}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No recent medical activity found.</p>
          )}
        </div>
      </div>

      {(docsProcessed !== null || Object.keys(docsByType).length > 0) && (
        <div data-pdf-section>
          <div className="medical-card rounded-[1.75rem] p-5">
            <h2 className="mb-3 font-semibold">Document summary</h2>
            {docsProcessed !== null && (
              <p className="text-sm">
                <span className="text-muted-foreground">Documents processed: </span>
                <span className="font-semibold">{docsProcessed}</span>
              </p>
            )}
            {Object.keys(docsByType).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(docsByType).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{humanize(k)}</span>
                    <span className="font-medium">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 no-print">
        <Button size="mobile" variant="wellness" onClick={handleExportPDF}>
          <Download className="size-4" /> Export PDF
        </Button>
        <Button size="mobile" variant="calm" onClick={handleShare}>
          <Share2 className="size-4" /> Share
        </Button>
      </div>
    </ScreenStack>
  );
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SPECIALTIES = [
  "General practitioner",
  "Gastroenterologist",
  "Dermatologist",
  "Pediatrician",
  "Gynecologist",
  "Dentist",
  "Emergency clinic",
];

const LANGUAGES = ["English", "Japanese", "German", "Spanish", "Italian", "Russian"];

function FindCareScreen() {
  const { profile } = useAuth();
  const defaultLocation = profile?.current_location || "Tokyo, Japan";
  const [location, setLocation] = useState(defaultLocation);
  const [specialty, setSpecialty] = useState("Gastroenterologist");
  const [language, setLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ClinicResult[] | null>(null);

  const handleSearch = async () => {
    const cacheKey = `findcare:${location}|${specialty}|${language}`.toLowerCase();
    const cached = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    if (cached) {
      try {
        setResults(JSON.parse(cached) as ClinicResult[]);
        setError(null);
        return;
      } catch {
        // ignore parse errors and fetch fresh
      }
    }
    setLoading(true);
    setError(null);
    try {
      const { searchClinics } = await import("@/lib/find-care.functions");
      const res = await searchClinics({ data: { location, specialty, language } });
      setResults(res.clinics);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(res.clinics));
      } catch {
        // storage may be unavailable; ignore
      }
    } catch (e) {
      console.error(e);
      setError("We couldn’t complete the search. Please try again.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenStack>
      <Header
        title="Find care"
        subtitle="Search clinics and doctors that match your location, specialty, and language."
      />

      <div className="medical-card space-y-3 rounded-[1.75rem] p-4">
        <FieldRow icon={MapPin} label="Location">
          <LocationAutocomplete
            value={location}
            onChange={setLocation}
            placeholder="Tokyo, Japan"
          />
        </FieldRow>
        <FieldRow icon={Stethoscope} label="Specialty">
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none"
          >
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow icon={Languages} label="Language">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FieldRow>
        <Button
          size="mobile"
          variant="wellness"
          className="w-full"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <>
              <Search className="size-4 animate-pulse" /> Searching clinics…
            </>
          ) : (
            <>
              <Search className="size-4" /> Find care
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="medical-card rounded-[1.5rem] p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {results && results.length === 0 && !loading && (
        <div className="medical-card rounded-[1.5rem] p-4 text-sm text-muted-foreground">
          No matching clinics found. Try changing the specialty, location, or language.
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((c) => (
            <div className="medical-card rounded-[1.75rem] p-5" key={c.url}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{c.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {specialty}
                    {c.area ? ` · ${c.area}` : ""}
                  </p>
                </div>
                {c.rating && (
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    ★ {c.rating}
                  </span>
                )}
              </div>

              {(() => {
                const tone =
                  c.languageSignal === "confirmed"
                    ? "bg-wellness-teal text-accent-foreground"
                    : c.languageSignal === "weak"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground";
                const label =
                  c.languageSignal === "confirmed"
                    ? `✅ ${language}-speaking staff`
                    : c.languageSignal === "weak"
                      ? `⚠️ ${language} mentioned`
                      : "❓ Language not confirmed";
                return (
                  <div
                    className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${tone}`}
                  >
                    <Languages className="size-3.5" />
                    {label}
                  </div>
                );
              })()}

              {c.snippet && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{c.snippet}</p>
              )}

              <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                Source: {c.domain}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button size="mobile" variant="wellness" asChild>
                  <a href={c.url} target="_blank" rel="noreferrer noopener">
                    Open website
                  </a>
                </Button>
                {c.phone && (
                  <Button size="mobile" variant="calm" asChild>
                    <a href={`tel:${c.phone.replace(/\s+/g, "")}`}>
                      <Phone className="size-4" /> Call
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Results are based on publicly available clinic websites and web search results. Please confirm
        language availability directly with the clinic before booking.
      </p>
    </ScreenStack>
  );
}

function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card">
        <Icon className="size-4 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function BottomNav({
  screen,
  setScreen,
}: {
  screen: ScreenKey;
  setScreen: (screen: ScreenKey) => void;
}) {
  const tabs: { key: ScreenKey; label: string; icon: LucideIcon }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "records", label: "Records", icon: FileText },
    { key: "add", label: "Add", icon: Plus },
    { key: "doctor", label: "Doctor Pack", icon: Stethoscope },
    { key: "find", label: "Find Care", icon: Search },
  ];
  const recordsScreens: ScreenKey[] = [
    "records",
    "recordsCategory",
    "documentDetail",
    "medicationDetail",
    "explainSelect",
    "explainResult",
  ];
  const isActive = (key: ScreenKey) => {
    if (key === "records") return recordsScreens.includes(screen);
    return screen === key;
  };
  return (
    <nav className="grid grid-cols-5 gap-1 border-t border-border bg-card/95 px-2 pt-2 pb-3">
      {tabs.map(({ key, label, icon: Icon }) => {
        const active = isActive(key);
        return (
          <button
            className={`flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[11px] font-medium leading-none transition ${
              active
                ? "border border-primary/40 bg-secondary text-primary"
                : "border border-transparent text-muted-foreground hover:bg-muted"
            }`}
            key={key}
            onClick={() => setScreen(key)}
            type="button"
          >
            <Icon className="size-5 shrink-0" />
            <span className="text-center leading-none">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ScreenStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Badge({ children, icon: Icon }: { children: React.ReactNode; icon: LucideIcon }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold text-primary shadow-card">
      <Icon className="size-4" />
      {children}
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="medical-card rounded-[1.5rem] p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      <Icon className="mb-4 size-6 text-primary" />
      <p className="text-sm font-semibold leading-5">{label}</p>
    </button>
  );
}

function DoctorPackActionCard({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="relative overflow-hidden rounded-[1.5rem] border border-primary/20 bg-gradient-to-br from-wellness-lavender via-card to-wellness-teal/40 p-4 text-left shadow-card transition hover:-translate-y-0.5 active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      <Stethoscope className="mb-4 size-6 text-primary" />
      <p className="text-sm font-semibold leading-5">Create Doctor Pack</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">
        Doctor-ready summary
      </p>
    </button>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="medical-card rounded-[1.75rem] p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="medical-card rounded-[1.75rem] p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div className="flex gap-3 text-sm leading-5" key={item}>
            <Check className="mt-0.5 size-4 shrink-0 safe-text" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="medical-card rounded-[1.75rem] p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div className="flex items-start justify-between gap-4 text-sm" key={label}>
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabValues() {
  const values: [string, string, "Low" | "Normal"][] = [
    ["Ferritin", "8 ng/mL", "Low"],
    ["Hemoglobin", "13.1 g/dL", "Normal"],
    ["CRP", "2 mg/L", "Normal"],
  ];
  return (
    <div className="medical-card rounded-[1.75rem] p-5">
      <h2 className="mb-4 font-semibold">Extracted values</h2>
      <div className="space-y-3">
        {values.map(([name, value, status]) => (
          <ValueRow key={name} name={name} value={value} status={status} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        We flag values outside reference range. We do not diagnose.
      </p>
    </div>
  );
}

function ValueRow({
  name,
  value,
  status,
}: {
  name: string;
  value: string;
  status: "Low" | "Normal" | "High";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3 text-sm">
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          status === "Normal" ? "bg-accent safe-text" : "bg-destructive/10 text-destructive"
        }`}
      >
        {status}
      </span>
    </div>
  );
}

function WarningCard({ text }: { text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/10 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="size-5 shrink-0 text-destructive" />
        <p className="text-sm leading-6 text-foreground">{text}</p>
      </div>
    </div>
  );
}

function FilterRow({ filters }: { filters: string[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {filters.map((filter, index) => (
        <span
          className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${
            index === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          }`}
          key={filter}
        >
          {filter}
        </span>
      ))}
    </div>
  );
}

function FilterGroup({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {options.map((opt, i) => (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              i === 0
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
            key={opt}
          >
            {opt}
          </span>
        ))}
      </div>
    </div>
  );
}

function BadgePill({
  icon: Icon,
  label,
  tone,
}: {
  icon?: LucideIcon;
  label: string;
  tone: "teal" | "lavender";
}) {
  const cls = tone === "teal" ? "bg-wellness-teal text-accent-foreground" : "bg-wellness-lavender text-secondary-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {Icon && <Icon className="size-3" />}
      {label}
    </span>
  );
}

function Pill2({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
      {label}
    </span>
  );
}

function SearchField({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
      <Icon className="size-4 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function SelectDocumentScreen({
  title,
  subtitle,
  docs,
  onSelect,
}: {
  title: string;
  subtitle: string;
  docs: MedDocument[];
  onSelect: (id: string) => void;
}) {
  return (
    <ScreenStack>
      <Header title={title} subtitle={subtitle} />
      {docs.length === 0 ? (
        <div className="medical-card rounded-2xl p-5 text-sm text-muted-foreground">
          No documents available.
        </div>
      ) : (
        <div className="space-y-2.5">
          {docs.map((doc) => (
            <button
              className="medical-card flex w-full items-center gap-3 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 active:scale-[0.98]"
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              type="button"
            >
              <doc.Icon className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{doc.type}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {doc.date} · {doc.language}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </ScreenStack>
  );
}

function DocumentDetailScreen({
  doc,
  onBack,
}: {
  doc: MedDocument | null;
  onBack: () => void;
}) {
  if (!doc) {
    return (
      <ScreenStack>
        <Header title="Document" subtitle="No document selected." />
        <Button onClick={onBack} size="mobile" variant="wellness">
          Back to records
        </Button>
      </ScreenStack>
    );
  }

  // Category-specific metadata rows (no country)
  const rows: [string, string][] = [];
  if (doc.category === "Imaging & Scans") {
    rows.push(["Document type", doc.type]);
    rows.push(["Scan type", doc.type]);
    rows.push(["Date", doc.date]);
    rows.push(["Original language", doc.language]);
  } else if (doc.category === "Doctor Letters") {
    rows.push(["Document type", doc.type]);
    rows.push(["Date", doc.date]);
    rows.push(["Original language", doc.language]);
  } else if (doc.category === "Medications") {
    rows.push(["Document type", doc.type]);
    rows.push(["Date", doc.date]);
    rows.push(["Original language", doc.language]);
  } else {
    // Other / Unknown
    rows.push(["Document type", doc.type]);
    rows.push(["Date", doc.date]);
    rows.push(["Original language", doc.language]);
    rows.push(["Status", "Needs review"]);
  }

  const subtitle =
    doc.category === "Other / Unknown"
      ? `${doc.category} · Needs review`
      : `${doc.category} · ${doc.date}`;

  return (
    <ScreenStack>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        ← Back to records
      </button>
      <Header title={doc.type} subtitle={subtitle} />

      <div className="medical-card rounded-[1.75rem] p-5">
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
          <doc.Icon className="size-5 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{doc.type}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doc.date} · {doc.language}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-2.5">
          {rows.map(([label, value]) => (
            <div className="flex items-baseline justify-between gap-4 text-sm" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Button size="mobile" variant="wellness">
        <FileText className="size-4" /> Open document
      </Button>
      <Button onClick={onBack} size="mobile" variant="calm">
        Back to records
      </Button>
    </ScreenStack>
  );
}

function MedicationCard({
  med,
  onOpen,
  onToggleStatus,
  onDelete,
}: {
  med: MedicationRow;
  onOpen: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const isActive = med.status === "active";
  const detailParts = [med.dosage, med.frequency, med.duration]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return (
    <div className="medical-card rounded-2xl p-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left"
      >
        <Pill className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{med.name}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isActive
                  ? "bg-wellness-teal text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isActive ? "Active" : "Stopped"}
            </span>
          </div>
          {detailParts.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {detailParts.join(" · ")}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {med.source_label || medSourceLabel(med.source)}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onToggleStatus}
          className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted"
        >
          {isActive ? "Mark as stopped" : "Mark as active"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-destructive/30 bg-card px-3 py-1 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function MedicationDetailScreen({
  medication,
  onBack,
  onOpenSource,
  onAfterChange,
}: {
  medication: MedicationRow | null;
  onBack: () => void;
  onOpenSource: () => void;
  onAfterChange: () => void;
}) {
  if (!medication) {
    return (
      <ScreenStack>
        <Header title="Medication" subtitle="No medication selected." />
        <Button onClick={onBack} size="mobile" variant="wellness">
          Back to records
        </Button>
      </ScreenStack>
    );
  }

  const rows: [string, string][] = [["Medication", medication.name]];
  if (medication.dosage) rows.push(["Dosage", medication.dosage]);
  if (medication.frequency) rows.push(["Frequency", medication.frequency]);
  if (medication.duration) rows.push(["Duration", medication.duration]);
  if (medication.instructions)
    rows.push(["Instructions", medication.instructions]);
  rows.push([
    "Source",
    medication.source_label || medSourceLabel(medication.source),
  ]);
  if (medication.language) rows.push(["Original language", medication.language]);
  rows.push(["Status", medication.status === "active" ? "Active" : "Stopped"]);

  const isActive = medication.status === "active";
  const isManual = medication.source === "manual";

  return (
    <ScreenStack>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        ← Back to records
      </button>
      <Header
        title={medication.name}
        subtitle={
          [medication.dosage, medication.frequency]
            .filter(Boolean)
            .join(" · ") || "Medication details"
        }
      />

      <div className="medical-card rounded-[1.75rem] p-5">
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
          <Pill className="size-5 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{medication.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {medication.source_label || medSourceLabel(medication.source)}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-2.5">
          {rows.map(([label, value]) => (
            <div
              className="flex items-baseline justify-between gap-4 text-sm"
              key={label}
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="ml-4 text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-2">
        <Button
          size="mobile"
          variant="wellness"
          onClick={async () => {
            try {
              await updateMedicationStatus(
                medication.id,
                isActive ? "stopped" : "active",
              );
              onAfterChange();
              onBack();
            } catch (e) {
              console.error(e);
            }
          }}
        >
          {isActive ? "Mark as stopped" : "Mark as active"}
        </Button>
        {!isManual && medication.source_doc_id && (
          <Button onClick={onOpenSource} size="mobile" variant="calm">
            <FileText className="size-4" /> Open source document
          </Button>
        )}
        <Button
          size="mobile"
          variant="ghost"
          onClick={async () => {
            try {
              await deleteMedication(medication.id);
              onAfterChange();
              onBack();
            } catch (e) {
              console.error(e);
            }
          }}
        >
          Delete medication
        </Button>
        <Button onClick={onBack} size="mobile" variant="calm">
          Back to records
        </Button>
      </div>
    </ScreenStack>
  );
}

function LabExplanationScreen({
  doc,
  setScreen,
}: {
  doc: MedDocument | null;
  setScreen: (screen: ScreenKey) => void;
}) {
  const subtitle = doc
    ? doc.type || `${doc.type ?? ""}${doc.date ? ` · ${doc.date}` : ""}`.trim() || "Uploaded lab result"
    : "No lab result selected.";

  return (
    <ScreenStack>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-wellness-lavender px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
          <Sparkles className="size-3" />
          Demo analysis
        </span>
      </div>
      <Header title="Lab Results Analysis" subtitle={subtitle} />

      {!doc && (
        <Button onClick={() => setScreen("explainSelect")} size="mobile" variant="wellness">
          Choose lab results
        </Button>
      )}

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 text-sm font-semibold">Key values</h2>
        <div className="space-y-2">
          <ValueRow name="Hemoglobin" value="13.1 g/dL" status="Normal" />
          <ValueRow name="Ferritin" value="8 ng/mL" status="Low" />
          <ValueRow name="CRP" value="2 mg/L" status="Normal" />
          <ValueRow name="Vitamin D" value="18 ng/mL" status="Low" />
        </div>
      </div>

      <InfoCard title="Simple explanation">
        Most values look normal. Ferritin and Vitamin D are below the typical range, which may
        suggest low iron stores and low vitamin D levels. A clinician can confirm what this means
        for you.
      </InfoCard>

      <div className="medical-card rounded-[1.75rem] p-5">
        <h2 className="mb-3 text-sm font-semibold">Suggested questions for your doctor</h2>
        <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
          <li>• Should I start or adjust iron supplementation?</li>
          <li>• Do I need additional tests such as transferrin, B12, or vitamin D follow-up?</li>
          <li>• When should I repeat this blood test?</li>
        </ul>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-muted/40 p-4">
        <p className="text-xs leading-5 text-muted-foreground">
          This explanation is for informational purposes only and is not a diagnosis. Please
          confirm results with a clinician.
        </p>
      </div>

      <Button
        onClick={() => setScreen(doc ? "recordsCategory" : "explainSelect")}
        size="mobile"
        variant="calm"
      >
        {doc ? "Back to records" : "Choose different result"}
      </Button>
    </ScreenStack>
  );
}

// Unused exports preserved to avoid TS warnings on imports
void HeartPulse;
void WarningCard;
void Activity;
