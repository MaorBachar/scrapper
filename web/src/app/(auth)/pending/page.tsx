"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-card">
        <div className="auth-logo">Zillow Scraper</div>

        <div className="pending-icon">⏳</div>
        <h1 className="auth-title">Awaiting approval</h1>
        <p className="auth-subtitle">
          Your account has been created and is pending admin approval. You will
          be able to access the app once an admin approves your LLC membership.
        </p>

        <div className="alert alert-info" style={{ marginTop: 20 }}>
          Please reach out to your LLC administrator if you need expedited access.
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-secondary auth-submit-btn"
          style={{ marginTop: 24 }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
