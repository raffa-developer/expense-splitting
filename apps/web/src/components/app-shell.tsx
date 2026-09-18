import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  House,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sun,
  Users
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams
} from "react-router-dom";
import { api, type Group } from "@/api";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/money";

export interface GroupNavInfo {
  id: string;
  name: string;
  net: number;
  currency: string;
}

const GroupNavContext = createContext<{
  info: GroupNavInfo | null;
  setInfo: (info: GroupNavInfo | null) => void;
} | null>(null);

export function useGroupNavRegistration(info: GroupNavInfo | null) {
  const context = useContext(GroupNavContext);
  const setInfo = context?.setInfo;
  const id = info?.id ?? null;
  const name = info?.name ?? null;
  const net = info?.net ?? 0;
  const currency = info?.currency ?? null;

  useEffect(() => {
    if (!setInfo) {
      return;
    }
    setInfo(id && name && currency ? { id, name, net, currency } : null);
    return () => setInfo(null);
  }, [setInfo, id, name, net, currency]);
}

export function notifyGroupsChanged() {
  window.dispatchEvent(new Event("groups:changed"));
}

function SidebarLink({
  to,
  icon,
  label,
  end,
  onNavigate
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/40",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )
      }
    >
      {icon}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function GroupList({
  groups,
  onNavigate
}: {
  groups: Group[] | null;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();

  if (groups === null) {
    return (
      <div className="space-y-1 px-2.5 py-1">
        <Skeleton className="h-7 w-full rounded-md" />
        <Skeleton className="h-7 w-4/5 rounded-md" />
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="px-2.5 py-1 text-xs text-sidebar-foreground/55">
        {t("nav.noGroups")}
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {groups.map((group) => {
        const net = group.your_net ?? 0;
        return (
          <li key={group.id}>
            <Link
              to={`/groups/${group.id}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{group.name}</span>
              {net !== 0 && (
                <span
                  className={cn(
                    "money text-xs",
                    net > 0 ? "text-sidebar-positive" : "text-sidebar-negative"
                  )}
                >
                  {formatSignedMoney(net, group.currency)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function GroupNav({ info, onNavigate }: { info: GroupNavInfo; onNavigate?: () => void }) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "expenses" || tabParam === "people" ? tabParam : "overview";

  const tabs = [
    { value: "overview", label: t("group.tabOverview") },
    { value: "expenses", label: t("group.tabExpenses") },
    { value: "people", label: t("group.tabPeople") }
  ];

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <Link
        to="/groups"
        onClick={onNavigate}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground"
      >
        <ChevronLeft className="size-3.5" /> {t("app.allGroups")}
      </Link>

      <p className="px-2.5 pt-3 font-display text-[15px] leading-snug font-semibold">
        {info.name}
      </p>
      <p className="px-2.5 pt-1.5 text-xs text-sidebar-foreground/55">
        {info.net === 0
          ? t("balances.settled")
          : info.net > 0
            ? t("dashboard.owedToYou")
            : t("dashboard.youOwe")}
      </p>
      {info.net !== 0 && (
        <p
          className={cn(
            "money px-2.5 text-sm font-medium",
            info.net > 0 ? "text-sidebar-positive" : "text-sidebar-negative"
          )}
        >
          {formatMoney(Math.abs(info.net), info.currency)}
        </p>
      )}

      <nav className="mt-4 space-y-0.5 border-t border-sidebar-border pt-4">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            to={
              tab.value === "overview"
                ? `/groups/${info.id}`
                : `/groups/${info.id}?tab=${tab.value}`
            }
            onClick={onNavigate}
            className={cn(
              "block rounded-xl px-2.5 py-1.5 text-sm text-sidebar-foreground/75 transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              activeTab === tab.value &&
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();

  const initial = user?.name.slice(0, 1).toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-2.5 rounded-xl bg-black/20 px-3 py-2.5 hover:bg-black/30 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chart-2 text-xs font-bold text-sidebar-primary-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-bold">
              {user?.name}
            </span>
            <span className="block truncate text-xs font-normal text-sidebar-foreground/60">
              {user?.email}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-sidebar-foreground/50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user?.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("app.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> {t("app.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> {t("app.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> {t("app.system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut /> {t("app.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  groupNav,
  onNavigate
}: {
  groupNav: GroupNavInfo | null;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const [groups, setGroups] = useState<Group[] | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      setGroups(await api.listGroups());
    } catch {
      setGroups((previous) => previous ?? []);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups, location.pathname]);

  useEffect(() => {
    const handler = () => void loadGroups();
    window.addEventListener("groups:changed", handler);
    return () => window.removeEventListener("groups:changed", handler);
  }, [loadGroups]);

  return (
    <>
      <Link
        to="/dashboard"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4"
      >
        <LogoMark />
        <span className="font-display text-[15px] font-bold tracking-tight">
          Expense<span className="text-sidebar-primary">.</span>Splitting
        </span>
      </Link>

      {groupNav ? (
        <GroupNav info={groupNav} onNavigate={onNavigate} />
      ) : (
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            <SidebarLink
              to="/dashboard"
              icon={<House className="size-4" />}
              label={t("nav.dashboard")}
              onNavigate={onNavigate}
            />
            <SidebarLink
              to="/groups"
              icon={<Users className="size-4" />}
              label={t("nav.groups")}
              onNavigate={onNavigate}
            />
          </div>
          <p className="px-2.5 pt-6 pb-2 text-xs font-medium text-sidebar-foreground/55">
            {t("nav.yourGroups")}
          </p>
          <GroupList groups={groups} onNavigate={onNavigate} />
        </nav>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-sidebar-border p-2">
        <div className="min-w-0 flex-1">
          <AccountMenu />
        </div>
        <LanguageToggle />
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [groupNav, setGroupNav] = useState<GroupNavInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const contextValue = useMemo(
    () => ({ info: groupNav, setInfo: setGroupNav }),
    [groupNav]
  );

  return (
    <GroupNavContext.Provider value={contextValue}>
      <div className="min-h-svh">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-62 flex-col bg-sidebar text-sidebar-foreground md:flex">
          <SidebarBody groupNav={groupNav} />
        </aside>

        <div className="flex min-h-svh flex-col md:pl-62">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/85 px-3 backdrop-blur md:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("nav.openMenu")}
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                <SidebarBody
                  groupNav={groupNav}
                  onNavigate={() => setMenuOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <Logo />
          </header>

          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </GroupNavContext.Provider>
  );
}
