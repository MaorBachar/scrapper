"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    openphoneApiKey: "",
    llcName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          phoneNumber: form.phoneNumber,
          openphoneApiKey: form.openphoneApiKey,
          llcName: form.llcName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed.");
        return;
      }

      // Sign in automatically after registration
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      router.push("/pending");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-card auth-card-wide">
        <div className="auth-logo">Zillow Scraper</div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">
          Fill in your details. An admin will approve your account.
        </p>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-grid">
            <div className="form-group">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                className="form-input"
                value={form.firstName}
                onChange={handleChange}
                placeholder="John"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                className="form-input"
                value={form.lastName}
                onChange={handleChange}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-form-grid">
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="form-input"
                value={form.password}
                onChange={handleChange}
                placeholder="Min. 8 characters"
                required
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="form-input"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Repeat password"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="phoneNumber">Phone number</label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              className="form-input"
              value={form.phoneNumber}
              onChange={handleChange}
              placeholder="+1 (216) 555-0100"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="llcName">LLC name</label>
            <input
              id="llcName"
              name="llcName"
              type="text"
              className="form-input"
              value={form.llcName}
              onChange={handleChange}
              placeholder="Acme Properties LLC"
              required
            />
            <span className="form-hint">
              If the LLC already exists you will be added to it pending approval.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="openphoneApiKey">OpenPhone API key</label>
            <input
              id="openphoneApiKey"
              name="openphoneApiKey"
              type="password"
              className="form-input"
              value={form.openphoneApiKey}
              onChange={handleChange}
              placeholder="Your OpenPhone API key"
            />
            <span className="form-hint">
              Used to send SMS from your OpenPhone number. Optional — can be set later.
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit-btn"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{" "}
          <a href="/login" className="link">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
