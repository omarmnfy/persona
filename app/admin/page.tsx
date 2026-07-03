"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { io, Socket } from "socket.io-client";
import { roleBadgeStyle, roleLabel } from "@/lib/roleMeta";
import { SCHOOL_OPTIONS } from "@/lib/personaCatalog";
import { generateChatPdf } from "@/lib/chatPdf";

const SCHOOL_COLORS: Record<string, string> = {
  "Pomona College": "#0057b8",
  "Harvey Mudd College": "#FDB913",
  "Claremont McKenna College": "#800000",
  "Pitzer College": "#F7941D",
  "Scripps College": "#34715B",
  "Other": "#888888"
};
const ROLE_OPTIONS = ["REAL", "FAKE", "INTERROGATOR", "WAITING"] as const;

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "rgba(0, 0, 0, 0.06)";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function RoundRow({ round, localIndex, roundCodes, formatStatus, timeLeft, onViewRooms, onStart, onEnd, onDelete, onExport }: {
  round: any;
  localIndex?: number;
  roundCodes: Record<string, string>;
  formatStatus: (s: string) => string;
  timeLeft: (d?: string | null) => string | null;
  onViewRooms: () => void;
  onStart: () => void;
  onEnd: () => void;
  onDelete: () => void;
  onExport?: () => void;
}) {
  const statusColor = round.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" :
    round.status === "SCHEDULED" ? "bg-blue-50 text-blue-700 border-blue-200" :
    "bg-gray-100 text-gray-500 border-gray-200";

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 hover:bg-gray-50/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-[var(--muted)] uppercase">
              {localIndex ? `R${localIndex}` : `#${round.roundNumber}`}
            </span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
              {formatStatus(round.status)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[var(--ink)]">{round.topic}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--muted)] mt-0.5">
              <span>{Math.round(round.durationSeconds / 60)} min</span>
              {round.expectedStudents && <span>{round.expectedStudents} students</span>}
              <span>{round.rooms?.length ?? 0} rooms</span>
              {(roundCodes[round.id] || round.joinCodePlain) && (
                <span className="font-mono">Code: {roundCodes[round.id] ?? round.joinCodePlain}</span>
              )}
              {round.status === "ACTIVE" && round.endsAt && (
                <span className="text-green-600 font-semibold">Time left: {timeLeft(round.endsAt)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {round.status === "SCHEDULED" && (
            <>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={onViewRooms}>Rooms</Button>
            </>
          )}
          {round.status !== "ACTIVE" && (
            <Button size="sm" className="text-xs h-7" onClick={onStart}>
              {round.status === "ENDED" ? "Restart" : "Start"}
            </Button>
          )}
          {round.status === "ACTIVE" && (
            <>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={onViewRooms}>Rooms</Button>
              <Button size="sm" variant="danger" className="text-xs h-7" onClick={onEnd}>End</Button>
            </>
          )}
          {onExport && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onExport}>Export</Button>
          )}
          <Button size="sm" variant="danger" className="text-xs h-7" onClick={onDelete} disabled={round.status === "ACTIVE"}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("rounds");
  const [rounds, setRounds] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [availableAssignedNames, setAvailableAssignedNames] = useState<string[]>([]);
  const [activeRound, setActiveRound] = useState<any>(null);
  const [settings, setSettings] = useState<{
    allowAdminPosting: boolean;
    showAdminJoinMessage?: boolean;
    silentViewReadOnly?: boolean;
  } | null>(null);
  const [joinCodeInfo, setJoinCodeInfo] = useState<any>(null);
  const [exportRoundId, setExportRoundId] = useState("");
  const [exportSessionId, setExportSessionId] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [overrideMap, setOverrideMap] = useState<Record<string, { roomId: string; role: string }>>({});
  const [assignedNameMap, setAssignedNameMap] = useState<Record<string, string>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, { url: string; sent: boolean }>>({});
  const [inviteTargetEmail, setInviteTargetEmail] = useState("");
  const [adminInviteLinks, setAdminInviteLinks] = useState<Record<string, { url: string; sent: boolean }>>({});
  const [adminInviteTargetEmail, setAdminInviteTargetEmail] = useState("");
  const [now, setNow] = useState(Date.now());
  const [currentAccountType, setCurrentAccountType] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [roundCodes, setRoundCodes] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [unsessionedRounds, setUnsessionedRounds] = useState<any[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [sessionRoundCount, setSessionRoundCount] = useState(3);
  const [sessionDuration, setSessionDuration] = useState(10);
  const [sessionExpected, setSessionExpected] = useState(24);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [selectedRoomRoundId, setSelectedRoomRoundId] = useState<string>("");
  const [roomsForRound, setRoomsForRound] = useState<any[]>([]);
  const [roomsRound, setRoomsRound] = useState<any>(null);
  const [waitingForRound, setWaitingForRound] = useState<any[]>([]);
  const [roomReassign, setRoomReassign] = useState<Record<string, { roomId: string; role: string }>>({});
  const [analyticsSessionId, setAnalyticsSessionId] = useState("");
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  function formatStatus(status?: string | null) {
    if (!status) return "--";
    const normalized = status.replace(/_/g, " ").toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

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
        setCurrentAccountType(data.user.accountType);
        refreshAll();
        const s = io({ path: "/socket.io", auth: { role: "ADMIN" } });
        socketRef.current = s;
        s.on("admin:update", () => refreshAll());
        s.on("round:update", () => refreshAll());
      });
    return () => {
      socketRef.current?.disconnect();
    };
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "rooms" && !selectedRoomRoundId && rounds.length > 0) {
      const active = rounds.find((r: any) => r.status === "ACTIVE");
      const scheduled = rounds.find((r: any) => r.status === "SCHEDULED");
      const defaultRound = active || scheduled || rounds[0];
      if (defaultRound) {
        setSelectedRoomRoundId(defaultRound.id);
        fetchRoomsForRound(defaultRound.id);
      }
    }
  }, [activeTab, rounds]);

  async function refreshAll() {
    const [roundsRes, roomsRes, studentsRes, adminsRes, settingsRes, joinCodeRes, sessionsRes] = await Promise.all([
      fetch("/api/admin/rounds"),
      fetch("/api/admin/rooms"),
      fetch("/api/admin/students"),
      fetch("/api/admin/admins"),
      fetch("/api/admin/settings"),
      fetch("/api/admin/join-code"),
      fetch("/api/admin/sessions")
    ]);
    setRounds((await roundsRes.json()).rounds ?? []);
    const sessionsPayload = await sessionsRes.json();
    setSessions(sessionsPayload.sessions ?? []);
    setUnsessionedRounds(sessionsPayload.unsessionedRounds ?? []);
    const roomsPayload = await roomsRes.json();
    setRooms(roomsPayload.rooms ?? []);
    setActiveRound(roomsPayload.round ?? null);
    const studentsPayload = await studentsRes.json();
    setStudents(studentsPayload.students ?? []);
    setAvailableAssignedNames(studentsPayload.availableAssignedNames ?? []);
    setAdmins((await adminsRes.json()).admins ?? []);
    setSettings(await settingsRes.json());
    setJoinCodeInfo(await joinCodeRes.json());
  }

  async function fetchRoomsForRound(roundId: string) {
    const res = await fetch(`/api/admin/rooms?roundId=${roundId}`);
    const data = await res.json();
    setRoomsForRound(data.rooms ?? []);
    setRoomsRound(data.round ?? null);
    setWaitingForRound(data.waiting ?? []);
  }

  async function generateAssignmentsForRound(roundId: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ roundId, action: "generate" })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to generate assignments");
      return;
    }
    await refreshAll();
    await fetchRoomsForRound(roundId);
  }

  async function shuffleAssignmentsForRound(roundId: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ roundId, action: "reroll" })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to shuffle assignments");
      return;
    }
    await refreshAll();
    await fetchRoomsForRound(roundId);
  }

  function getSessionForRound(roundId: string) {
    return sessions.find((s: any) => s.rounds.some((r: any) => r.id === roundId)) ?? null;
  }

  async function assignRound(roundId: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ roundId, action: "generate" })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to assign students");
      return;
    }
    await refreshAll();
    if (selectedRoomRoundId) await fetchRoomsForRound(selectedRoomRoundId);
  }

  async function assignSessionFairly(sessionId: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ sessionId, action: "session-assign" })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to assign session");
      return;
    }
    await refreshAll();
    if (selectedRoomRoundId) await fetchRoomsForRound(selectedRoomRoundId);
  }

  async function reassignStudentInRound(roundId: string, userId: string, roomId: string, role: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ roundId, userId, roomId: roomId || null, role, forceUnlock: true })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to reassign student");
      return;
    }
    setRoomReassign((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    await fetchRoomsForRound(roundId);
  }

  async function createSession() {
    if (!csrfToken) return;
    setSessionError(null);
    if (!sessionName.trim()) {
      setSessionError("Please enter a session name.");
      return;
    }
    if (!sessionDuration || sessionDuration < 1) {
      setSessionError("Please set a duration of at least 1 minute.");
      return;
    }
    if (!sessionExpected || sessionExpected < 1) {
      setSessionError("Please enter the expected number of students.");
      return;
    }
    const res = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({
        name: sessionName,
        roundCount: sessionRoundCount,
        durationMinutes: sessionDuration,
        expectedStudents: sessionExpected
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setSessionError(data.error ?? "Failed to create session");
      return;
    }
    if (data.rounds) {
      const codes: Record<string, string> = {};
      data.rounds.forEach((r: any) => { codes[r.id] = r.joinCode; });
      setRoundCodes((prev) => ({ ...prev, ...codes }));
    }
    if (data.session?.id) {
      setExpandedSessions((prev) => ({ ...prev, [data.session.id]: true }));
    }
    setSessionName("");
    setSessionRoundCount(3);
    await refreshAll();
  }

  async function deleteSession(sessionId: string) {
    if (!csrfToken) return;
    const confirmed = window.confirm("Delete this entire session and all its rounds, rooms, and messages? This cannot be undone.");
    if (!confirmed) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ sessionId })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to delete session");
      return;
    }
    await refreshAll();
  }

  async function roundAction(roundId: string, action: string) {
    if (!csrfToken) return;
    await fetch("/api/admin/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ roundId, action })
    });
    await refreshAll();
  }

  async function deleteRound(roundId: string) {
    if (!csrfToken) return;
    const confirmed = window.confirm(
      "Delete this round and all its rooms, assignments, and messages? This cannot be undone."
    );
    if (!confirmed) return;
    const res = await fetch("/api/admin/rounds", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ roundId })
    });
    if (!res.ok) {
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        data = {};
      }
      alert(data.error ?? "Failed to delete round");
      return;
    }
    await refreshAll();
  }

  async function deleteRoom(roomId: string) {
    if (!csrfToken) return;
    const confirmed = window.confirm("Delete this room? This will remove its current assignments.");
    if (!confirmed) return;
    await fetch("/api/admin/rooms", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ roomId })
    });
    await refreshAll();
  }

  async function addRoom(roundId: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/rooms", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ roundId })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to add room");
      return;
    }
    await fetchRoomsForRound(roundId);
  }

  const [dragStudent, setDragStudent] = useState<{ userId: string; realName: string; sourceRoomId: string | null; role: string; school: string | null } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, student: { userId: string; realName: string; role: string; school: string | null }, sourceRoomId: string | null) {
    setDragStudent({ ...student, sourceRoomId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", student.userId);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(targetId);
  }

  function handleDragLeave() {
    setDragOverTarget(null);
  }

  async function handleDrop(e: React.DragEvent, targetRoomId: string | null) {
    e.preventDefault();
    setDragOverTarget(null);
    if (!dragStudent || !selectedRoomRoundId) return;
    if (dragStudent.sourceRoomId === targetRoomId) {
      setDragStudent(null);
      return;
    }
    const role = targetRoomId ? (dragStudent.role === "WAITING" ? "AUTO" : dragStudent.role) : "WAITING";
    await reassignStudentInRound(selectedRoomRoundId, dragStudent.userId, targetRoomId ?? "", role);
    setDragStudent(null);
  }

  function handleDragEnd() {
    setDragStudent(null);
    setDragOverTarget(null);
  }

  async function deleteStudent(userId: string, label: string) {
    if (!csrfToken) return;
    const confirmed = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!confirmed) return;
    const res = await fetch("/api/admin/students", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ userId })
    });
    if (!res.ok) {
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        data = {};
      }
      alert(data.error ?? "Failed to delete student");
      return;
    }
    await refreshAll();
  }

  async function generateJoinCode() {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/join-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      }
    });
    const data = await res.json();
    setJoinCodeInfo({ hasJoinCode: true, joinCode: data.joinCode });
  }

  async function toggleAdminPosting() {
    if (!csrfToken || !settings) return;
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ allowAdminPosting: !settings.allowAdminPosting })
    });
    await refreshAll();
  }

  async function toggleAdminJoinMessage() {
    if (!csrfToken || !settings) return;
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ showAdminJoinMessage: !settings.showAdminJoinMessage })
    });
    await refreshAll();
  }

  async function toggleSilentReadOnly() {
    if (!csrfToken || !settings) return;
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ silentViewReadOnly: !settings.silentViewReadOnly })
    });
    await refreshAll();
  }


  async function addStudent() {
    if (!csrfToken || !newStudentName || !newStudentEmail) return;
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ realName: newStudentName, email: newStudentEmail })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to add student");
      return;
    }
    if (data.inviteUrl) {
      setInviteLinks((prev) => ({
        ...prev,
        [newStudentEmail.toLowerCase()]: { url: data.inviteUrl, sent: Boolean(data.sent) }
      }));
    }
    setNewStudentName("");
    setNewStudentEmail("");
    await refreshAll();
  }

  async function resendInvite(email: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.inviteUrl) {
      setInviteLinks((prev) => ({ ...prev, [email]: { url: data.inviteUrl, sent: Boolean(data.sent) } }));
      setInviteTargetEmail("");
    }
  }

  async function addAdmin() {
    if (!csrfToken || !newAdminName || !newAdminEmail) return;
    const normalizedEmail = newAdminEmail.toLowerCase();
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ realName: newAdminName, email: normalizedEmail })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to add admin");
      return;
    }
    if (data.inviteUrl) {
      setAdminInviteLinks((prev) => ({
        ...prev,
        [normalizedEmail]: { url: data.inviteUrl, sent: Boolean(data.sent) }
      }));
    }
    setNewAdminName("");
    setNewAdminEmail("");
    await refreshAll();
  }

  async function resendAdminInvite(email: string) {
    if (!csrfToken) return;
    const normalizedEmail = email.toLowerCase();
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ email: normalizedEmail })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to resend admin invite");
      return;
    }
    if (data.inviteUrl) {
      setAdminInviteLinks((prev) => ({
        ...prev,
        [normalizedEmail]: { url: data.inviteUrl, sent: Boolean(data.sent) }
      }));
      setAdminInviteTargetEmail("");
    }
    await refreshAll();
  }

  async function deleteAdmin(adminId: string, adminName: string) {
    if (!csrfToken) return;
    if (!confirm(`Are you sure you want to remove ${adminName}? This action cannot be undone.`)) return;
    const res = await fetch(`/api/admin/admins?id=${adminId}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken }
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to remove admin");
      return;
    }
    await refreshAll();
  }

  async function updateMembership(userId: string, roomId: string, role: string) {
    if (!csrfToken || !activeRound) return;
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        roundId: activeRound.id,
        userId,
        roomId: roomId || null,
        role,
        forceUnlock: true
      })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to update membership");
      return;
    }
    await refreshAll();
  }

  async function updateAssignedName(userId: string, assignedName: string) {
    if (!csrfToken || !assignedName) return;
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ userId, assignedName })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to update assigned name");
      return;
    }
    setAssignedNameMap((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    await refreshAll();
  }

  async function updateStudentSchool(userId: string, school: string) {
    if (!csrfToken) return;
    const res = await fetch("/api/admin/students", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ userId, school })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to update school");
      return;
    }
    await refreshAll();
  }

  function assignedNameOptions(student: any) {
    const options = new Set(availableAssignedNames);
    if (student.assignedName) options.add(student.assignedName);
    return Array.from(options);
  }

  function downloadExport(params: { format: "json" | "csv"; type?: string; scope?: string }) {
    if (!exportRoundId) return;
    const query = new URLSearchParams({
      roundId: exportRoundId,
      format: params.format
    });
    if (params.type) query.set("type", params.type);
    if (params.scope) query.set("scope", params.scope);
    window.open(`/api/admin/exports?${query.toString()}`, "_blank");
  }

  async function fetchAnalytics(sessionId: string) {
    if (!sessionId) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?sessionId=${sessionId}`, {
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
        setExpandedRounds({});
        setExpandedRooms({});
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function timeLeft(endsAt?: string | null) {
    if (!endsAt) return null;
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return "0 min";
    const minutes = Math.ceil(diff / 60000);
    return `${minutes} min`;
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Admin Dashboard</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                }}
              >
                Sign out
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs>
              <TabsList>
                {[
                  { id: "rounds", label: "Rounds" },
                  { id: "rooms", label: "Rooms" },
                  { id: "students", label: "Students" },
                  { id: "settings", label: "Settings" },
                  { id: "exports", label: "Exports" },
                  { id: "analytics", label: "Analytics" }
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {activeTab === "rounds" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-[var(--muted)]">
                  Create a session with multiple rounds. Each round will automatically get rooms based on the expected student count.
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Session Name / Topic</label>
                    <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. Week 1 Discussion" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Rounds</label>
                    <Input type="number" min={1} max={10} value={sessionRoundCount} onChange={(e) => setSessionRoundCount(Number(e.target.value))} />
                    <p className="text-xs text-[var(--muted)]">How many rounds in this session</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Duration per round (min)</label>
                    <Input type="number" min={1} value={sessionDuration} onChange={(e) => setSessionDuration(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Expected students</label>
                    <Input type="number" min={1} value={sessionExpected} onChange={(e) => setSessionExpected(Number(e.target.value))} />
                    <p className="text-xs text-[var(--muted)]">
                      {Math.max(1, Math.ceil(sessionExpected / 3))} rooms per round (3 students each)
                    </p>
                  </div>
                </div>
                <Button onClick={createSession}>Create Session</Button>
                {sessionError && <p className="text-sm font-semibold text-red-600">{sessionError}</p>}
              </CardContent>
            </Card>

            {sessions.map((ds: any) => {
              const isExpanded = expandedSessions[ds.id] !== false;
              const activeCount = ds.rounds.filter((r: any) => r.status === "ACTIVE").length;
              const scheduledCount = ds.rounds.filter((r: any) => r.status === "SCHEDULED").length;
              const endedCount = ds.rounds.filter((r: any) => r.status === "ENDED").length;

              return (
                <Card key={ds.id}>
                  <CardHeader className="cursor-pointer" onClick={() => setExpandedSessions((prev) => ({ ...prev, [ds.id]: !isExpanded }))}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{isExpanded ? "▾" : "▸"}</span>
                        <div>
                          <CardTitle className="text-lg">Session {ds.sessionNumber}: {ds.name}</CardTitle>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {ds.rounds.length} round{ds.rounds.length !== 1 ? "s" : ""}
                            {activeCount > 0 && <span className="ml-2 text-green-600 font-semibold">{activeCount} active</span>}
                            {scheduledCount > 0 && <span className="ml-2 text-blue-600 font-semibold">{scheduledCount} scheduled</span>}
                            {endedCount > 0 && <span className="ml-2 text-gray-500">{endedCount} ended</span>}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); deleteSession(ds.id); }}>
                        Delete Session
                      </Button>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      <div className="space-y-2">
                        {ds.rounds.map((round: any, idx: number) => (
                          <RoundRow
                            key={round.id}
                            round={round}
                            localIndex={idx + 1}
                            roundCodes={roundCodes}
                            formatStatus={formatStatus}
                            timeLeft={timeLeft}
                            onViewRooms={() => { setSelectedRoomRoundId(round.id); fetchRoomsForRound(round.id); setActiveTab("rooms"); }}
                            onStart={() => roundAction(round.id, "start")}
                            onEnd={() => roundAction(round.id, "end")}
                            onDelete={() => deleteRound(round.id)}
                            onExport={() => { setExportSessionId(ds.id); setExportRoundId(round.id); setActiveTab("exports"); }}
                          />
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {unsessionedRounds.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Standalone Rounds</CardTitle>
                  <p className="text-xs text-[var(--muted)]">Rounds created individually (not part of a session)</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {unsessionedRounds.map((round: any) => (
                      <RoundRow
                        key={round.id}
                        round={round}
                        roundCodes={roundCodes}
                        formatStatus={formatStatus}
                        timeLeft={timeLeft}
                        onViewRooms={() => { setSelectedRoomRoundId(round.id); fetchRoomsForRound(round.id); setActiveTab("rooms"); }}
                        onStart={() => roundAction(round.id, "start")}
                        onEnd={() => roundAction(round.id, "end")}
                        onDelete={() => deleteRound(round.id)}
                        onExport={() => { setExportSessionId(""); setExportRoundId(round.id); setActiveTab("exports"); }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}

        {activeTab === "rooms" && (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Room Assignments</CardTitle>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold whitespace-nowrap">Round:</label>
                    <select
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={selectedRoomRoundId}
                      onChange={(e) => {
                        setSelectedRoomRoundId(e.target.value);
                        setRoomReassign({});
                        if (e.target.value) {
                          fetchRoomsForRound(e.target.value);
                        } else {
                          setRoomsForRound([]);
                          setRoomsRound(null);
                          setWaitingForRound([]);
                        }
                      }}
                    >
                      <option value="">Select a round</option>
                      {sessions.map((s: any) => (
                        <optgroup key={s.id} label={`${s.name || "Untitled Session"} (${s.rounds.length} rounds)`}>
                          {s.rounds.map((r: any, idx: number) => (
                            <option key={r.id} value={r.id}>
                              Round {idx + 1} — {r.topic || "No topic"} ({formatStatus(r.status)})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {unsessionedRounds.length > 0 && (
                        <optgroup label="Standalone Rounds">
                          {unsessionedRounds.map((r: any) => (
                            <option key={r.id} value={r.id}>
                              Round {r.roundNumber} — {r.topic || "No topic"} ({formatStatus(r.status)})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedRoomRoundId && (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">Select a round above to view its room assignments.</p>
                )}
                {selectedRoomRoundId && roomsRound && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-white/50 px-4 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">Round {roomsRound.roundNumber}: {roomsRound.topic}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatStatus(roomsRound.status)} — {roomsForRound.length} room{roomsForRound.length !== 1 ? "s" : ""}, {roomsForRound.reduce((sum: number, r: any) => sum + r.participants.length, 0)} assigned, {waitingForRound.length} waiting
                        </p>
                      </div>
                      {roomsRound.status === "SCHEDULED" && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => assignRound(selectedRoomRoundId)}>
                            Assign Students
                          </Button>
                          {(() => {
                            const parentSession = getSessionForRound(selectedRoomRoundId);
                            if (!parentSession) return null;
                            const scheduledCount = parentSession.rounds.filter((r: any) => r.status === "SCHEDULED").length;
                            if (scheduledCount < 2) return null;
                            return (
                              <Button size="sm" variant="outline" onClick={() => assignSessionFairly(parentSession.id)}>
                                Assign All {scheduledCount} Rounds (Fair Interrogator)
                              </Button>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {roomsForRound.length === 0 && (
                      <p className="py-4 text-center text-sm text-[var(--muted)]">No rooms with assignments yet. Click "Assign Students" to auto-assign students to rooms.</p>
                    )}

                    {roomsForRound.map((room: any) => {
                      const isDropTarget = dragOverTarget === room.id && dragStudent?.sourceRoomId !== room.id;
                      const canEdit = roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE";
                      return (
                      <div
                        key={room.id}
                        className={`rounded-2xl border-2 p-3 transition-colors ${isDropTarget ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}
                        onDragOver={canEdit ? (e) => handleDragOver(e, room.id) : undefined}
                        onDragLeave={canEdit ? handleDragLeave : undefined}
                        onDrop={canEdit ? (e) => handleDrop(e, room.id) : undefined}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold">Room {room.roomNumber}{room.name ? `: ${room.name}` : ""}</p>
                            <p className="text-sm text-[var(--muted)]">
                              {formatStatus(room.status)} — {room.participants.length} student{room.participants.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(roomsRound.status === "ACTIVE") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => router.push(`/admin/room/${room.id}?mode=silent`)}
                                >
                                  Silent view
                                </Button>
                                <Button size="sm" onClick={() => router.push(`/admin/room/${room.id}?mode=visible`)}>
                                  Visible join
                                </Button>
                              </>
                            )}
                            {roomsRound.status !== "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => { deleteRoom(room.id).then(() => fetchRoomsForRound(selectedRoomRoundId)); }}
                              >
                                Delete room
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {room.participants.map((p: any) => (
                            <div
                              key={p.userId}
                              draggable={canEdit}
                              onDragStart={canEdit ? (e) => handleDragStart(e, { userId: p.userId, realName: p.realName, role: p.role, school: p.school }, room.id) : undefined}
                              onDragEnd={canEdit ? handleDragEnd : undefined}
                              className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white/60 px-3 py-2 text-sm ${canEdit ? "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow" : ""}`}
                            >
                              <span className="font-semibold">{p.realName ?? p.displayName}</span>
                              <span
                                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                                style={roleBadgeStyle(p.role)}
                              >
                                {roleLabel(p.role)}
                              </span>
                              {p.assignedName && p.assignedName !== p.realName && (
                                <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-xs text-[var(--muted)]">
                                  {p.assignedName}
                                </span>
                              )}
                              {p.school && (
                                <span
                                  className="inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-[var(--ink)]"
                                  style={{
                                    borderColor: SCHOOL_COLORS[p.school] ?? "var(--border)",
                                    backgroundColor: hexToRgba(SCHOOL_COLORS[p.school] ?? "#999999", 0.12)
                                  }}
                                >
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: SCHOOL_COLORS[p.school] ?? "#999999" }}
                                  />
                                  {p.school}
                                </span>
                              )}
                              {canEdit && (
                                <div className="ml-auto flex items-center gap-1">
                                  <select
                                    className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-xs"
                                    value={roomReassign[p.userId]?.role ?? p.role}
                                    onChange={(e) => {
                                      const newRole = e.target.value;
                                      reassignStudentInRound(selectedRoomRoundId, p.userId, room.id, newRole);
                                    }}
                                  >
                                    {ROLE_OPTIONS.map((role) => (
                                      <option key={role} value={role}>{roleLabel(role)}</option>
                                    ))}
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs px-2 py-0.5 text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() =>
                                      reassignStudentInRound(
                                        selectedRoomRoundId,
                                        p.userId,
                                        "",
                                        "WAITING"
                                      )
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                          {room.participants.length === 0 && (
                            <p className="py-3 text-center text-xs text-[var(--muted)]">
                              {canEdit ? "Drag students here to assign them" : "No students assigned yet."}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                    })}

                    {(roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE") && (
                      <button
                        className="w-full rounded-2xl border-2 border-dashed border-[var(--border)] py-4 text-sm font-semibold text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                        onClick={() => addRoom(selectedRoomRoundId)}
                      >
                        + Add Room
                      </button>
                    )}

                    <div
                      className={`rounded-2xl border-2 border-dashed p-3 transition-colors ${dragOverTarget === "waiting" ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}
                      onDragOver={(roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE") ? (e) => handleDragOver(e, "waiting") : undefined}
                      onDragLeave={(roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE") ? handleDragLeave : undefined}
                      onDrop={(roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE") ? (e) => handleDrop(e, null) : undefined}
                    >
                      <p className="font-semibold text-[var(--muted)]">Waiting Pool ({waitingForRound.length})</p>
                      <div className="mt-2 space-y-2">
                        {waitingForRound.map((w: any) => {
                          const canEdit = roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE";
                          return (
                          <div
                            key={w.userId}
                            draggable={canEdit}
                            onDragStart={canEdit ? (e) => handleDragStart(e, { userId: w.userId, realName: w.realName, role: "WAITING", school: w.school }, null) : undefined}
                            onDragEnd={canEdit ? handleDragEnd : undefined}
                            className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white/60 px-3 py-2 text-sm ${canEdit ? "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow" : ""}`}
                          >
                            <span className="font-semibold">{w.realName}</span>
                            {w.assignedName && w.assignedName !== w.realName && (
                              <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-xs text-[var(--muted)]">
                                {w.assignedName}
                              </span>
                            )}
                            {w.school && (
                              <span
                                className="inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-[var(--ink)]"
                                style={{
                                  borderColor: SCHOOL_COLORS[w.school] ?? "var(--border)",
                                  backgroundColor: hexToRgba(SCHOOL_COLORS[w.school] ?? "#999999", 0.12)
                                }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: SCHOOL_COLORS[w.school] ?? "#999999" }}
                                />
                                {w.school}
                              </span>
                            )}
                          </div>
                        );
                        })}
                        {waitingForRound.length === 0 && (
                          <p className="py-3 text-center text-xs text-[var(--muted)]">
                            {(roomsRound.status === "SCHEDULED" || roomsRound.status === "ACTIVE") ? "Drag students here to move them to waiting" : "No students waiting."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {selectedRoomRoundId && !roomsRound && (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">Round not found.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "students" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-[var(--border)] bg-white/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-[var(--ink)]">{students.length}</p>
                <p className="text-xs text-[var(--muted)]">Total</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-[var(--ink)]">{students.filter((s: any) => s.isActive).length}</p>
                <p className="text-xs text-[var(--muted)]">Active</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-[var(--ink)]">{students.filter((s: any) => s.isOnline).length}</p>
                <p className="text-xs text-[var(--muted)]">Online</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-[var(--ink)]">{students.filter((s: any) => !s.isActive).length}</p>
                <p className="text-xs text-[var(--muted)]">Pending</p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Add Student</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    placeholder="Full name"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                  />
                  <Button onClick={addStudent} disabled={!newStudentName || !newStudentEmail}>
                    Send invite
                  </Button>
                </div>
                {students.filter((s: any) => !s.isActive).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                    <label className="text-sm font-semibold whitespace-nowrap">Resend invite</label>
                    <select
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={inviteTargetEmail}
                      onChange={(e) => setInviteTargetEmail(e.target.value)}
                    >
                      <option value="">Select inactive student</option>
                      {students
                        .filter((student: any) => !student.isActive)
                        .map((student: any) => (
                          <option key={student.email} value={student.email}>
                            {student.realName} ({student.email})
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!inviteTargetEmail}
                      onClick={() => resendInvite(inviteTargetEmail)}
                    >
                      Send
                    </Button>
                    {inviteTargetEmail && inviteLinks[inviteTargetEmail] && (
                      <span className="text-xs text-[var(--muted)]">
                        {inviteLinks[inviteTargetEmail].sent ? "Sent" : "Link generated"}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Student Roster ({students.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const sorted = [...students].sort((a: any, b: any) => {
                    const aRoom = a.assignedRoom ?? "zzz";
                    const bRoom = b.assignedRoom ?? "zzz";
                    if (aRoom !== bRoom) return aRoom.localeCompare(bRoom);
                    return (a.realName ?? "").localeCompare(b.realName ?? "");
                  });
                  const grouped: Record<string, any[]> = {};
                  sorted.forEach((s: any) => {
                    const key = s.assignedRoom ?? "Unassigned";
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(s);
                  });
                  const groupKeys = Object.keys(grouped).sort((a, b) => {
                    if (a === "Unassigned") return 1;
                    if (b === "Unassigned") return -1;
                    return a.localeCompare(b, undefined, { numeric: true });
                  });

                  return (
                    <div className="space-y-6">
                      {groupKeys.map((groupName) => (
                        <div key={groupName}>
                          <div className="flex items-center gap-2 mb-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                              {groupName === "Unassigned" ? "Waiting Pool" : groupName}
                            </h4>
                            <span className="text-xs text-[var(--muted)]">({grouped[groupName].length})</span>
                            <div className="flex-1 border-t border-[var(--border)]" />
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-semibold text-[var(--muted)]">
                                  <th className="pb-2 pr-4 w-[200px]">Student</th>
                                  <th className="pb-2 pr-4 w-[180px]">School</th>
                                  <th className="pb-2 pr-4 w-[180px]">Assigned Name</th>
                                  <th className="pb-2 pr-4 w-[120px]">Role</th>
                                  <th className="pb-2 text-right w-[120px]">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]">
                                {grouped[groupName].map((student: any) => (
                                  <tr key={student.id} className="group hover:bg-gray-50/50">
                                    <td className="py-2.5 pr-4">
                                      <p className="font-semibold text-[var(--ink)] text-sm leading-tight">{student.realName}</p>
                                      <p className="text-xs text-[var(--muted)] leading-tight">{student.email}</p>
                                    </td>
                                    <td className="py-2.5 pr-4">
                                      <select
                                        className="w-full max-w-[170px] rounded-full border px-2.5 py-1 text-xs font-semibold"
                                        value={student.school ?? ""}
                                        onChange={(e) => updateStudentSchool(student.id, e.target.value)}
                                        style={student.school ? {
                                          borderColor: SCHOOL_COLORS[student.school] ?? "var(--border)",
                                          backgroundColor: hexToRgba(SCHOOL_COLORS[student.school] ?? "#999999", 0.12),
                                          color: "var(--ink)"
                                        } : {
                                          borderColor: "var(--border)",
                                          backgroundColor: "white"
                                        }}
                                      >
                                        <option value="">No school</option>
                                        {SCHOOL_OPTIONS.map((s) => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-2.5 pr-4">
                                      <select
                                        className="max-w-[140px] rounded border border-[var(--border)] bg-white px-2 py-1 text-xs"
                                        value={student.assignedName ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val && val !== student.assignedName) {
                                            updateAssignedName(student.id, val);
                                          }
                                        }}
                                      >
                                        <option value="">Select</option>
                                        {assignedNameOptions(student).map((name: string) => (
                                          <option key={name} value={name}>{name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-2.5 pr-4">
                                      <span
                                        className="inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                                        style={roleBadgeStyle(student.assignedRole)}
                                      >
                                        {roleLabel(student.assignedRole)}
                                      </span>
                                    </td>
                                    <td className="py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {!student.isActive && (
                                          <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => resendInvite(student.email)}>
                                            Resend
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="danger"
                                          className="text-xs h-6"
                                          onClick={() => deleteStudent(student.id, student.realName)}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      {students.length === 0 && (
                        <p className="py-8 text-center text-sm text-[var(--muted)]">No students yet. Add one above to get started.</p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Allow admin posting</p>
                  <p className="text-sm text-[var(--muted)]">Enable admins to post in rooms when visible.</p>
                </div>
                <Button variant="outline" size="sm" onClick={toggleAdminPosting}>
                  {settings?.allowAdminPosting ? "Disable" : "Enable"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Show admin join message</p>
                  <p className="text-sm text-[var(--muted)]">Announce admin visible join in chat.</p>
                </div>
                <Button variant="outline" size="sm" onClick={toggleAdminJoinMessage}>
                  {settings?.showAdminJoinMessage ? "Disable" : "Enable"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Silent view read-only</p>
                  <p className="text-sm text-[var(--muted)]">Block admins from posting while hidden.</p>
                </div>
                <Button variant="outline" size="sm" onClick={toggleSilentReadOnly}>
                  {settings?.silentViewReadOnly ? "Disable" : "Enable"}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Class join code</p>
                  <p className="text-sm text-[var(--muted)]">
                    {joinCodeInfo?.joinCode
                      ? `Current code: ${joinCodeInfo.joinCode}`
                      : joinCodeInfo?.hasJoinCode
                      ? "Join code is active (hidden). Generate a new code to reveal."
                      : "Generate a new code"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={generateJoinCode}>
                  Generate
                </Button>
              </div>

              <div className="rounded-2xl border border-[var(--border)] p-4 space-y-4">
                <div>
                  <p className="font-semibold">Admin invitations</p>
                  <p className="text-sm text-[var(--muted)]">
                    Invite additional instructors/TAs as platform admins.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Add admin</label>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      placeholder="Full name"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                    />
                    <Input
                      placeholder="Email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                    />
                    <Button onClick={addAdmin} disabled={!newAdminName || !newAdminEmail}>
                      Send admin invite
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Resend invite (inactive admin)</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={adminInviteTargetEmail}
                      onChange={(e) => setAdminInviteTargetEmail(e.target.value)}
                    >
                      <option value="">Select inactive admin</option>
                      {admins
                        .filter((admin) => !admin.isActive)
                        .map((admin) => (
                          <option key={admin.email} value={admin.email}>
                            {admin.realName} ({admin.email})
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!adminInviteTargetEmail}
                      onClick={() => resendAdminInvite(adminInviteTargetEmail)}
                    >
                      Send invite
                    </Button>
                  </div>
                  {adminInviteTargetEmail && adminInviteLinks[adminInviteTargetEmail] && (
                    <p className="text-xs text-[var(--muted)]">
                      Invite: {adminInviteLinks[adminInviteTargetEmail].url}{" "}
                      {adminInviteLinks[adminInviteTargetEmail].sent ? "(sent)" : "(not sent)"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{admin.realName}</p>
                        <p className="text-xs text-[var(--muted)]">{admin.email}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--muted)]">
                          {admin.accountType === "SUPER_ADMIN" ? "Super Admin" : admin.isActive ? "Active" : "Invited"}
                        </span>
                        {!admin.isActive && (
                          <Button size="sm" variant="outline" onClick={() => resendAdminInvite(admin.email)}>
                            Resend invite
                          </Button>
                        )}
                        {admin.accountType !== "SUPER_ADMIN" && (
                          <Button size="sm" variant="outline" className="text-[var(--danger)] border-[var(--danger)] hover:bg-red-50" onClick={() => deleteAdmin(admin.id, admin.realName)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "exports" && (
          <Card>
            <CardHeader>
              <CardTitle>Exports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Session</label>
                  <select
                    className="w-full rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={exportSessionId}
                    onChange={(e) => {
                      const sid = e.target.value;
                      setExportSessionId(sid);
                      setExportRoundId("");
                    }}
                  >
                    <option value="">
                      {unsessionedRounds.length > 0 ? "Standalone rounds" : "Select a session"}
                    </option>
                    {sessions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        Session {s.sessionNumber}: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Round</label>
                  <select
                    className="w-full rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    value={exportRoundId}
                    onChange={(e) => setExportRoundId(e.target.value)}
                  >
                    <option value="">Select a round</option>
                    {(() => {
                      const roundsList = exportSessionId
                        ? sessions.find((s: any) => s.id === exportSessionId)?.rounds ?? []
                        : unsessionedRounds;
                      return roundsList.map((r: any, idx: number) => (
                        <option key={r.id} value={r.id}>
                          {exportSessionId ? `Round ${idx + 1}` : `#${r.roundNumber}`}: {r.topic} ({formatStatus(r.status)})
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!exportRoundId} onClick={() => downloadExport({ format: "json", type: "assignments" })}>
                  Assignments JSON
                </Button>
                <Button disabled={!exportRoundId} variant="outline" onClick={() => downloadExport({ format: "csv", type: "assignments" })}>
                  Assignments CSV
                </Button>
                <Button disabled={!exportRoundId} onClick={() => downloadExport({ format: "json", type: "messages" })}>
                  Chat JSON (incl. DMs)
                </Button>
                <Button disabled={!exportRoundId} variant="outline" onClick={() => downloadExport({ format: "csv", type: "messages", scope: "public" })}>
                  Public Messages CSV
                </Button>
                <Button disabled={!exportRoundId} variant="ghost" onClick={() => downloadExport({ format: "json", type: "full" })}>
                  Full JSON
                </Button>
              </div>
              {!exportRoundId && (
                <p className="text-sm text-[var(--muted)]">Select a session and round above, or click Export on any round in the Rounds tab.</p>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Session Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <label className="text-sm font-semibold">Session</label>
                    <select
                      className="w-full rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      value={analyticsSessionId}
                      onChange={(e) => setAnalyticsSessionId(e.target.value)}
                    >
                      <option value="">Select a session</option>
                      {sessions.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          Session {s.sessionNumber}: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    disabled={!analyticsSessionId || analyticsLoading}
                    onClick={() => fetchAnalytics(analyticsSessionId)}
                  >
                    {analyticsLoading ? "Loading..." : "Load Analytics"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {analyticsData && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      title: "Best Poser",
                      subtitle: "Got away with it the most",
                      list: analyticsData.leaderboards.bestPoser,
                      unit: "fooled",
                      color: "text-purple-700",
                      bg: "bg-purple-50",
                      border: "border-purple-200"
                    },
                    {
                      title: "Best True Collegian",
                      subtitle: "Correctly identified the most",
                      list: analyticsData.leaderboards.bestTrueCollegian,
                      unit: "identified",
                      color: "text-green-700",
                      bg: "bg-green-50",
                      border: "border-green-200"
                    },
                    {
                      title: "Best Interrogator",
                      subtitle: "Best at spotting the Poser",
                      list: analyticsData.leaderboards.bestInterrogator,
                      unit: "correct",
                      color: "text-blue-700",
                      bg: "bg-blue-50",
                      border: "border-blue-200"
                    }
                  ].map((lb) => (
                    <Card key={lb.title}>
                      <CardHeader>
                        <CardTitle className={`text-base ${lb.color}`}>{lb.title}</CardTitle>
                        <p className="text-xs text-[var(--muted)]">{lb.subtitle}</p>
                      </CardHeader>
                      <CardContent>
                        {lb.list.length === 0 ? (
                          <p className="text-sm text-[var(--muted)]">No data yet</p>
                        ) : (
                          <div className="space-y-2">
                            {lb.list.map((entry: any, i: number) => (
                              <div
                                key={entry.userId}
                                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${i === 0 ? `${lb.bg} ${lb.border}` : "border-[var(--border)]"}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-bold ${i === 0 ? lb.color : "text-[var(--muted)]"}`}>
                                    #{i + 1}
                                  </span>
                                  <span className={`text-sm ${i === 0 ? "font-semibold" : ""}`}>
                                    {entry.realName}
                                  </span>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums ${i === 0 ? lb.color : "text-[var(--muted)]"}`}>
                                  {entry.score}/{entry.total ?? "?"} {lb.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Full Student Roster Performance</CardTitle>
                    <p className="text-xs text-[var(--muted)]">
                      Every student's role, room, and outcome per round. Green check = role success, red X = role fail, gray dash = no guess made.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)] sticky left-0 bg-white z-10 min-w-[140px]">Student</th>
                            {analyticsData.rounds.map((r: any) => (
                              <th key={r.id} className="text-center py-2 px-3 font-semibold text-[var(--muted)] min-w-[130px]">
                                R{r.roundNumber}
                                <span className="block text-[10px] font-normal truncate max-w-[120px]">{r.topic}</span>
                              </th>
                            ))}
                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] min-w-[140px]">Summary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.students.map((student: any) => {
                            const { stats } = student;
                            const totalWins = stats.poserWins + stats.trueCollegianWins + stats.interrogatorWins;
                            const totalRounds = stats.poserRounds + stats.trueCollegianRounds + stats.interrogatorRounds;
                            return (
                            <tr key={student.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50/50">
                              <td className="py-2 px-3 font-medium sticky left-0 bg-white z-10">
                                <div>{student.realName}</div>
                                <div className="text-[10px] text-[var(--muted)]">{student.email}</div>
                              </td>
                              {analyticsData.rounds.map((r: any) => {
                                const role = student.roles[r.id];
                                const outcome = student.outcomes[r.id];
                                const roomNum = student.rooms[r.id];
                                const roleStyle = role === "INTERROGATOR"
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : role === "REAL"
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : role === "FAKE"
                                  ? "bg-purple-100 text-purple-700 border-purple-200"
                                  : role === "WAITING"
                                  ? "bg-gray-100 text-gray-500 border-gray-200"
                                  : "";
                                const rl = role === "INTERROGATOR" ? "Int"
                                  : role === "REAL" ? "TC"
                                  : role === "FAKE" ? "Poser"
                                  : role === "WAITING" ? "Wait"
                                  : "--";
                                const outcomeIcon = outcome === "success"
                                  ? <span className="text-green-600 font-bold" title="Success">&#10003;</span>
                                  : outcome === "fail"
                                  ? <span className="text-red-500 font-bold" title="Failed">&#10007;</span>
                                  : outcome === "no_guess"
                                  ? <span className="text-gray-400" title="No guess made">&ndash;</span>
                                  : null;
                                return (
                                  <td key={r.id} className="py-2 px-3 text-center">
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleStyle}`}>
                                        {rl}
                                      </span>
                                      {roomNum != null && (
                                        <span className="text-[10px] text-[var(--muted)]">Room {roomNum}</span>
                                      )}
                                      <span className="text-sm">{outcomeIcon}</span>
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="py-2 px-3 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-sm font-bold">{totalWins}/{totalRounds}</span>
                                  <span className="text-[10px] text-[var(--muted)]">
                                    {totalRounds > 0 ? Math.round((totalWins / totalRounds) * 100) : 0}% success
                                  </span>
                                  <div className="flex gap-2 text-[10px] text-[var(--muted)] mt-0.5">
                                    {stats.poserRounds > 0 && <span className="text-purple-600">P:{stats.poserWins}/{stats.poserRounds}</span>}
                                    {stats.trueCollegianRounds > 0 && <span className="text-green-600">TC:{stats.trueCollegianWins}/{stats.trueCollegianRounds}</span>}
                                    {stats.interrogatorRounds > 0 && <span className="text-blue-600">I:{stats.interrogatorWins}/{stats.interrogatorRounds}</span>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Room Assignments & Chat Logs</CardTitle>
                    <p className="text-xs text-[var(--muted)]">
                      Click a round to expand room details and view chat transcripts
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analyticsData.rounds.map((round: any) => {
                      const isExpanded = expandedRounds[round.id] ?? false;
                      return (
                        <div key={round.id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                            onClick={() => setExpandedRounds(prev => ({ ...prev, [round.id]: !prev[round.id] }))}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold">Round {round.roundNumber}</span>
                              <span className="text-xs text-[var(--muted)]">{round.topic}</span>
                              <span className={`text-[10px] rounded-full border px-2 py-0.5 font-semibold ${round.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" : round.status === "ENDED" ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                {formatStatus(round.status)}
                              </span>
                              <span className="text-xs text-[var(--muted)]">{round.rooms?.length ?? 0} rooms</span>
                            </div>
                            <span className="text-[var(--muted)] text-lg">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
                              {(round.rooms ?? []).length === 0 ? (
                                <p className="text-sm text-[var(--muted)] py-3">No rooms for this round</p>
                              ) : (
                                (round.rooms ?? []).map((room: any) => {
                                  const roomKey = `${round.id}-${room.roomNumber}`;
                                  const isRoomExpanded = expandedRooms[roomKey] ?? false;
                                  return (
                                    <div key={roomKey} className="border border-[var(--border)] rounded-lg overflow-hidden">
                                      <div className="flex items-center">
                                        <button
                                          className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-gray-50/50 transition-colors text-left"
                                          onClick={() => setExpandedRooms(prev => ({ ...prev, [roomKey]: !prev[roomKey] }))}
                                        >
                                          <div className="flex items-center gap-3">
                                            <span className="text-sm font-semibold">Room {room.roomNumber}</span>
                                            {room.name && <span className="text-xs text-[var(--muted)] truncate max-w-[300px]">{room.name}</span>}
                                            <span className="text-xs text-[var(--muted)]">{room.participants?.length ?? 0} students</span>
                                            <span className="text-xs text-[var(--muted)]">{room.messages?.length ?? 0} messages</span>
                                            {room.guess && (
                                              <span className={`text-[10px] rounded-full border px-2 py-0.5 font-semibold ${room.guess.correct ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                                                Guess: {room.guess.correct ? "Correct" : "Wrong"}
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-[var(--muted)] text-sm">{isRoomExpanded ? "\u25B2" : "\u25BC"}</span>
                                        </button>
                                        {(room.messages?.length ?? 0) > 0 && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-xs h-7 mr-2 shrink-0"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              generateChatPdf({
                                                roomNumber: room.roomNumber,
                                                topic: round.topic ?? "",
                                                yourRole: "Admin",
                                                yourDisplayName: "Admin",
                                                messages: (room.messages ?? []).map((msg: any) => ({
                                                  id: msg.id,
                                                  createdAt: msg.createdAt,
                                                  type: msg.type,
                                                  body: msg.body,
                                                  isQuestion: msg.isQuestion ?? false,
                                                  sender: msg.sender,
                                                  recipient: msg.recipient
                                                }))
                                              });
                                            }}
                                          >
                                            PDF
                                          </Button>
                                        )}
                                      </div>
                                      {isRoomExpanded && (
                                        <div className="border-t border-[var(--border)] px-3 py-3 space-y-4">
                                          <div>
                                            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">Participants</h4>
                                            <div className="flex flex-wrap gap-2">
                                              {(room.participants ?? []).map((p: any) => {
                                                const pRoleStyle = p.assignedRole === "INTERROGATOR"
                                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                                  : p.assignedRole === "REAL"
                                                  ? "bg-green-100 text-green-700 border-green-200"
                                                  : p.assignedRole === "FAKE"
                                                  ? "bg-purple-100 text-purple-700 border-purple-200"
                                                  : "bg-gray-100 text-gray-500 border-gray-200";
                                                const prl = p.assignedRole === "INTERROGATOR" ? "Interrogator"
                                                  : p.assignedRole === "REAL" ? "True Collegian"
                                                  : p.assignedRole === "FAKE" ? "Poser"
                                                  : p.assignedRole ?? "?";
                                                return (
                                                  <div key={p.userId} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5">
                                                    <span className="text-sm font-medium">{p.realName}</span>
                                                    {p.displayName !== p.realName && (
                                                      <span className="text-xs text-[var(--muted)]">({p.displayName})</span>
                                                    )}
                                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pRoleStyle}`}>{prl}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          <div>
                                            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase mb-2">Chat Transcript ({room.messages?.length ?? 0} messages)</h4>
                                            {(room.messages ?? []).length === 0 ? (
                                              <p className="text-sm text-[var(--muted)]">No messages</p>
                                            ) : (
                                              <div className="max-h-[400px] overflow-y-auto space-y-1 rounded-lg border border-[var(--border)] p-3 bg-gray-50/50">
                                                {(room.messages ?? []).map((msg: any) => {
                                                  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                                  if (msg.type === "SYSTEM") {
                                                    return (
                                                      <div key={msg.id} className="text-xs text-center text-[var(--muted)] italic py-1">
                                                        {msg.body}
                                                      </div>
                                                    );
                                                  }
                                                  if (msg.isQuestion) {
                                                    return (
                                                      <div key={msg.id} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5 text-red-700">
                                                        <span className="font-bold">[Question]</span> {msg.body}
                                                        <span className="text-[10px] text-red-400 ml-2">{time}</span>
                                                      </div>
                                                    );
                                                  }
                                                  return (
                                                    <div key={msg.id} className="text-xs">
                                                      <span className="font-semibold">{msg.sender?.displayName ?? "Unknown"}:</span>{" "}
                                                      <span>{msg.body}</span>
                                                      <span className="text-[10px] text-[var(--muted)] ml-2">{time}</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
