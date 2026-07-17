"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();

    const { data, error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });

    setPending(false);

    if (authError) {
      // Surface the provider's message rather than a generic one — "invalid
      // credentials" vs "password too short" are different fixes for the user.
      setError(authError.message);
      return;
    }

    // Signup only needs a confirmation step when the project requires one. With
    // confirmations off, signUp returns a session and we go straight in.
    if (mode === "signup" && !data.session) {
      setNotice(t("checkEmail"));
      return;
    }

    router.push(`/${locale}/dashboard`);
    router.refresh();
  }

  async function onOAuth() {
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${location.origin}/auth/callback?locale=${locale}`,
      },
    });
    if (authError) setError(authError.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("email")}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("password")}</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {notice && <p className="text-muted-foreground text-sm">{notice}</p>}

        <Button type="submit" disabled={pending}>
          {pending ? t("working") : mode === "signin" ? t("signIn") : t("signUp")}
        </Button>
      </form>

      <Button variant="outline" onClick={onOAuth} disabled={pending}>
        {t("continueWithGithub")}
      </Button>

      <button
        type="button"
        className="text-muted-foreground text-sm underline underline-offset-4"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
      >
        {mode === "signin" ? t("needAccount") : t("haveAccount")}
      </button>
    </div>
  );
}
