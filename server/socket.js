import { PrismaClient, MessageType } from "@prisma/client";
import cookie from "cookie";
import crypto from "crypto";
import { setAdminPresence, removeAdminPresence, setUserOnline, setUserOffline } from "./presenceStore.js";
import { onAdminUpdate, onRoundUpdate } from "./events.js";
import {
  acquireQuestionLock,
  releaseQuestionLock,
  clearActiveQuestion,
  clearQuestionTimer,
  getActiveQuestion,
  hasAnsweredQuestion,
  markQuestionAnswered,
  setActiveQuestion,
  setQuestionTimer
} from "./questionStore.js";

const prisma = new PrismaClient();
const SESSION_COOKIE_ADMIN = "session_admin";
const SESSION_COOKIE_STUDENT = "session_student";
const RATE_LIMIT = { count: 6, windowMs: 10_000 };
const QUESTION_DURATIONS = new Set([15, 60]);

const userBuckets = new Map();

function hashToken(token) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return crypto.createHash("sha256").update(token + secret).digest("hex");
}

async function getSessionUser(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  return prisma.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: { user: true }
  });
}

function sessionCookieForRole(role) {
  if (role === "ADMIN") return SESSION_COOKIE_ADMIN;
  if (role === "STUDENT") return SESSION_COOKIE_STUDENT;
  return null;
}

function rateLimit(key) {
  const now = Date.now();
  const bucket = userBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    userBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  if (bucket.count >= RATE_LIMIT.count) return false;
  bucket.count += 1;
  userBuckets.set(key, bucket);
  return true;
}

function sanitize(input) {
  return (input || "").toString().trim().slice(0, 2000);
}

function getRoomDisplayName(user) {
  return user.assignedName ?? user.nickname ?? user.realName;
}

function formatDisplayNameForViewer(user, viewerRole) {
  if (!user) return null;
  if (user.accountType === "ADMIN") {
    return user.realName;
  }
  const assignedName = getRoomDisplayName(user);
  if (viewerRole === "ADMIN" && assignedName !== user.realName) {
    return `${user.realName} (${assignedName})`;
  }
  return assignedName;
}

function buildMessagePayload(message, viewerRole) {
  return {
    id: message.id,
    createdAt: message.createdAt,
    type: message.type,
    body: message.body,
    isQuestion: Boolean(message.isQuestion),
    questionId: message.questionId ?? null,
    questionEndsAt: message.questionEndsAt ?? null,
    sender: message.sender
      ? {
          id: message.sender.id,
          displayName: formatDisplayNameForViewer(message.sender, viewerRole)
        }
      : null,
    recipient: message.recipient
      ? {
          id: message.recipient.id,
          displayName: formatDisplayNameForViewer(message.recipient, viewerRole)
        }
      : null
  };
}

function toQuestionPayload(question) {
  if (!question) {
    return { activeQuestion: null };
  }
  const remainingMs = Math.max(0, question.endsAt.getTime() - Date.now());
  return {
    activeQuestion: {
      id: question.questionId,
      body: question.body,
      durationSeconds: question.durationSeconds,
      endsAt: question.endsAt,
      remainingSeconds: Math.ceil(remainingMs / 1000)
    }
  };
}

function emitQuestionUpdate(io, roomId, question) {
  const payload = toQuestionPayload(question);
  io.to(`room:${roomId}`).emit("question:update", payload);
  io.to(`room:${roomId}:admin`).emit("question:update", payload);
}

async function logSystemMessage(roomId, roundId, body) {
  return prisma.message.create({
    data: {
      roomId,
      roundId,
      body,
      type: MessageType.SYSTEM
    }
  });
}

async function ensureStudentMembership(userId, roomId) {
  return prisma.roomMembership.findFirst({
    where: {
      userId,
      roomId,
      round: { status: "ACTIVE" }
    },
    include: { round: true, room: true, user: true }
  });
}

async function revealQuestionAnswers(io, roomId, questionId) {
  emitQuestionUpdate(io, roomId, null);

  await new Promise((resolve) => setTimeout(resolve, 600));

  const now = new Date();
  const answers = await prisma.message.findMany({
    where: {
      roomId,
      questionId,
      revealAt: { lte: now }
    },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "asc" }
  });

  if (answers.length > 0) {
    io.to(`room:${roomId}`).emit(
      "messages:reveal",
      answers.map((message) => buildMessagePayload(message, "STUDENT"))
    );
    io.to(`room:${roomId}:admin`).emit(
      "messages:reveal",
      answers.map((message) => buildMessagePayload(message, "ADMIN"))
    );
  }

  clearActiveQuestion(roomId);
}

