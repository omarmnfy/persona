"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

type RoomMessage = {
  id: string;
  createdAt: string;
  type: "USER" | "SYSTEM";
  body: string;
  isQuestion?: boolean;
  questionId?: string | null;
  questionEndsAt?: string | null;
  sender: { id: string; displayName: string } | null;
  recipient: { id: string; displayName: string } | null;
};

type ActiveQuestion = {
  id: string;
  body: string;
  durationSeconds: number;
  endsAt: string;
  remainingSeconds?: number;
};

export default function AdminRoomPage() {
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState(searchParams.get("mode") === "visible" ? "visible" : "silent");
  const [settings, setSettings] = useState<{ allowAdminPosting: boolean; silentViewReadOnly?: boolean } | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const [roundEndsAt, setRoundEndsAt] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const [questionCooldownUntil, setQuestionCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const adminChatContainerRef = useRef<HTMLDivElement>(null);
  const adminChatEndRef = useRef<HTMLDivElement>(null);
  const adminIsNearBottomRef = useRef(true);

  function handleAdminChatScroll() {
    const el = adminChatContainerRef.current;
    if (!el) return;
    const threshold = 80;
    adminIsNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  useEffect(() => {
    if (adminIsNearBottomRef.current) {
      adminChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    fetch("/api/auth/session?role=ADMIN")
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        if (data.user.accountType !== "ADMIN" && data.user.accountType !== "SUPER_ADMIN") {
          router.push("/waiting");
          return;
        }
        setCsrfToken(data.csrfToken ?? null);
      });
  }, [router]);

  function fetchRoomData() {
    fetch(`/api/rooms/${params.roomId}/participants?role=ADMIN`)
      .then((res) => res.json())
      .then((data) => setParticipants(data.participants ?? []));
    fetch(`/api/rooms/${params.roomId}/messages?role=ADMIN`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []));
    fetch(`/api/rooms/${params.roomId}/question?role=ADMIN`)
      .then((res) => res.json())
      .then((data) => {
        setActiveQuestion(data.activeQuestion ?? null);
        if (data.activeQuestion) {
          setQuestionCooldownUntil(null);
        }
      });
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSettings(data));
    fetch("/api/admin/rooms", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRoundEndsAt(data?.round?.endsAt ?? null));
  }

  useEffect(() => {
    fetchRoomData();
  }, [params.roomId]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", auth: { role: "ADMIN" } });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("admin:watch", { roomId: params.roomId, mode: modeRef.current });
      fetchRoomData();
    });
    socket.on("message:new", (message: RoomMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    socket.on("messages:reveal", (revealed: RoomMessage[]) => {
      setMessages((prev) => {
        const existing = new Set(prev.map((message) => message.id));
        const merged = [...prev];
        for (const message of revealed) {
          if (!existing.has(message.id)) {
            merged.push(message);
            existing.add(message.id);
          }
        }
        return merged;
      });
    });
    socket.on("question:update", ({ activeQuestion: nextQuestion }: { activeQuestion: ActiveQuestion | null }) => {
      setActiveQuestion((prev) => {
        if (prev && !nextQuestion) {
          setQuestionCooldownUntil(Date.now() + 3000);
        }
        return nextQuestion ?? null;
      });
      if (nextQuestion) {
        setQuestionCooldownUntil(null);
      }
    });
    socket.on("chat:error", ({ error }: { error: string }) => {
      setPostNotice(error);
    });
    return () => {
      socket.disconnect();
    };
  }, [params.roomId]);

  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("admin:watch", { roomId: params.roomId, mode });
    }
  }, [mode, params.roomId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function sendMessage() {
    if (!canPost) {
      setPostNotice("Enable admin posting in Settings to send messages.");
      return;
    }
    if (!input.trim()) return;
    socketRef.current?.emit("message:send", {
      roomId: params.roomId,
      recipientId: null,
      body: input
    });
    setInput("");
  }

  const canPost =
    settings?.allowAdminPosting &&
    (mode === "visible" || settings?.silentViewReadOnly === false);

  const timeLeft = useMemo(() => {
    if (!roundEndsAt) return null;
    const diff = new Date(roundEndsAt).getTime() - now;
    if (diff <= 0) return "00:00";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [roundEndsAt, now]);

  const questionTimeLeft = useMemo(() => {
    if (!activeQuestion?.endsAt) return null;
    const diff = new Date(activeQuestion.endsAt).getTime() - now;
    if (diff <= 0) return "00s";
    const seconds = Math.ceil(diff / 1000);
    return `${String(seconds).padStart(2, "0")}s`;
  }, [activeQuestion, now]);

  const showQuestionTimer =
    Boolean(activeQuestion) ||
    (questionCooldownUntil !== null && questionCooldownUntil > now);

  async function enablePosting() {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ allowAdminPosting: true })
    });
    if (!res.ok) {
      setPostNotice("Unable to enable admin posting. Please try again.");
      return;
    }
    const updated = await fetch("/api/admin/settings", { cache: "no-store" }).then((res) => res.json());
    setSettings(updated);
    setPostNotice(null);
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin {mode === "silent" ? "Silent View" : "Visible Join"}</CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {roundEndsAt && (
                <p className="text-[var(--muted)]">Time left: {timeLeft ?? "--:--"}</p>
              )}
              {showQuestionTimer && (
                <p className="font-semibold text-red-600">
                  Question timer: {activeQuestion ? questionTimeLeft ?? "00s" : "00s"}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/admin")}>
                <span className="flex items-center gap-2">
                  <ArrowLeft size={16} />
                  Back to dashboard
                </span>
              </Button>
              <Button variant={mode === "silent" ? "primary" : "outline"} onClick={() => setMode("silent")}>
                Silent view
              </Button>
              <Button variant={mode === "visible" ? "primary" : "outline"} onClick={() => setMode("visible")}>
                Visible join
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-4 md:h-[60vh]">
                <p className="text-sm font-semibold">Participants</p>
                <div className="mt-2 h-full overflow-y-auto pr-1 text-sm">
                  {participants.map((p) => (
                    <div key={p.userId} className="py-1">
                      {p.displayName}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-4 md:h-[60vh] md:overflow-hidden md:flex md:flex-col">
                <p className="text-sm font-semibold">Messages</p>
                <div
                  ref={adminChatContainerRef}
                  onScroll={handleAdminChatScroll}
                  className="mt-2 space-y-2 overflow-y-auto text-sm md:flex-1 md:min-h-0"
                >
                  {messages.map((m) => (
                    <div key={m.id}>
                      <div className={`text-xs ${m.isQuestion ? "text-red-600" : "text-[var(--muted)]"}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
                        {m.sender?.displayName ?? "System"}
                        {m.isQuestion ? " (Interrogator question)" : ""}
                        {m.recipient ? ` (DM to ${m.recipient.displayName})` : ""}
                      </div>
                      <div className={m.isQuestion ? "font-semibold text-red-600" : ""}>{m.body}</div>
                    </div>
                  ))}
                  <div ref={adminChatEndRef} />
                </div>
                {mode === "visible" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Admin message (visible mode only)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                      />
                      <Button onClick={sendMessage} disabled={!canPost}>
                        Send
                      </Button>
                    </div>
                    {!settings?.allowAdminPosting && (
                      <div className="text-xs text-[var(--muted)]">
                        Admin posting is disabled. Enable it in Settings to send messages.
                      </div>
                    )}
                    {!settings?.allowAdminPosting && (
                      <Button size="sm" variant="outline" onClick={enablePosting}>
                        Enable admin posting
                      </Button>
                    )}
                    {postNotice && <div className="text-xs text-[var(--muted)]">{postNotice}</div>}
                  </div>
                )}
                {mode === "silent" && (
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    Silent view is read-only. Switch to visible join to send messages.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
