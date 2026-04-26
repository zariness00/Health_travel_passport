import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (session) {
      void navigate({ to: profile?.onboarded ? "/" : "/onboarding" });
    }
  }, [session, profile, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
  };

  return (
    <AuthShell>
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold leading-tight">Welcome back</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Your medical records in one place — ready for any doctor worldwide
        </p>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        <Button
          className="w-full"
          disabled={submitting}
          size="mobile"
          type="submit"
          variant="wellness"
        >
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          className="font-semibold text-muted-foreground hover:text-foreground"
          onClick={async () => {
            if (!email) {
              toast.error("Enter your email first");
              return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/login`,
            });
            if (error) toast.error(error.message);
            else toast.success("Reset email sent");
          }}
          type="button"
        >
          Forgot password?
        </button>
        <Link className="font-semibold text-primary" to="/signup">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
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
        <div className="medical-card space-y-6 rounded-[2rem] p-6">{children}</div>
      </div>
    </main>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        autoComplete={autoComplete}
        className="h-11 rounded-xl"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
