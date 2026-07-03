import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireCsrf } from "@/lib/auth";
import { generateAssignments, generateSessionAssignments } from "@/lib/assign";
import { startRound, endRound } from "@/lib/rounds";
import { logAdminAction } from "@/lib/audit";
import { emitAdminUpdate, emitRoundUpdate } from "@/server/events";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";

export async function POST(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const csrf = requireCsrf(request, session, "ADMIN");
  if (csrf) return csrf;

  const body = await request.json();
  const { roundId, sessionId, action } = body as { roundId?: string; sessionId?: string; action?: string };

  if (action === "session-assign" && sessionId) {
    try {
      const result = await generateSessionAssignments(sessionId);
      await logAdminAction(session.user.id, "assignments.session-assign", { sessionId });
      emitAdminUpdate({ type: "assignments", action: "session-assign", sessionId });
      return NextResponse.json({ ok: true, ...result });
    } catch (error: any) {
      return NextResponse.json({ error: error.message ?? "Failed to assign session" }, { status: 400 });
    }
  }

  if (!roundId || !action) {
    return NextResponse.json({ error: "Missing roundId or action" }, { status: 400 });
  }

  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (action === "generate") {
    if (round.status !== "SCHEDULED") {
      return NextResponse.json({ error: "Round already started" }, { status: 400 });
    }
    await generateAssignments(round.id, round.seed);
    await logAdminAction(session.user.id, "assignments.generate", { roundId: round.id });
    emitAdminUpdate({ type: "assignments", action: "generate", roundId: round.id });
    emitRoundUpdate({ type: "assignments", action: "generate", roundId: round.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "reroll") {
    if (round.assignmentsLocked) {
      return NextResponse.json({ error: "Assignments are locked" }, { status: 400 });
    }
    await generateAssignments(round.id, round.seed);
    await logAdminAction(session.user.id, "assignments.reroll", { roundId: round.id });
    emitAdminUpdate({ type: "assignments", action: "reroll", roundId: round.id });
    emitRoundUpdate({ type: "assignments", action: "reroll", roundId: round.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "lock") {
    await prisma.round.update({ where: { id: round.id }, data: { assignmentsLocked: true } });
    await logAdminAction(session.user.id, "assignments.lock", { roundId: round.id });
    emitAdminUpdate({ type: "assignments", action: "lock", roundId: round.id });
    emitRoundUpdate({ type: "assignments", action: "lock", roundId: round.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "unlock") {
    await prisma.round.update({ where: { id: round.id }, data: { assignmentsLocked: false } });
    await logAdminAction(session.user.id, "assignments.unlock", { roundId: round.id });
    emitAdminUpdate({ type: "assignments", action: "unlock", roundId: round.id });
    emitRoundUpdate({ type: "assignments", action: "unlock", roundId: round.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "start") {
    try {
      const updated = await startRound(round.id);
      await logAdminAction(session.user.id, "round.start", { roundId: round.id });
      emitAdminUpdate({ type: "rounds", action: "start", roundId: round.id });
      emitRoundUpdate({ type: "rounds", action: "start", roundId: round.id });
      return NextResponse.json({ round: updated });
    } catch (error: any) {
      return NextResponse.json({ error: error.message ?? "Failed to start round" }, { status: 400 });
    }
  }

  if (action === "end") {
    await endRound(round.id);
    await logAdminAction(session.user.id, "round.end", { roundId: round.id });
    emitAdminUpdate({ type: "rounds", action: "end", roundId: round.id });
    emitRoundUpdate({ type: "rounds", action: "end", roundId: round.id });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
