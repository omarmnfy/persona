"use client";

import { useState } from "react";

export function ClaimAdminForm() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/auth/claim-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setMessage(data.message);
        setEmail("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-[var(--border)] px-8 py-4 text-base font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--primary)] transition-all text-center"
      >
        Claim Admin Account
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-left shadow-sm">
      <h3 className="text-base font-semibold mb-1">Claim Admin Account</h3>
      <p className="text-sm text-[var(--muted)] mb-4">
        Enter your admin email. If an unclaimed admin account exists, you will receive a setup link.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        {error && <p className="text-sm font-medium text-[var(--danger)]">{error}</p>}
        {message && <p className="text-sm font-medium text-green-700">{message}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-contrast)] hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-all"
          >
            {loading ? "Sending..." : "Send Setup Link"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); setMessage(null); }}
            className="rounded-2xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface)] transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
