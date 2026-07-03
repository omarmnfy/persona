import { NextRequest, NextResponse } from "next/server";
import { AccountType } from "@prisma/client";
import { isAdmin } from "@/lib/authz";
import { requireUser } from "@/lib/auth";
import { buildRoundExport } from "@/lib/export";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { session, response } = await requireUser(request, "ADMIN");
  if (response) return response;
  if (!isAdmin(session.user.accountType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get("roundId");
  const format = searchParams.get("format") ?? "json";
  const type = searchParams.get("type") ?? "full";
  const scope = searchParams.get("scope") ?? "all";

  if (!roundId) {
    return NextResponse.json({ error: "roundId required" }, { status: 400 });
  }

  if (type === "assignments") {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        rooms: {
          include: { memberships: { include: { user: true } } },
          orderBy: { roomNumber: "asc" }
        }
      }
    });
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    const payload = {
      roundNumber: round.roundNumber,
      topic: round.topic,
      seed: round.seed,
      durationSeconds: round.durationSeconds,
      startsAt: round.startsAt,
      endsAt: round.endsAt,
      rooms: round.rooms.map((room) => ({
        roomNumber: room.roomNumber,
        roomName: `Room ${room.roomNumber}`,
        participants: room.memberships.map((m) => ({
          userId: m.userId,
          realName: m.user.realName,
          nicknameUsed: m.nicknameUsed,
          assignedRole: m.assignedRole
        }))
      }))
    };

    if (format === "csv") {
      const rows = ["roundNumber,roomNumber,roomName,userId,realName,nicknameUsed,assignedRole"];
      for (const room of payload.rooms) {
        for (const participant of room.participants) {
          rows.push(
            [
              payload.roundNumber,
              room.roomNumber,
              room.roomName,
              participant.userId,
              participant.realName,
              participant.nicknameUsed,
              participant.assignedRole
            ].join(",")
          );
        }
      }
      return new NextResponse(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=round-${payload.roundNumber}-assignments.csv`
        }
      });
    }

    return NextResponse.json(payload);
  }

  const exportData = await buildRoundExport(roundId);
  if (!exportData) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (format === "csv") {
    if (type === "messages") {
      const rows = ["roundNumber,roomNumber,roomName,messageId,type,createdAt,senderId,recipientId,body"];
      for (const room of exportData.rooms) {
        const filteredMessages =
          scope === "public" ? room.messages.filter((msg) => !msg.recipient) : room.messages;
        for (const message of filteredMessages) {
          rows.push(
            [
              exportData.roundNumber,
              room.roomNumber,
              room.roomName,
              message.messageId,
              message.type,
              message.createdAt,
              message.sender?.id ?? "",
              message.recipient?.id ?? "",
              JSON.stringify(message.body)
            ].join(",")
          );
        }
      }
      return new NextResponse(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=round-${exportData.roundNumber}-messages.csv`
        }
      });
    }

    const rows = [
      "roundNumber,roomNumber,roomName,userId,realName,nicknameUsed,assignedRole,messageId,type,createdAt,senderId,recipientId,body"
    ];
    for (const room of exportData.rooms) {
      for (const participant of room.participants) {
        rows.push(
          [
            exportData.roundNumber,
            room.roomNumber,
            room.roomName,
            participant.userId,
            participant.realName,
            participant.nicknameUsed,
            participant.assignedRole,
            "",
            "",
            "",
            "",
            "",
            ""
          ].join(",")
        );
      }
      const filteredMessages =
        scope === "public" ? room.messages.filter((msg) => !msg.recipient) : room.messages;
      for (const message of filteredMessages) {
        rows.push(
          [
            exportData.roundNumber,
            room.roomNumber,
            room.roomName,
            "",
            "",
            "",
            "",
            message.messageId,
            message.type,
            message.createdAt,
            message.sender?.id ?? "",
            message.recipient?.id ?? "",
            JSON.stringify(message.body)
          ].join(",")
        );
      }
    }
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=round-${exportData.roundNumber}-export.csv`
      }
    });
  }

  if (type === "messages") {
    return NextResponse.json({
      roundNumber: exportData.roundNumber,
      topic: exportData.topic,
      seed: exportData.seed,
      durationSeconds: exportData.durationSeconds,
      startsAt: exportData.startsAt,
      endsAt: exportData.endsAt,
      rooms: exportData.rooms.map((room) => ({
        roomNumber: room.roomNumber,
        roomName: room.roomName,
        messages: room.messages
      }))
    });
  }

  return NextResponse.json(exportData);
}
