"use client";

import { useEffect, useState, useCallback } from "react";

type MembershipRow = {
  id: string;
  user_id: string;
  llc_id: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  user_profiles: {
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    created_at: string;
  } | null;
  llcs: {
    id: string;
    name: string;
  };
};

type Filter = "all" | "pending" | "approved" | "rejected";

export default function BackofficePage() {
  const [members, setMembers] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backoffice/users");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to load users");
      }
      setMembers(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(userId: string, role: "user" | "admin") {
    setActionLoading(userId + "-approve");
    try {
      await fetch(`/api/backoffice/users/${userId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  async function reject(userId: string) {
    setActionLoading(userId + "-reject");
    try {
      await fetch(`/api/backoffice/users/${userId}/reject`, { method: "POST" });
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  async function changeRole(userId: string, newRole: "user" | "admin") {
    setActionLoading(userId + "-role");
    try {
      await fetch(`/api/backoffice/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = filter === "all" ? members : members.filter((m) => m.status === filter);

  const counts = {
    all: members.length,
    pending: members.filter((m) => m.status === "pending").length,
    approved: members.filter((m) => m.status === "approved").length,
    rejected: members.filter((m) => m.status === "rejected").length,
  };

  return (
    <div className="page-shell">
      <div className="backoffice-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Backoffice</h1>
          <p>Manage user access and LLC memberships</p>
        </div>
        <button onClick={load} className="btn btn-secondary" disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {/* Filter tabs */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            className={`btn ${filter === f ? "btn-primary" : "btn-secondary"} btn-sm`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
            <span style={{ opacity: 0.7 }}>({counts[f]})</span>
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>LLC</th>
              <th>Role</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <div className="empty-state-title">No users found</div>
                    <div className="empty-state-desc">
                      {filter === "pending" ? "No pending approvals." : `No ${filter} memberships.`}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && filtered.map((m) => {
              const profile = m.user_profiles;
              if (!profile) return null;
              const isActing = actionLoading?.startsWith(m.user_id);
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {profile.first_name} {profile.last_name}
                    </div>
                    <div className="text-muted text-sm">{profile.email}</div>
                    <div className="text-muted text-sm">{profile.phone_number}</div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{m.llcs.name}</span>
                  </td>
                  <td>
                    {m.status === "approved" ? (
                      <select
                        className="form-input"
                        style={{ height: 30, fontSize: 12, padding: "0 8px" }}
                        value={m.role}
                        disabled={isActing}
                        onChange={(e) =>
                          changeRole(m.user_id, e.target.value as "user" | "admin")
                        }
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`role-badge role-badge-${m.role}`}>
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge status-badge-${m.status}`}>
                      <span className="badge-dot" />
                      {m.status}
                    </span>
                  </td>
                  <td className="text-sm text-muted text-nowrap">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="action-btns">
                      {m.status === "pending" && (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={isActing}
                            onClick={() => approve(m.user_id, "user")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={isActing}
                            onClick={() => approve(m.user_id, "admin")}
                          >
                            Approve as Admin
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={isActing}
                            onClick={() => reject(m.user_id)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {m.status === "approved" && (
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={isActing}
                          onClick={() => reject(m.user_id)}
                        >
                          Revoke
                        </button>
                      )}
                      {m.status === "rejected" && (
                        <button
                          className="btn btn-success btn-sm"
                          disabled={isActing}
                          onClick={() => approve(m.user_id, "user")}
                        >
                          Re-approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
