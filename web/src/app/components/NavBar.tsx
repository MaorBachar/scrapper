"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

type LLC = { id: string; name: string };

type NavUser = {
  firstName: string;
  lastName: string;
  llcId: string | null;
  llcName: string | null;
  role: string | null;
  isSuperAdmin: boolean;
};

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [llcOpen, setLlcOpen] = useState(false);
  const [llcs, setLlcs] = useState<LLC[]>([]);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const llcRef = useRef<HTMLDivElement>(null);

  const loadUser = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUser(d))
      .catch(() => null);
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const isAdmin = user?.role === "admin" || user?.isSuperAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/auth/llcs")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setLlcs(d))
      .catch(() => null);
  }, [isAdmin]);

  // Close menus on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (llcRef.current && !llcRef.current.contains(e.target as Node)) setLlcOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => { setMenuOpen(false); setLlcOpen(false); }, [pathname]);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function switchLlc(llcId: string | null) {
    setSwitching(true);
    setLlcOpen(false);
    try {
      await fetch("/api/auth/switch-llc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llcId }),
      });
      loadUser();
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  const navLinks = [
    { href: "/properties", label: "Properties" },
    ...(isAdmin ? [{ href: "/backoffice", label: "Backoffice" }] : []),
  ];

  return (
    <nav className="app-nav">
      {/* Hamburger */}
      <div className="hamburger-wrap" ref={menuRef}>
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={`hamburger-bar ${menuOpen ? "open" : ""}`} />
          <span className={`hamburger-bar ${menuOpen ? "open" : ""}`} />
          <span className={`hamburger-bar ${menuOpen ? "open" : ""}`} />
        </button>

        {menuOpen && (
          <div className="hamburger-dropdown">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`hamburger-item ${pathname === link.href ? "active" : ""}`}
              >
                {link.label}
              </a>
            ))}
            <div className="hamburger-divider" />
            <button className="hamburger-item hamburger-signout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </div>

      <div className="nav-spacer" />

      {/* User info */}
      {user && (
        <div className="nav-user">
          <span className="nav-user-name">
            {capitalize(user.firstName)} {capitalize(user.lastName)}
          </span>

          {/* LLC: dropdown for admins, static label for regular users */}
          {isAdmin && llcs.length > 1 ? (
            <div className="llc-switcher" ref={llcRef}>
              <button
                className={`llc-switcher-btn ${switching ? "llc-switcher-loading" : ""}`}
                onClick={() => setLlcOpen((v) => !v)}
                disabled={switching}
              >
                <span>{switching ? "Switching…" : (user.llcName ?? "All LLCs")}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M5 7L1 3h8z" />
                </svg>
              </button>

              {llcOpen && (
                <div className="llc-dropdown">
                  {user.isSuperAdmin && (
                    <button
                      className={`llc-dropdown-item ${!user.llcId ? "active" : ""}`}
                      onClick={() => switchLlc(null)}
                    >
                      All LLCs
                    </button>
                  )}
                  {llcs.map((llc) => (
                    <button
                      key={llc.id}
                      className={`llc-dropdown-item ${user.llcId === llc.id ? "active" : ""}`}
                      onClick={() => switchLlc(llc.id)}
                    >
                      {llc.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : user.llcName ? (
            <span className="nav-llc">{user.llcName}</span>
          ) : null}
        </div>
      )}
    </nav>
  );
}
