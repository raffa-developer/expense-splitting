import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo, LogoMark } from "@/components/logo";
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
    <div className="min-h-svh bg-background md:grid md:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground md:flex">
        <Logo className="text-sidebar-foreground" />
        <div className="max-w-md space-y-8">
          <LogoMark className="size-24 opacity-90" />
          <p className="font-display text-4xl leading-[1.15] font-extrabold tracking-tight">
            {subtitle}
          </p>
        </div>
        <div className="h-1 w-16 rounded-full bg-chart-2" aria-hidden="true" />
      </aside>

      <main className="relative flex min-h-svh flex-col items-center justify-center px-4 py-10">
        <div className="absolute top-4 right-4 flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm gap-6 py-6">
          <CardHeader className="px-6 py-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground md:hidden">{subtitle}</p>
          </CardHeader>
          <CardContent className="px-6">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
