import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { supabase } from "@/integrations/supabase/client";
import { patchBackendProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  ALLERGIES,
  CONDITIONS,
  LANGUAGES,
  MEDICATIONS,
  joinCsv,
  splitCsv,
} from "@/lib/health-suggestions";
import { syncManualMedications } from "@/lib/medications";

export const Route = createFileRoute("/profile")({
  component: EditProfilePage,
});

const SEX_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"] as const;

function EditProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [homeCountry, setHomeCountry] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) void navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setDob(profile.date_of_birth ?? "");
    setSex(profile.sex ?? "");
    setHomeCountry(profile.home_country ?? "");
    setCurrentLocation(profile.current_location ?? "");
    setPreferredLanguage(profile.preferred_language ?? "");
    setOtherLanguages(splitCsv(profile.other_languages));
    setMedications(splitCsv(profile.medications));
    setAllergies(splitCsv(profile.allergies));
    setConditions(splitCsv(profile.conditions));
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        date_of_birth: dob || null,
        sex: sex || null,
        home_country: homeCountry || null,
        current_location: currentLocation || null,
        preferred_language: preferredLanguage || null,
        other_languages: joinCsv(otherLanguages) || null,
        medications: joinCsv(medications) || null,
        allergies: joinCsv(allergies) || null,
        conditions: joinCsv(conditions) || null,
      })
      .eq("id", user.id);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    try {
      await syncManualMedications(user.id, medications);
    } catch (err) {
      console.error("Failed to sync medications", err);
    }
    // Best-effort sync of core fields to backend.
    try {
      const trimmed = (fullName || "").trim();
      const [first, ...rest] = trimmed.split(/\s+/);
      await patchBackendProfile({
        first_name: first || "",
        last_name: rest.join(" "),
        date_of_birth: dob || undefined,
        sex: sex || undefined,
      });
    } catch (err) {
      console.warn("Backend profile PATCH failed", err);
    }
    await refreshProfile();
    setSubmitting(false);
    toast.success("Profile updated");
    void navigate({ to: "/" });
  };

  return (
    <main className="wellness-shell min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-[480px] space-y-5">
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to home
        </button>

        <div className="medical-card rounded-[2rem] p-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold leading-tight">
              Edit health profile
            </h1>
            <p className="text-sm text-muted-foreground">
              Update your personal, location, and health information.
            </p>
          </div>

          <form className="mt-6 space-y-5" onSubmit={onSubmit}>
            <Section title="Basic info">
              <Field
                label="Full name"
                value={fullName}
                onChange={setFullName}
                placeholder="Milan Toth"
              />
              <Field
                label="Date of birth"
                type="date"
                value={dob}
                onChange={setDob}
              />
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Sex
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SEX_OPTIONS.map((option) => {
                    const active = sex === option;
                    return (
                      <button
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "border-primary bg-secondary text-primary"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                        key={option}
                        onClick={() => setSex(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>

            <Section title="Location & language">
              <LabelRow label="Home country">
                <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <LocationAutocomplete
                    value={homeCountry}
                    onChange={setHomeCountry}
                    placeholder="Italy"
                  />
                </div>
              </LabelRow>
              <LabelRow label="Current city and country">
                <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <LocationAutocomplete
                    value={currentLocation}
                    onChange={setCurrentLocation}
                    placeholder="Tokyo, Japan"
                  />
                </div>
              </LabelRow>
              <LabelRow label="Preferred language">
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a language</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </LabelRow>
              <LabelRow label="Other languages">
                <MultiSelectChips
                  value={otherLanguages}
                  onChange={setOtherLanguages}
                  options={LANGUAGES}
                  placeholder="Add languages you also speak"
                  allowCustom
                />
              </LabelRow>
            </Section>

            <Section title="Health info">
              <LabelRow label="Current medications">
                <MultiSelectChips
                  value={medications}
                  onChange={setMedications}
                  options={MEDICATIONS}
                  placeholder="Search medications…"
                  allowCustom
                />
              </LabelRow>
              <LabelRow label="Known allergies">
                <MultiSelectChips
                  value={allergies}
                  onChange={setAllergies}
                  options={ALLERGIES}
                  placeholder="Search allergies…"
                  allowCustom
                />
              </LabelRow>
              <LabelRow label="Ongoing conditions">
                <MultiSelectChips
                  value={conditions}
                  onChange={setConditions}
                  options={CONDITIONS}
                  placeholder="Search conditions…"
                  allowCustom
                />
              </LabelRow>
            </Section>

            <div className="grid gap-2 pt-2">
              <Button
                className="w-full"
                disabled={submitting}
                size="mobile"
                type="submit"
                variant="wellness"
              >
                {submitting ? "Saving…" : "Save changes"}
              </Button>
              <Button
                className="w-full"
                disabled={submitting}
                onClick={() => void navigate({ to: "/" })}
                size="mobile"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {title}
      </p>
      {children}
    </div>
  );
}

function LabelRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <Input
        className="h-11 rounded-xl"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