async function ensureActiveQuestion(io, roomId) {
  const current = getActiveQuestion(roomId);
  if (current) return current;

  const questionMessage = await prisma.message.findFirst({
    where: {
      roomId,
      isQuestion: true,
      questionEndsAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!questionMessage?.questionId || !questionMessage.questionEndsAt) {
    return null;
  }

  const answered = await prisma.message.findMany({
    where: {
      roomId,
      questionId: questionMessage.questionId,
      senderId: { not: null }
    },
    select: { senderId: true }
  });

  const restored = {
    questionId: questionMessage.questionId,
    roomId,
    roundId: questionMessage.roundId,
    body: questionMessage.body,
    durationSeconds: Math.max(
      1,
      Math.round((questionMessage.questionEndsAt.getTime() - questionMessage.createdAt.getTime()) / 1000)
    ),
    endsAt: questionMessage.questionEndsAt,
    answeredUserIds: new Set(answered.map((item) => item.senderId).filter(Boolean))
  };
  setActiveQuestion({ roomId, question: restored });

  const delay = Math.max(0, restored.endsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    revealQuestionAnswers(io, roomId, restored.questionId).catch((error) => {
      console.error("Failed to reveal question answers", error);
    });
  }, delay + 50);
  setQuestionTimer(roomId, timer);

  return restored;
}

export function setupSocket(io) {
  if (!io._eventsBound) {
    onAdminUpdate((payload) => {
      io.to("admins").emit("admin:update", payload);
    });
    onRoundUpdate((payload) => {
      io.to("students").emit("round:update", payload);
      io.to("admins").emit("round:update", payload);
    });
    io._eventsBound = true;
  }

  io.use(async (socket, next) => {
    const parsed = cookie.parse(socket.handshake.headers.cookie ?? "");
    const role = socket.handshake.auth?.role;
    const roleCookie = sessionCookieForRole(role);
    const token =
      (roleCookie ? parsed[roleCookie] : null) ??
      parsed[SESSION_COOKIE_ADMIN] ??
      parsed[SESSION_COOKIE_STUDENT];
    const session = await getSessionUser(token);
    if (!session) return next(new Error("Unauthorized"));
    socket.data.user = session.user;
    socket.data.session = session;
    socket.join(`user:${session.user.id}`);
    socket.join(session.user.accountType === "ADMIN" || session.user.accountType === "SUPER_ADMIN" ? "admins" : "students");
    setUserOnline({ userId: session.user.id });
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastSeenAt: new Date() }
    });
    next();
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async ({ roomId }) => {
      const user = socket.data.user;
      if (!user) return;
      if (user.accountType !== "STUDENT") return;
      const membership = await ensureStudentMembership(user.id, roomId);
      if (!membership) return;
      socket.join(`room:${roomId}`);
      socket.join(`room:${roomId}:participants`);
      await prisma.roomMembership.update({
        where: { id: membership.id },
        data: {
          joinedAt: new Date(),
          nicknameUsed: getRoomDisplayName(user)
        }
      });
      io.to(`room:${roomId}`).emit("room:presence", {
        type: "join",
        userId: user.id,
        displayName: getRoomDisplayName(user)
      });
      const system = await logSystemMessage(
        roomId,
        membership.roundId,
        `${getRoomDisplayName(user)} joined the room.`
      );
      io.to(`room:${roomId}`).to(`room:${roomId}:admin`).emit("message:new", {
        id: system.id,
        createdAt: system.createdAt,
        type: system.type,
        body: system.body,
        isQuestion: false,
        questionId: null,
        questionEndsAt: null,
        sender: null,
        recipient: null
      });

      const activeQuestion = await ensureActiveQuestion(io, roomId);
      socket.emit("question:update", toQuestionPayload(activeQuestion));
      if (activeQuestion) {
        const alreadyAnswered = await prisma.message.findFirst({
          where: {
            roomId,
            questionId: activeQuestion.questionId,
            senderId: user.id
          },
          select: { id: true }
        });
        if (alreadyAnswered) {
          socket.emit("answer:submitted", {
            questionId: activeQuestion.questionId,
            endsAt: activeQuestion.endsAt
          });
        }
      }
    });

    socket.on("room:leave", async ({ roomId }) => {
      const user = socket.data.user;
      if (!user || user.accountType !== "STUDENT") return;
      const membership = await ensureStudentMembership(user.id, roomId);
      if (!membership) return;
      socket.leave(`room:${roomId}`);
      io.to(`room:${roomId}`).emit("room:presence", {
        type: "leave",
        userId: user.id,
        displayName: getRoomDisplayName(user)
      });
      await prisma.roomMembership.update({
        where: { id: membership.id },
        data: { leftAt: new Date() }
      });
      const system = await logSystemMessage(
        roomId,
        membership.roundId,
        `${getRoomDisplayName(user)} left the room.`
      );
      io.to(`room:${roomId}`).to(`room:${roomId}:admin`).emit("message:new", {
        id: system.id,
        createdAt: system.createdAt,
        type: system.type,
        body: system.body,
        isQuestion: false,
        questionId: null,
        questionEndsAt: null,
        sender: null,
        recipient: null
      });
    });

    socket.on("admin:watch", async ({ roomId, mode }) => {
      const user = socket.data.user;
      if (!user || (user.accountType !== "ADMIN" && user.accountType !== "SUPER_ADMIN")) return;
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return;

      const previousRoom = socket.data.adminRoomId;
      if (previousRoom && previousRoom !== roomId) {
        removeAdminPresence({ roomId: previousRoom, adminId: user.id });
        socket.leave(`room:${previousRoom}`);
        socket.leave(`room:${previousRoom}:admin`);
      }

      socket.join(`room:${roomId}:admin`);
      socket.data.adminMode = mode;
      socket.data.adminRoomId = roomId;

      if (mode === "visible") {
        setAdminPresence({
          roomId,
          adminId: user.id,
          displayName: user.realName,
          mode: "visible"
        });
      } else {
        removeAdminPresence({ roomId, adminId: user.id });
        socket.leave(`room:${roomId}`);
        io.to(`room:${roomId}`).emit("room:presence", {
          type: "admin_leave",
          userId: user.id,
          displayName: user.realName
        });
      }

      if (mode === "visible") {
        socket.join(`room:${roomId}`);
        io.to(`room:${roomId}`).emit("room:presence", {
          type: "admin",
          userId: user.id,
          displayName: user.realName
        });
        const config = await prisma.classConfig.findFirst();
        if (config?.showAdminJoinMessage !== false) {
          const system = await logSystemMessage(roomId, room.roundId, "Admin joined the room.");
          io.to(`room:${roomId}`).to(`room:${roomId}:admin`).emit("message:new", {
            id: system.id,
            createdAt: system.createdAt,
            type: system.type,
            body: system.body,
            isQuestion: false,
            questionId: null,
            questionEndsAt: null,
            sender: null,
            recipient: null
          });
        }
      }

      const activeQuestion = await ensureActiveQuestion(io, roomId);
      socket.emit("question:update", toQuestionPayload(activeQuestion));
    });

    socket.on("question:send", async ({ roomId, body, durationSeconds }) => {
      const user = socket.data.user;
      if (!user || user.accountType !== "STUDENT") return;
      if (!rateLimit(`question:${user.id}`)) return;

      const membership = await ensureStudentMembership(user.id, roomId);
      if (!membership) return;
      if (membership.assignedRole !== "INTERROGATOR") {
        socket.emit("chat:error", { error: "Only the Interrogator can send questions." });
        return;
      }

      const duration = Number(durationSeconds);
      if (!QUESTION_DURATIONS.has(duration)) {
        socket.emit("chat:error", { error: "Question timer must be 15 or 60 seconds." });
        return;
      }

      if (!acquireQuestionLock(roomId)) {
        socket.emit("chat:error", { error: "Wait for the current question timer to finish." });
        return;
      }

      try {
        const activeQuestion = await ensureActiveQuestion(io, roomId);
        if (activeQuestion) {
          socket.emit("chat:error", { error: "Wait for the current question timer to finish." });
          return;
        }

        const sanitized = sanitize(body);
        if (!sanitized) {
          socket.emit("chat:error", { error: "Question cannot be empty." });
          return;
        }

        const questionId = crypto.randomUUID();
        const endsAt = new Date(Date.now() + duration * 1000);
        const message = await prisma.message.create({
          data: {
            roundId: membership.roundId,
            roomId,
            senderId: user.id,
            recipientId: null,
            body: sanitized,
            type: MessageType.USER,
            questionId,
            isQuestion: true,
            questionEndsAt: endsAt
          },
          include: {
            sender: true,
            recipient: true
          }
        });

        const question = {
          questionId,
          roomId,
          roundId: membership.roundId,
          body: sanitized,
          durationSeconds: duration,
          endsAt,
          answeredUserIds: new Set()
        };
        setActiveQuestion({ roomId, question });

        io.to(`room:${roomId}`).emit("message:new", buildMessagePayload(message, "STUDENT"));
        io.to(`room:${roomId}:admin`).emit("message:new", buildMessagePayload(message, "ADMIN"));
        emitQuestionUpdate(io, roomId, question);

        const delay = Math.max(0, endsAt.getTime() - Date.now());
        const timer = setTimeout(() => {
          revealQuestionAnswers(io, roomId, questionId).catch((error) => {
            console.error("Failed to reveal question answers", error);
          });
        }, delay + 50);
        setQuestionTimer(roomId, timer);
      } finally {
        releaseQuestionLock(roomId);
      }
    });

    socket.on("message:send", async ({ roomId, recipientId, body }) => {
      const user = socket.data.user;
      if (!user) return;
      if (!rateLimit(user.id)) return;
      const sanitized = sanitize(body);
      if (!sanitized) return;

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return;

      if (user.accountType === "STUDENT") {
        const membership = await ensureStudentMembership(user.id, roomId);
        if (!membership) return;

        if (membership.assignedRole === "INTERROGATOR") {
          socket.emit("chat:error", { error: "Use the question box to send your next prompt." });
          return;
        }

        if (membership.assignedRole !== "REAL" && membership.assignedRole !== "FAKE") {
          socket.emit("chat:error", { error: "You cannot send messages in this room right now." });
          return;
        }

        const activeQuestion = await ensureActiveQuestion(io, roomId);
        if (!activeQuestion) {
          socket.emit("chat:error", { error: "Wait for the Interrogator to ask a question." });
          return;
        }

        if (recipientId) {
          socket.emit("chat:error", { error: "Answers are public and revealed together." });
          return;
        }

        if (hasAnsweredQuestion(roomId, user.id)) {
          socket.emit("chat:error", { error: "You already submitted an answer for this question." });
          return;
        }

        const existingAnswer = await prisma.message.findFirst({
          where: {
            roomId,
            questionId: activeQuestion.questionId,
            senderId: user.id
          },
          select: { id: true }
        });
        if (existingAnswer) {
          markQuestionAnswered(roomId, user.id);
          socket.emit("chat:error", { error: "You already submitted an answer for this question." });
          socket.emit("answer:submitted", {
            questionId: activeQuestion.questionId,
            endsAt: activeQuestion.endsAt
          });
          return;
        }

        await prisma.message.create({
          data: {
            roundId: room.roundId,
            roomId,
            senderId: user.id,
            recipientId: null,
            body: sanitized,
            type: MessageType.USER,
            questionId: activeQuestion.questionId,
            revealAt: activeQuestion.endsAt,
            questionEndsAt: activeQuestion.endsAt
          }
        });

        markQuestionAnswered(roomId, user.id);
        socket.emit("answer:submitted", {
          questionId: activeQuestion.questionId,
          endsAt: activeQuestion.endsAt
        });

        const responders = await prisma.roomMembership.findMany({
          where: { roomId, assignedRole: { in: ["REAL", "FAKE"] } },
          select: { userId: true }
        });
        const updatedQuestion = getActiveQuestion(roomId);
        if (updatedQuestion && responders.length > 0 && responders.every((r) => updatedQuestion.answeredUserIds.has(r.userId))) {
          clearQuestionTimer(roomId);
          await prisma.message.updateMany({
            where: { roomId, questionId: activeQuestion.questionId, revealAt: { not: null } },
            data: { revealAt: new Date() }
          });
          revealQuestionAnswers(io, roomId, activeQuestion.questionId).catch((error) => {
            console.error("Failed early reveal", error);
          });
        }
        return;
      }

      const config = await prisma.classConfig.findFirst();
      if (!config?.allowAdminPosting) return;
      const silentReadOnly = config?.silentViewReadOnly ?? true;
      if (socket.data.adminMode !== "visible" && silentReadOnly) return;

      if (recipientId) {
        const recipientMembership = await prisma.roomMembership.findFirst({
          where: { userId: recipientId, roomId }
        });
        if (!recipientMembership) return;
      }

      const message = await prisma.message.create({
        data: {
          roundId: room.roundId,
          roomId,
          senderId: user.id,
          recipientId: recipientId || null,
          body: sanitized,
          type: MessageType.USER
        },
        include: {
          sender: true,
          recipient: true
        }
      });

      if (!recipientId) {
        io.to(`room:${roomId}`).emit("message:new", buildMessagePayload(message, "STUDENT"));
        io.to(`room:${roomId}:admin`).emit("message:new", buildMessagePayload(message, "ADMIN"));
        return;
      }

      io.to(`user:${user.id}`)
        .to(`user:${recipientId}`)
        .emit("message:new", buildMessagePayload(message, "STUDENT"));
      io.to(`room:${roomId}:admin`).emit("message:new", buildMessagePayload(message, "ADMIN"));
    });

    socket.on("disconnect", () => {
      if (socket.data.user?.accountType === "ADMIN" && socket.data.adminRoomId) {
        removeAdminPresence({ roomId: socket.data.adminRoomId, adminId: socket.data.user.id });
      }
      if (socket.data.user?.id) {
        setUserOffline({ userId: socket.data.user.id });
        prisma.user
          .update({
            where: { id: socket.data.user.id },
            data: { lastSeenAt: new Date() }
          })
          .catch(() => null);
      }
      userBuckets.delete(socket.data.user?.id);
    });
  });
}
