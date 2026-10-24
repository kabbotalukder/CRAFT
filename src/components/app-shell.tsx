import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/dashboard/courses", icon: BookOpen, label: "Courses" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 border-b border-border px-5 py-5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <span className="font-display text-base font-bold">C</span>
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">
            CRAFT
          </span>
        </Link>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${pathname === to
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent"
                }`}
            >
              <Icon className="h-4 w-4 shrink-0" /> {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
            {user?.displayName ?? user?.email}
          </span>
          <div className="flex gap-1">
            <button
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-display text-sm font-bold">C</span>
            </div>
            <span className="font-display text-lg font-semibold">Craft</span>
          </Link>
          <div className="flex gap-1">
            <button
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${pathname === to ? "text-primary" : "text-muted-foreground"
                }`}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
