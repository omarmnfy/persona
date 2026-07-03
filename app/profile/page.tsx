"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SessionResponse = {
  user: {
    id: string;
    email: string;
    realName: string;
    assignedName?: string | null;
    school?: string | null;
    nickname?: string | null;
    accountType: "STUDENT" | "ADMIN" | "SUPER_ADMIN";
  } | null;
  csrfToken?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionResponse["user"]>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session?role=STUDENT")
      .then((res) => res.json())
      .then((data: SessionResponse) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        if (data.user.accountType === "ADMIN" || data.user.accountType === "SUPER_ADMIN") {
          router.push("/admin");
          return;
        }
        setUser(data.user);
        setCsrfToken(data.csrfToken ?? null);
      });
  }, [router]);

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Name</p>
              <p className="text-lg font-semibold">{user?.realName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Email</p>
              <p className="text-lg font-semibold">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">School</p>
              <p className="text-lg font-semibold">{user?.school ?? "--"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Assigned room name</p>
              <p className="text-lg font-semibold">{user?.assignedName ?? "--"}</p>
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={() => router.push("/waiting")}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
