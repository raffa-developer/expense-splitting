import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-glow relative flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-sm gap-6 border-border/70 py-6">
        <CardHeader className="px-6 py-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="px-6">{children}</CardContent>
      </Card>
    </div>
  );
}
