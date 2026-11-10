"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import { useApp } from "@/components/AppProvider";
import { Button } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  step: string;
  admin?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Diagnostic Loop",
    items: [
      { href: "/dashboard", label: "Dashboard", step: "⌂" },
      { href: "/materials", label: "Materials", step: "1" },
      { href: "/topics", label: "Syllabus map", step: "2" },
      { href: "/quiz", label: "Diagnostic quiz", step: "3" },
      { href: "/report", label: "Gap report", step: "4" },
      { href: "/plan", label: "Revision plan", step: "5" },
    ],
  },
  {
    title: "AI Copilot",
    items: [
      { href: "/explain", label: "Learning assistant", step: "?" },
      { href: "/agents", label: "Agent activity", step: "⚙" },
    ],
  },
  {
    title: "Management & Hub",
    items: [
      { href: "/teacher", label: "Teacher hub", step: "★" },
      { href: "/admin", label: "Observability", step: "📊" },
      { href: "/admin/students", label: "Monitor students", step: "👥", admin: true },
    ],
  },
  {
    title: "Information",
    items: [
      { href: "/how-it-works", label: "How it works", step: "i" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, data, signOut, resetDemo } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") {
      setIsAdmin(true);
    } else {
      getAuthUser().then((u) => setIsAdmin(u?.role === "admin")).catch(() => setIsAdmin(false));
    }
  }, [user]);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <div style={{ padding: 48, textAlign: "center" }} className="muted">Loading GapFinder AI workspace…</div>;

  // Find active label for topbar breadcrumb
  const currentNav = NAV_GROUPS.flatMap((g) => g.items).find(
    (n) => path === n.href || (n.href !== "/admin" && path?.startsWith(n.href + "/"))
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="logo" style={{ textDecoration: "none" }}>
          <span className="logo-mark">◎</span>
          <div>
            <div>GapFinder AI</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#64748b", marginTop: -2 }}>Diagnostic Copilot</div>
          </div>
        </Link>

        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((n) => !n.admin || isAdmin);
          if (!visibleItems.length) return null;
          return (
            <div key={group.title} className="nav-section">
              <div className="nav-section-title">{group.title}</div>
              <nav className="nav">
                {visibleItems.map((n) => {
                  const active = path === n.href || (n.href !== "/admin" && path?.startsWith(n.href + "/"));
                  return (
                    <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                      <span className="step">{n.step}</span>
                      <span>{n.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}

        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot strong" />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Ready · {data.subject}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#64748b" }}>
            {data.topics.length} topics mapped · {data.attempts.length} diagnostic{data.attempts.length === 1 ? "" : "s"}
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-subject">
              <span>🧬</span> {data.subject || "Diagnostics"}
            </span>
            {currentNav && (
              <span className="muted" style={{ fontSize: 13 }}>
                / <b style={{ color: "var(--ink)", fontWeight: 600 }}>{currentNav.label}</b>
              </span>
            )}
          </div>

          <div className="topbar-right">
            {user.demo && (
              <Button
                variant="secondary"
                size="sm"
                title="Restore original demo data"
                onClick={async () => {
                  if (confirm("Reset the demo account to its original data?")) await resetDemo();
                }}
              >
                ↺ Reset demo
              </Button>
            )}

            <div className="user-badge" title={user.email}>
              <span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
              <span>{user.name.split(" ")[0]}</span>
              {isAdmin && <span className="badge brand" style={{ padding: "1px 6px", fontSize: 11 }}>Admin</span>}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                router.replace("/login");
              }}
              style={{ color: "var(--muted)", fontWeight: 500 }}
            >
              Log out ↗
            </Button>
          </div>
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
