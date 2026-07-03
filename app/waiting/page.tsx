"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function WaitingPage() {
  const router = useRouter();
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [round, setRound] = useState<any>(null);
  const [membership, setMembership] = useState<any>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetch("/api/auth/session?role=STUDENT")
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        if (data.user.accountType === "ADMIN" || data.user.accountType === "SUPER_ADMIN") {
          router.push("/admin");
          return;
        }
        setCsrfToken(data.csrfToken ?? null);
        setSessionLoaded(true);
      });
  }, [router]);

  useEffect(() => {
    if (!sessionLoaded) return;
    const fetchRound = () =>
      fetch("/api/rounds/current")
        .then((res) => res.json())
        .then((data) => {
          setRound(data.round);
          setMembership(data.membership);
        });
    fetchRound();
    const interval = setInterval(fetchRound, 5000);
    const socket = io({ path: "/socket.io", auth: { role: "STUDENT" } });
    socketRef.current = socket;
    socket.on("round:update", fetchRound);
    return () => clearInterval(interval);
  }, [sessionLoaded]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeLeft = useMemo(() => {
    if (!round?.endsAt) return null;
    const diff = new Date(round.endsAt).getTime() - now;
    if (diff <= 0) return "00:00";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [round, now]);

  async function joinRound() {
    if (!csrfToken || !joinCode.trim()) return;
    setJoinError(null);
    setJoining(true);
    const res = await fetch("/api/rounds/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ code: joinCode.trim() })
    });
    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Failed to join round");
      setJoining(false);
      return;
    }
    setRound(data.round);
    setMembership(data.membership);
    setJoinCode("");
    setJoining(false);
  }

  if (!sessionLoaded) return null;

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Waiting room</CardTitle>
              <button
                onClick={() => setShowInstructions(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--surface-hover)] transition-colors"
                title="View instructions"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Instructions
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Round code</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="flex-1"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter code from your admin"
                />
                <Button onClick={joinRound} disabled={!joinCode.trim() || joining}>
                  {joining ? "Joining..." : "Join round"}
                </Button>
              </div>
              {joinError && <p className="text-sm font-semibold text-[var(--ink)]">{joinError}</p>}
            </div>

            {!round && <p>Waiting for admin to start a round.</p>}
            {round && (
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
                  Round {round.roundNumber}
                </p>
                {membership?.room?.name && (
                  <p className="text-lg font-semibold">{membership.room.name}</p>
                )}
                {round.status === "ACTIVE" && (
                  <p className="text-sm text-[var(--muted)]">Time left: {timeLeft ?? "--:--"}</p>
                )}
                {membership?.roomId && (
                  <p className="text-sm text-[var(--muted)]">
                    Assigned to Room {membership.room?.roomNumber ?? "--"}
                  </p>
                )}
                {round.status === "ACTIVE" && membership?.roomId && (
                  <Button onClick={() => router.push(`/room/${membership.roomId}`)}>
                    Join Room
                  </Button>
                )}
                {round.status !== "ACTIVE" && membership?.roomId && (
                  <p className="text-sm">Waiting for admin to start the round.</p>
                )}
                {!membership?.roomId && (
                  <p className="text-sm">Enter the round code to be assigned to a room.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowInstructions(false)}>
          <div
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface)] transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-bold mb-4">The Claremont Colleges&apos; Turing Test</h2>

            <div className="space-y-4 text-sm text-[var(--ink)]">
              <p>
                You will be placed into a group of three students. In each group, there is an
                <strong> Interrogator</strong>, a <strong>Poser</strong>, and a <strong>True Collegian</strong>.
              </p>

              <div>
                <p className="font-semibold mb-1">Roles:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Interrogator:</strong> Figure out which of the other two participants is telling the truth about which College they attend, and which one is lying.</li>
                  <li><strong>Poser:</strong> Convince the Interrogator you are from a Claremont College that you do not actually attend.</li>
                  <li><strong>True Collegian:</strong> Convince the Interrogator that you really ARE from the College you attend.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold mb-1">Rules:</p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Note the names of yourself and the other two participants and who is the Interrogator.</li>
                  <li>Remain anonymous. Do not reveal your personal identity.</li>
                  <li>Poser and True Collegian should direct their answers only to the Interrogator. No back-and-forth arguments between PS and TC.</li>
                  <li>No using search engines or any resources on the Internet. Use only your own pre-existing knowledge about the Claremont Colleges.</li>
                  <li>Sessions will be timed. When the timer ends, the chat will close automatically.</li>
                  <li>After the session ends, the Interrogator should note who they think the True Collegian is.</li>
                </ol>
              </div>

              <p className="text-xs text-[var(--muted)]">
                All interactions happen via text chat on Persona. Everyone is anonymous with assigned names.
              </p>
            </div>

            <div className="mt-5">
              <Button onClick={() => setShowInstructions(false)} className="w-full">
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
