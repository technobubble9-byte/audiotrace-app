import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Upload, Users, FileAudio, Search, LogOut } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const NAV_ITEMS = [
  { to: "/dashboard", label: "Protect a File", icon: ShieldCheck, exact: true },
  { to: "/dashboard/uploads", label: "Uploads", icon: Upload },
  { to: "/dashboard/recipients", label: "Recipients", icon: Users },
  { to: "/dashboard/protected-files", label: "Protected Files", icon: FileAudio },
  { to: "/dashboard/trace", label: "Trace / Detection", icon: Search },
] as const;

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function DashboardLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">AudioTrace</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item && item.exact }}
              className="flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
              activeProps={{ className: "active" }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
