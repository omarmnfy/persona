"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { validatePassword } from "@/lib/password";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SCHOOL_OPTIONS } from "@/lib/personaCatalog";

type InviteMeta = {
  accountType: "STUDENT" | "ADMIN" | "SUPER_ADMIN";
  email: string;
  realName: string;
  firstName?: string | null;
  lastName?: string | null;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [inviteMeta, setInviteMeta] = useState<InviteMeta | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [school, setSchool] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/auth/invite?token=${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Invalid or expired invite token");
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const meta = data.invite as InviteMeta;
        setInviteMeta(meta);
        setFirstName(meta.firstName ?? "");
        setLastName(meta.lastName ?? "");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!inviteMeta) {
      setError("Invalid or expired invite token.");
      setLoading(false);
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please complete your first and last name.");
      setLoading(false);
      return;
    }
    if (inviteMeta.accountType === "STUDENT" && !school) {
      setError("Please choose your school.");
      setLoading(false);
      return;
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      setError("Strong passwords must include 8+ chars, uppercase, lowercase, number, and symbol.");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const payload: Record<string, string> = {
      token: params.token,
      firstName,
      lastName,
      password
    };
    if (inviteMeta.accountType === "STUDENT") {
      payload.school = school;
    }

    const res = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invite acceptance failed");
      setLoading(false);
      return;
    }

    if (data.user?.accountType === "ADMIN" || data.user?.accountType === "SUPER_ADMIN") {
      router.push("/admin");
      return;
    }
    router.push("/profile");
  }

  const isAdminInvite = inviteMeta?.accountType === "ADMIN" || inviteMeta?.accountType === "SUPER_ADMIN";

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>{isAdminInvite ? "Accept admin invitation" : "Accept invitation"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMeta ? (
              <p className="text-sm text-[var(--muted)]">Loading invitation...</p>
            ) : !inviteMeta ? (
              <p className="text-sm font-semibold text-[var(--ink)]">
                {error ?? "Invalid or expired invitation link."}
              </p>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="rounded-xl border border-[var(--border)] bg-white/70 p-3 text-sm">
                  <p className="font-semibold">{inviteMeta.email}</p>
                  <p className="text-[var(--muted)]">
                    {isAdminInvite
                      ? "You are activating an administrator account."
                      : "You are activating a student account."}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">First name</label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Last name</label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                {!isAdminInvite && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">School</label>
                    <select
                      className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                    >
                      <option value="">Select your school</option>
                      {SCHOOL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Set password</label>
                  <PasswordInput showStrength value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Confirm password</label>
                  <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                {error && <p className="text-sm font-semibold text-[var(--ink)]">{error}</p>}
                <Button type="submit" disabled={loading || loadingMeta} className="w-full">
                  {loading ? "Saving..." : isAdminInvite ? "Activate admin account" : "Continue"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
