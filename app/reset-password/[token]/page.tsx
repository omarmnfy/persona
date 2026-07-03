"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Invalid or expired reset link");
          return;
        }
        setEmail(data.email);
      })
      .catch(() => setError("Failed to validate reset link"))
      .finally(() => setLoadingMeta(false));
  }, [params.token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to reset password");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMeta ? (
              <p className="text-sm text-[var(--muted)]">Validating reset link...</p>
            ) : success ? (
              <div className="space-y-4">
                <p className="text-sm">Your password has been reset successfully. You can now sign in with your new password.</p>
                <Button onClick={() => router.push("/login")} className="w-full">
                  Sign in
                </Button>
              </div>
            ) : !email ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {error ?? "Invalid or expired reset link."}
                </p>
                <Button onClick={() => router.push("/forgot-password")} variant="outline" className="w-full">
                  Request a new reset link
                </Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="rounded-xl border border-[var(--border)] bg-white/70 p-3 text-sm">
                  <p className="text-[var(--muted)]">Resetting password for</p>
                  <p className="font-semibold">{email}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">New password</label>
                  <PasswordInput showStrength value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Confirm new password</label>
                  <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                {error && <p className="text-sm font-semibold text-[var(--ink)]">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Resetting..." : "Reset password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
