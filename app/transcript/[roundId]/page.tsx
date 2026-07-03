"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TranscriptMessage = {
  id: string;
  createdAt: string;
  type: "USER" | "SYSTEM";
  body: string;
  isQuestion?: boolean;
  senderDisplayName: string | null;
  recipientDisplayName: string | null;
};

type TranscriptData = {
  roomNumber: number;
  topic: string;
  roundNumber: number;
  role: string;
  displayName: string;
  messages: TranscriptMessage[];
};

export default function TranscriptPage() {
  const params = useParams<{ roundId: string }>();
  const router = useRouter();
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/transcript/${params.roundId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Failed to load transcript" }));
          setError(body.error ?? "Failed to load transcript");
          return;
        }
        const json = await res.json();
        setData(json);
      })
      .catch(() => setError("Failed to load transcript"))
      .finally(() => setLoading(false));
  }, [params.roundId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Loading transcript...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-6 space-y-4">
            <p className="text-red-600 font-medium">{error}</p>
            <p className="text-sm text-[var(--muted)]">Please sign in with your student account to view your chat transcript.</p>
            <Button onClick={() => router.push("/login")} className="w-full">
              Sign in
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">Chat Transcript</CardTitle>
              <span className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white">
                {data.role}
              </span>
            </div>
            <div className="space-y-1 text-sm text-[var(--muted)]">
              <p>Room {data.roomNumber} &bull; Round {data.roundNumber}</p>
              <p>Topic: <span className="font-medium text-[var(--foreground)]">{data.topic}</span></p>
              <p>Display Name: <span className="font-medium text-[var(--foreground)]">{data.displayName}</span></p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.messages.map((msg) => {
                const time = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const isSystem = msg.type === "SYSTEM";
                const isQuestion = Boolean(msg.isQuestion);
                const senderName = isSystem ? "System" : msg.senderDisplayName ?? "Unknown";
                const dmNote = msg.recipientDisplayName ? ` → ${msg.recipientDisplayName}` : "";

                return (
                  <div key={msg.id} className="text-sm">
                    <div className={`text-xs ${isQuestion ? "font-semibold text-red-600" : isSystem ? "italic text-[var(--muted)]" : "text-[var(--muted)]"}`}>
                      [{time}] {senderName}
                      {isQuestion ? " (Question)" : ""}
                      {dmNote}
                    </div>
                    <div className={isQuestion ? "font-semibold text-red-600" : isSystem ? "italic text-[var(--muted)]" : ""}>
                      {msg.body}
                    </div>
                  </div>
                );
              })}

              {data.messages.length === 0 && (
                <p className="text-center text-[var(--muted)]">No messages in this chat session.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSci9gg8PtvhMlq2gXv3N8dD9Ymr1p4yx5rkX8YGp0MopKDqMw/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Fill Out Intake Form
          </a>
          <Button onClick={() => router.push("/waiting")} variant="outline">
            Back to Waiting Room
          </Button>
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          Persona &bull; COGS123: Mind, Brains, &amp; Programs &bull; The Claremont Colleges &bull; Created by Omar Mnfy
        </p>
      </div>
    </main>
  );
}
