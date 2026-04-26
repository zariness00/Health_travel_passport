import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    void navigate({ to: profile?.onboarded ? "/" : "/onboarding" });
  }, [session, profile, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created");
  };

  return (
    <main className="wellness-shell min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-[420px] space-y-6">
        <div className="flex items-center justify-center gap-3 pb-2">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Globe2 className="size-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Health</p>
            <p className="text-lg font-semibold leading-tight">Passport</p>
          </div>
        </div>
        <div className="medical-card space-y-6 rounded-[2rem] p-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold leading-tight">Create your account</h1>
            <p className="text-sm leading-6 text-muted-foreground">Start your health passport</p>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Email</span>
              <Input
                autoComplete="email"
                className="h-11 rounded-xl"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Password</span>
              <Input
                autoComplete="new-password"
                className="h-11 rounded-xl"
                minLength={6}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                type="password"
                value={password}
              />
            </label>
            <Button
              className="w-full"
              disabled={submitting}
              size="mobile"
              type="submit"
              variant="wellness"
            >
              {submitting ? "Creating…" : "Continue"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-semibold text-primary" to="/login">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
