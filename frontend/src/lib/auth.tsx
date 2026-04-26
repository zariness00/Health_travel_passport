import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { getBackendProfile, patchBackendProfile } from "@/lib/api";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  home_country: string | null;
  current_location: string | null;
  preferred_language: string | null;
  other_languages: string | null;
  medications: string | null;
  medications_json: string | null;
  allergies: string | null;
  conditions: string | null;
  onboarded: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    let local = (data as Profile | null) ?? null;

    // Best-effort: pull backend profile and merge core fields back into local cache.
    try {
      const backend = await getBackendProfile();
      const backendFullName = [backend.first_name, backend.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (local) {
        local = {
          ...local,
          full_name: local.full_name ?? (backendFullName || null),
          date_of_birth: local.date_of_birth ?? backend.date_of_birth ?? null,
          sex: local.sex ?? backend.sex ?? null,
        };
      }

      // If our local Lovable Cloud profile has core fields the backend
      // doesn't, push them up so the backend stays in sync after onboarding.
      if (local) {
        const localFullName = (local.full_name ?? "").trim();
        const [first, ...rest] = localFullName.split(/\s+/);
        const last = rest.join(" ");
        const patch: Record<string, string> = {};
        if (first && first !== (backend.first_name ?? "")) patch.first_name = first;
        if (last && last !== (backend.last_name ?? "")) patch.last_name = last;
        if (local.date_of_birth && local.date_of_birth !== backend.date_of_birth)
          patch.date_of_birth = local.date_of_birth;
        if (local.sex && local.sex !== backend.sex) patch.sex = local.sex;
        if (Object.keys(patch).length > 0) {
          void patchBackendProfile(patch).catch((e) =>
            console.warn("Backend profile sync failed", e),
          );
        }
      }
    } catch (e) {
      console.warn("Backend /profile unavailable", e);
    }

    setProfile(local);
  };

  useEffect(() => {
    // Set up listener BEFORE getSession
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        // Defer with setTimeout to avoid deadlock
        setTimeout(() => {
          void loadProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
