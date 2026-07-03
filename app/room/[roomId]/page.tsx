"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleInstructions } from "@/lib/roles";
import { roleBadgeStyle, roleLabel } from "@/lib/roleMeta";
import { generateChatPdf } from "@/lib/chatPdf";

const SCHOOL_COLORS: Record<string, string> = {
  "Pomona College": "#0057b8",
  "Harvey Mudd College": "#FDB913",
  "Claremont McKenna College": "#800000",
  "Pitzer College": "#F7941D",
  "Scripps College": "#34715B",
};

function RoomNameWithSchoolColor({ name }: { name: string }) {
  for (const [school, color] of Object.entries(SCHOOL_COLORS)) {
    if (name.includes(school)) {
      const parts = name.split(school);
      return (
        <span>
          {parts[0]}<span style={{ color, fontWeight: 700 }}>{school}</span>{parts[1]}
        </span>
      );
    }
  }
  return <>{name}</>;
}

type Participant = {
  userId: string;
  displayName: string;
  role?: string;
  isAdmin?: boolean;
};

type Message = {
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

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [round, setRound] = useState<any>(null);
  const [membership, setMembership] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [questionDuration, setQuestionDuration] = useState(15);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const [questionCooldownUntil, setQuestionCooldownUntil] = useState<number | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const hasSubmittedAnswerRef = useRef(hasSubmittedAnswer);
  hasSubmittedAnswerRef.current = hasSubmittedAnswer;
  const membershipRef = useRef(membership);
  membershipRef.current = membership;
  const autoDownloadedRef = useRef(false);
  const [showGuessScreen, setShowGuessScreen] = useState(false);
  const [guessCandidates, setGuessCandidates] = useState<{ userId: string; displayName: string }[]>([]);
  const [guessResult, setGuessResult] = useState<{ correct: boolean } | null>(null);
  const [guessSubmitting, setGuessSubmitting] = useState(false);
  const confettiFiredRef = useRef(false);
  const guessFlowActiveRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  function handleChatScroll() {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  useEffect(() => {
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  const [waitingForGuess, setWaitingForGuess] = useState(false);
  const [nonInterrogatorResult, setNonInterrogatorResult] = useState<{ correct: boolean; wasChosen: boolean; myRole: string } | null>(null);
  const guessPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/auth/session?role=STUDENT")
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
      });
  }, [router]);

  useEffect(() => {
    const fetchRound = () =>
      fetch("/api/rounds/active")
        .then((res) => res.json())
        .then((data) => {
          if (!data.round || data.membership?.roomId !== params.roomId) {
            if (guessFlowActiveRef.current) return;
            router.push("/waiting");
            return;
          }
          setRound(data.round);
          setMembership(data.membership);
        });
    fetchRound();
    const interval = setInterval(fetchRound, 4000);
    return () => clearInterval(interval);
  }, [params.roomId, router]);

  useEffect(() => {
    fetch(`/api/rooms/${params.roomId}/participants?role=STUDENT`)
      .then((res) => res.json())
      .then((data) => setParticipants(data.participants ?? []));

    fetch(`/api/rooms/${params.roomId}/messages?role=STUDENT`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []));

    fetch(`/api/rooms/${params.roomId}/question?role=STUDENT`)
      .then((res) => res.json())
      .then((data) => {
        setActiveQuestion(data.activeQuestion ?? null);
        if (data.activeQuestion) {
          setQuestionCooldownUntil(null);
        }
        setHasSubmittedAnswer(Boolean(data.hasSubmitted));
      });
  }, [params.roomId]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", auth: { role: "STUDENT" } });
    socketRef.current = socket;
    socket.emit("room:join", { roomId: params.roomId });
    socket.on("message:new", (message: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    socket.on("messages:reveal", (revealed: Message[]) => {
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
    socket.on("room:presence", () => {
      fetch(`/api/rooms/${params.roomId}/participants?role=STUDENT`)
        .then((res) => res.json())
        .then((data) => setParticipants(data.participants ?? []));
    });
    socket.on("question:update", ({ activeQuestion: nextQuestion }: { activeQuestion: ActiveQuestion | null }) => {
      setActiveQuestion((prev) => {
        if (prev && !nextQuestion) {
          const role = membershipRef.current?.assignedRole;
          const isResp = role === "REAL" || role === "FAKE";
          if (isResp && !hasSubmittedAnswerRef.current && inputRef.current.trim()) {
            socketRef.current?.emit("message:send", {
              roomId: params.roomId,
              recipientId: null,
              body: inputRef.current
            });
            setInput("");
          }
          setQuestionCooldownUntil(Date.now() + 3000);
        }
        return nextQuestion ?? null;
      });
      setHasSubmittedAnswer(false);
      if (nextQuestion) {
        setQuestionCooldownUntil(null);
      }
    });
    socket.on("answer:submitted", () => {
      setHasSubmittedAnswer(true);
      setChatNotice(null);
    });
    socket.on("chat:error", ({ error }: { error: string }) => {
      setChatNotice(error);
    });

    return () => {
      socket.emit("room:leave", { roomId: params.roomId });
      socket.disconnect();
    };
  }, [params.roomId]);

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

  useEffect(() => {
    if (!round?.endsAt) return;
    const diff = new Date(round.endsAt).getTime() - now;
    if (diff <= 0) {
      if (!autoDownloadedRef.current && messages.length > 0 && membership) {
        autoDownloadedRef.current = true;
        const selfParticipant = participants.find((p) => p.userId === membership.userId);
        const displayName =
          selfParticipant?.displayName ??
          messages.find((m) => m.sender?.id === membership.userId)?.sender?.displayName ??
          "You";
        generateChatPdf({
          roomNumber: membership.room?.roomNumber ?? "",
          topic: round?.topic ?? "",
          yourRole: roleLabel(membership.assignedRole),
          yourDisplayName: displayName,
          messages,
        });

        if (membership.assignedRole === "INTERROGATOR" && !showGuessScreen && !guessResult) {
          guessFlowActiveRef.current = true;
          fetch(`/api/guess?roomId=${params.roomId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.guess) {
                setGuessResult({ correct: data.guess.correct });
              } else if (data.candidates) {
                setGuessCandidates(data.candidates);
                setShowGuessScreen(true);
              }
            });
        } else if (membership.assignedRole !== "INTERROGATOR" && !waitingForGuess && !nonInterrogatorResult) {
          guessFlowActiveRef.current = true;
          setWaitingForGuess(true);
        }
      } else if (!showGuessScreen && !guessResult && !waitingForGuess && !nonInterrogatorResult) {
        if (membership?.assignedRole === "INTERROGATOR") {
          guessFlowActiveRef.current = true;
          fetch(`/api/guess?roomId=${params.roomId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.guess) {
                setGuessResult({ correct: data.guess.correct });
              } else if (data.candidates) {
                setGuessCandidates(data.candidates);
                setShowGuessScreen(true);
              }
            });
        } else {
          guessFlowActiveRef.current = true;
          setWaitingForGuess(true);
        }
      }
    }
  }, [round, now, router, messages, membership, participants, showGuessScreen, guessResult, params.roomId, waitingForGuess, nonInterrogatorResult]);

  useEffect(() => {
    if (!waitingForGuess || nonInterrogatorResult) return;
    const poll = () => {
      fetch(`/api/guess?roomId=${params.roomId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.guess) {
            setNonInterrogatorResult({ correct: data.guess.correct, wasChosen: data.guess.wasChosen, myRole: data.guess.myRole });
            setWaitingForGuess(false);
            if (guessPollingRef.current) clearInterval(guessPollingRef.current);
          }
        });
    };
    poll();
    guessPollingRef.current = setInterval(poll, 2000);
    return () => { if (guessPollingRef.current) clearInterval(guessPollingRef.current); };
  }, [waitingForGuess, nonInterrogatorResult, params.roomId]);

  const roleText = useMemo(() => {
    if (!membership?.assignedRole) return null;
    return roleInstructions[membership.assignedRole] ?? "";
  }, [membership]);

  const isInterrogator = membership?.assignedRole === "INTERROGATOR";
  const isResponder = membership?.assignedRole === "REAL" || membership?.assignedRole === "FAKE";

  const questionSecondsLeft = useMemo(() => {
    if (!activeQuestion?.endsAt) return null;
    const diff = new Date(activeQuestion.endsAt).getTime() - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / 1000);
  }, [activeQuestion, now]);

  const questionTimeLeft = useMemo(() => {
    if (questionSecondsLeft === null) return null;
    return `${String(questionSecondsLeft).padStart(2, "0")}s`;
  }, [questionSecondsLeft]);

  const timerUrgent = questionSecondsLeft !== null && questionSecondsLeft > 0 && questionSecondsLeft <= 7;

  const showQuestionTimer =
    Boolean(activeQuestion) ||
    (questionCooldownUntil !== null && questionCooldownUntil > now);

  const sendingQuestionRef = useRef(false);

  function sendQuestion() {
    if (!input.trim()) return;
    if (!isInterrogator) return;
    if (activeQuestion) {
      setChatNotice("Wait for the current question timer to finish.");
      return;
    }
    if (sendingQuestionRef.current) return;
    sendingQuestionRef.current = true;
    setChatNotice(null);
    socketRef.current?.emit("question:send", {
      roomId: params.roomId,
      body: input,
      durationSeconds: questionDuration
    });
    setInput("");
    setTimeout(() => { sendingQuestionRef.current = false; }, 1000);
  }

  function handleDownloadPdf() {
    if (!membership) return;
    const selfParticipant = participants.find((p) => p.userId === membership.userId);
    const displayName =
      selfParticipant?.displayName ??
      messages.find((m) => m.sender?.id === membership.userId)?.sender?.displayName ??
      "You";
    generateChatPdf({
      roomNumber: membership.room?.roomNumber ?? "",
      topic: round?.topic ?? "",
      yourRole: roleLabel(membership.assignedRole),
      yourDisplayName: displayName,
      messages,
    });
  }

  const fireConfetti = useCallback(() => {
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  useEffect(() => {
    if (guessResult?.correct && !confettiFiredRef.current) {
      fireConfetti();
    }
  }, [guessResult, fireConfetti]);

  async function submitGuess(guessedUserId: string) {
    setGuessSubmitting(true);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: params.roomId, guessedUserId })
      });
      const data = await res.json();
      if (data.guess) {
        setGuessResult({ correct: data.guess.correct });
        setShowGuessScreen(false);
      }
    } finally {
      setGuessSubmitting(false);
    }
  }

  function sendAnswer() {
    if (!input.trim()) return;
    if (!isResponder) return;
    if (!activeQuestion) {
      setChatNotice("Wait for the Interrogator to ask a question.");
      return;
    }
    if (hasSubmittedAnswer) {
      setChatNotice("You already submitted an answer for this question.");
      return;
    }
    setChatNotice(null);
    socketRef.current?.emit("message:send", {
      roomId: params.roomId,
      recipientId: null,
      body: input
    });
    setInput("");
  }

  if (waitingForGuess) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-8">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Time is Up!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
              <p className="text-lg text-[var(--muted)]">
                Waiting for the Interrogator to choose who the True Collegian is...
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (nonInterrogatorResult) {
    const { correct, wasChosen, myRole } = nonInterrogatorResult;
    const isTrueCollegian = myRole === "REAL";
    const isPoser = myRole === "FAKE";

    let emoji = "";
    let title = "";
    let message = "";
    let messageColor = "";

    if (isTrueCollegian && wasChosen && correct) {
      emoji = "🎯";
      title = "You Were Identified!";
      message = "The Interrogator chose you and correctly identified you as the True Collegian!";
      messageColor = "text-blue-600";
    } else if (isTrueCollegian && !wasChosen && !correct) {
      emoji = "🫣";
      title = "You Weren't Picked!";
      message = "The Interrogator picked someone else, thinking they were the True Collegian. They couldn't tell it was actually you!";
      messageColor = "text-orange-600";
    } else if (isPoser && wasChosen && !correct) {
      emoji = "🎭";
      title = "You Fooled the Interrogator!";
      message = "The Interrogator chose you as the True Collegian! You successfully blended in and they couldn't tell you were the Poser.";
      messageColor = "text-green-600";
    } else if (isPoser && !wasChosen && correct) {
      emoji = "😅";
      title = "The Interrogator Saw Through It!";
      message = "The Interrogator correctly identified the True Collegian. They weren't fooled by the Poser this time!";
      messageColor = "text-red-600";
    }

    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-8">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="text-6xl">{emoji}</div>
              <p className={`text-lg font-semibold ${messageColor}`}>{message}</p>
            </div>
            <Button
              size="lg"
              className="w-full mt-4"
              onClick={() => { guessFlowActiveRef.current = false; router.push("/waiting"); }}
            >
              Continue to Waiting Room
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (showGuessScreen || guessResult) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-8">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <CardTitle className="text-2xl">
              {guessResult ? (guessResult.correct ? "You got it right!" : "You got it wrong!") : "Who is the True Collegian?"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {showGuessScreen && !guessResult && (
              <>
                <p className="text-[var(--muted)]">
                  Time is up! Based on the conversation, who do you think was the real student?
                </p>
                <div className="flex flex-col gap-3">
                  {guessCandidates.map((c) => (
                    <Button
                      key={c.userId}
                      size="lg"
                      className="w-full text-lg py-6"
                      variant="outline"
                      disabled={guessSubmitting}
                      onClick={() => submitGuess(c.userId)}
                    >
                      {c.displayName}
                    </Button>
                  ))}
                </div>
              </>
            )}
            {guessResult && (
              <>
                {guessResult.correct ? (
                  <div className="space-y-4">
                    <div className="text-6xl">🎉</div>
                    <p className="text-lg font-semibold text-green-600">
                      Great detective work! You correctly identified the True Collegian.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-6xl">😔</div>
                    <p className="text-lg font-semibold text-red-600">
                      The Poser fooled you! Better luck next time.
                    </p>
                  </div>
                )}
                <Button
                  size="lg"
                  className="w-full mt-4"
                  onClick={() => { guessFlowActiveRef.current = false; router.push("/waiting"); }}
                >
                  Continue to Waiting Room
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <div className="w-full lg:w-2/3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>{membership?.room?.name ? <RoomNameWithSchoolColor name={membership.room.name} /> : `Room ${membership?.room?.roomNumber ?? ""}`}</CardTitle>
              {round && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <p className="text-[var(--muted)]">Time left: {timeLeft ?? "--:--"}</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex h-[70vh] flex-col gap-4">
              <div
                ref={chatContainerRef}
                onScroll={handleChatScroll}
                className="flex-1 overflow-y-auto rounded-2xl border border-[var(--border)] bg-white/70 p-4"
              >
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div key={message.id} className="text-sm">
                      <div className={`text-xs ${message.isQuestion ? "text-red-600" : "text-[var(--muted)]"}`}>
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}{" "}
                        {message.type === "SYSTEM" ? "System" : message.sender?.displayName}
                        {message.isQuestion ? " (Interrogator question)" : ""}
                        {message.recipient ? ` (DM to ${message.recipient.displayName})` : ""}
                      </div>
                      <div className={message.isQuestion ? "font-semibold text-red-600" : ""}>{message.body}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {isInterrogator && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={questionDuration}
                      onChange={(e) => setQuestionDuration(Number(e.target.value))}
                    >
                      <option value={15}>15 sec</option>
                      <option value={60}>60 sec</option>
                    </select>
                    <input
                      className="flex-1 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Send a question to Poser and True Collegian"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendQuestion();
                        }
                      }}
                    />
                    <Button type="button" onClick={sendQuestion} disabled={Boolean(activeQuestion)}>
                      Ask
                    </Button>
                  </div>
                )}

                {isResponder && (
                  <div className="flex flex-wrap items-center gap-2">
                    {showQuestionTimer && (
                      <span className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold tabular-nums ${timerUrgent ? "bg-red-600 text-white animate-timer-pulse" : "bg-red-100 text-red-600"}`}>
                        {activeQuestion ? questionTimeLeft ?? "00s" : "00s"}
                      </span>
                    )}
                    <input
                      className="flex-1 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={activeQuestion ? "Type your answer" : "Waiting for the Interrogator's question"}
                      disabled={!activeQuestion || hasSubmittedAnswer}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendAnswer();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={sendAnswer}
                      disabled={!activeQuestion || hasSubmittedAnswer}
                    >
                      Send
                    </Button>
                  </div>
                )}

                {!isInterrogator && !isResponder && (
                  <div className="text-sm text-[var(--muted)]">
                    Chat is unavailable for your role in this room.
                  </div>
                )}

                {isInterrogator && showQuestionTimer && (
                  <div className="flex items-center gap-2 text-xs text-red-600">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold tabular-nums ${timerUrgent ? "bg-red-600 text-white animate-timer-pulse" : "bg-red-100 text-red-600"}`}>
                      {activeQuestion ? questionTimeLeft ?? "00s" : "00s"}
                    </span>
                    Question active — waiting for answers
                  </div>
                )}
                {isResponder && hasSubmittedAnswer && (
                  <div className="text-xs text-[var(--muted)]">
                    Answer submitted. Waiting for timer to finish before reveal.
                  </div>
                )}
                {chatNotice && (
                  <div className="text-xs text-[var(--muted)]">
                    {chatNotice}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="w-full lg:w-1/3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your role</CardTitle>
            </CardHeader>
            <CardContent>
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold"
                style={roleBadgeStyle(membership?.assignedRole)}
              >
                {roleLabel(membership?.assignedRole)}
              </span>
              <p className="text-sm text-[var(--muted)]">{roleText}</p>
              <Button
                type="button"
                onClick={handleDownloadPdf}
                className="mt-3 w-full"
                variant="outline"
                disabled={messages.length === 0}
              >
                Download Chat Transcript
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Participants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {participants.map((participant) => {
                const isMe = participant.userId === membership?.userId;
                return (
                  <div key={participant.userId} className={`text-sm flex items-center gap-2 ${isMe ? "font-bold" : ""}`}>
                    {participant.displayName}
                    {isMe && <span className="text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded-full">(You)</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
