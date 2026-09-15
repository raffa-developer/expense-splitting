import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/api";
import { useAuth } from "@/auth";
import { errorMessage, useI18n } from "@/lib/i18n";

type Mode = "login" | "register";

export function LoginPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success(t("auth.welcomeBack"));
      } else {
        await register(name, email, password);
        toast.success(t("auth.accountCreated"));
      }
    } catch (err) {
      if (
        mode === "register" &&
        err instanceof ApiError &&
        err.code === "EMAIL_TAKEN"
      ) {
        setMode("login");
        setError(t("auth.emailTaken"));
      } else {
        setError(errorMessage(err, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
      subtitle={t("auth.subtitle")}
    >
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setError(null);
        }}
        className="mb-4"
      >
        <TabsList className="w-full">
          <TabsTrigger value="login">{t("auth.loginTab")}</TabsTrigger>
          <TabsTrigger value="register">{t("auth.registerTab")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <div className="space-y-2">
            <Label htmlFor="name">{t("auth.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("auth.namePlaceholder")}
              required
              autoComplete="name"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={
              mode === "register"
                ? t("auth.passwordPlaceholderRegister")
                : t("auth.passwordPlaceholder")
            }
            required
            minLength={mode === "register" ? 8 : 1}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting
            ? t("auth.submitting")
            : mode === "login"
              ? t("auth.submitLogin")
              : t("auth.submitRegister")}
        </Button>
      </form>
    </AuthShell>
  );
}
