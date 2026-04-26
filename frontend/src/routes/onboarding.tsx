import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Globe2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { MultiSelectChips } from "@/components/MultiSelectChips";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

const SEX_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"] as const;

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<string>("");
  const [homeCountry, setHomeCountry] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showError, setShowError] = useState(false);

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

  const save = async (markOnboarded: boolean) => {
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
        onboarded: markOnboarded,
      })
      .eq("id", user.id);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    try {
      await syncManualMedications(user.id, medications, "onboarding");
    } catch (e) {
      console.error("Failed to sync medications", e);
    }
    setSubmitting(false);
    await refreshProfile();
    toast.success(markOnboarded ? "Profile saved" : "Saved for later");
    void navigate({ to: "/" });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!stepValid) {
      setShowError(true);
      return;
    }
    setShowError(false);
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    void save(true);
  };

  const stepValid = useMemo(() => {
    if (step === 1) return fullName.trim().length > 0 && !!dob && !!sex;
    if (step === 2)
      return (
        homeCountry.trim().length > 0 &&
        currentLocation.trim().length > 0 &&
        !!preferredLanguage
      );
    return true;
  }, [step, fullName, dob, sex, homeCountry, currentLocation, preferredLanguage]);

  return (
    <main className="wellness-shell min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-[480px] space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Globe2 className="size-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Health</p>
            <p className="text-lg font-semibold leading-tight">Passport</p>
          </div>
        </div>

        <div className="medical-card rounded-[2rem] p-6">
          <div className="space-y-3 text-center">
            <Stepper current={step} total={3} />
            <h1 className="text-2xl font-semibold leading-tight">
              {step === 1 && "Basic info"}
              {step === 2 && "Location & language"}
              {step === 3 && "Health info"}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {step === 1 && "A few details to set up your health passport."}
              {step === 2 && "Helps us tailor care recommendations."}
              {step === 3 && "Optional — you can update these any time."}
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {step === 1 && (
              <>
                <Field
                  label="Full name"
                  required
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Milan Toth"
                />
                <Field
                  label="Date of birth"
                  required
                  type="date"
                  value={dob}
                  onChange={setDob}
                />
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Sex <span className="text-destructive">*</span>
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
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Home country <span className="text-destructive">*</span>
                  </span>
                  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                    <LocationAutocomplete
                      value={homeCountry}
                      onChange={setHomeCountry}
                      placeholder="Italy"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Current city and country{" "}
                    <span className="text-destructive">*</span>
                  </span>
                  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                    <LocationAutocomplete
                      value={currentLocation}
                      onChange={setCurrentLocation}
                      placeholder="Tokyo, Japan"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Preferred language <span className="text-destructive">*</span>
                  </span>
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
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Other languages (optional)
                  </span>
                  <MultiSelectChips
                    value={otherLanguages}
                    onChange={setOtherLanguages}
                    options={LANGUAGES}
                    placeholder="Add languages you also speak"
                    allowCustom
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Current medications (optional)
                  </span>
                  <MultiSelectChips
                    value={medications}
                    onChange={setMedications}
                    options={MEDICATIONS}
                    placeholder="Search medications…"
                    allowCustom
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Known allergies (optional)
                  </span>
                  <MultiSelectChips
                    value={allergies}
                    onChange={setAllergies}
                    options={ALLERGIES}
                    placeholder="Search allergies…"
                    allowCustom
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Ongoing conditions (optional)
                  </span>
                  <MultiSelectChips
                    value={conditions}
                    onChange={setConditions}
                    options={CONDITIONS}
                    placeholder="Search conditions…"
                    allowCustom
                  />
                </div>
              </>
            )}

            {showError && !stepValid && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                Please complete required fields to continue.
              </p>
            )}

            <div className="grid gap-2 pt-2">
              <div className="flex gap-2">
                {step > 1 && (
                  <Button
                    className="flex-1"
                    disabled={submitting}
                    onClick={() => setStep((s) => s - 1)}
                    size="mobile"
                    type="button"
                    variant="calm"
                  >
                    <ChevronLeft className="size-4" /> Back
                  </Button>
                )}
                <Button
                  className="flex-1"
                  disabled={submitting}
                  size="mobile"
                  type="submit"
                  variant="wellness"
                >
                  {step < 3 ? (
                    <>
                      Next <ChevronRight className="size-4" />
                    </>
                  ) : submitting ? (
                    "Saving…"
                  ) : (
                    "Save profile"
                  )}
                </Button>
              </div>
              {step === 3 && (
                <Button
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void save(false)}
                  size="mobile"
                  type="button"
                  variant="ghost"
                >
                  Skip for now
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const active = i + 1 <= current;
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              active ? "w-8 bg-primary" : "w-4 bg-muted"
            }`}
          />
        );
      })}
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
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
