import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const prisma = globalThis.__transcriptPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__transcriptPrisma = prisma;

const ROLE_LABELS = {
  REAL: "True Collegian",
  FAKE: "Poser",
  INTERROGATOR: "Interrogator",
  WAITING: "Waiting"
};

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const defaultFromEmail = process.env.SMTP_USER ?? "no-reply@classroom.local";
  const from = process.env.SMTP_FROM ?? `Persona <${defaultFromEmail}>`;

  if (!host || !port || !user || !pass) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return { transporter, from };
}

export async function sendRoundTranscripts(roundId) {
  console.log("[TranscriptMailer] Starting transcript notification for round:", roundId);
  const smtp = getTransporter();
  if (!smtp) {
    console.log("[TranscriptMailer] SMTP not configured, skipping transcript emails");
    return;
  }
  console.log("[TranscriptMailer] SMTP configured, proceeding...");

  try {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { topic: true, roundNumber: true }
    });

    if (!round) {
      console.error("[TranscriptMailer] Round not found:", roundId);
      return;
    }

    const rooms = await prisma.room.findMany({
      where: { roundId },
      include: {
        memberships: {
          include: { user: true }
        }
      }
    });

    const baseUrl = process.env.APP_BASE_URL || "https://persona-omarmnfy.replit.app";
    const transcriptUrl = `${baseUrl}/transcript/${roundId}`;

    const bannerPath = path.join(process.cwd(), "assets", "email", "persona-banner.png");
    const hasBanner = fs.existsSync(bannerPath);

    for (const room of rooms) {
      for (const membership of room.memberships) {
        if (membership.assignedRole === "WAITING") continue;

        const user = membership.user;
        if (!user.email) continue;

        const roleName = ROLE_LABELS[membership.assignedRole] ?? membership.assignedRole;
        const greetingName = user.realName ? ` ${user.realName}` : "";

        const html = `
        <div style="background:#ffffff;padding:24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000000;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
            ${hasBanner ? `<tr><td style="padding-bottom:24px;"><img src="cid:transcript-banner" alt="Persona" style="width:100%;height:auto;display:block;border:0;"></td></tr>` : ""}
            <tr>
              <td style="font-size:20px;font-weight:700;padding-bottom:8px;">Your Chat Transcript is Ready</td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;padding-bottom:16px;">
                Dear${greetingName},
                <br><br>
                Your Persona chat session in <strong>Room ${room.roomNumber}</strong> has ended.
                <br>
                Topic: <strong>${round.topic}</strong> &bull; Your Role: <strong>${roleName}</strong>
                <br><br>
                Click the button below to view your personal chat transcript. The transcript shows the conversation from your perspective with assigned names only.
              </td>
            </tr>
            <tr>
              <td style="padding-top:8px;padding-bottom:16px;">
                <a href="${transcriptUrl}" style="display:inline-block;background:#5e17eb;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">View Chat Transcript</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#333333;padding-top:8px;">
                Thank you for participating in Persona!
              </td>
            </tr>
            <tr>
              <td style="padding-top:12px;">
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSci9gg8PtvhMlq2gXv3N8dD9Ymr1p4yx5rkX8YGp0MopKDqMw/viewform?usp=dialog" style="display:inline-block;background:#5e17eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Fill Out Intake Form</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#666666;padding-top:16px;">
                Persona &bull; COGS123: Mind, Brains, &amp; Programs &bull; The Claremont Colleges &bull; Created by Omar Mnfy
              </td>
            </tr>
          </table>
        </div>
        `.trim();

        const text = `Dear${greetingName},

Your Persona chat session in Room ${room.roomNumber} has ended.
Topic: ${round.topic} \u2022 Your Role: ${roleName}

View your chat transcript here: ${transcriptUrl}

The transcript shows the conversation from your perspective with assigned names only.

Thank you for participating in Persona!

Fill out the Intake Form: https://docs.google.com/forms/d/e/1FAIpQLSci9gg8PtvhMlq2gXv3N8dD9Ymr1p4yx5rkX8YGp0MopKDqMw/viewform?usp=dialog

Persona \u2022 COGS123: Mind, Brains, & Programs \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy`.trim();

        try {
          const emailAttachments = hasBanner ? [{
            filename: "persona-banner.png",
            path: bannerPath,
            cid: "transcript-banner"
          }] : [];

          await smtp.transporter.sendMail({
            from: smtp.from,
            to: user.email,
            subject: `Persona \u2014 Chat Transcript: Room ${room.roomNumber}`,
            text,
            html,
            attachments: emailAttachments
          });
          console.log(`[TranscriptMailer] Sent transcript link to ${user.email} for Room ${room.roomNumber}`);
        } catch (emailError) {
          console.error(`[TranscriptMailer] Failed to send to ${user.email}:`, emailError);
        }
      }
    }

    console.log(`[TranscriptMailer] Finished sending transcript links for round ${round.roundNumber}`);
  } catch (error) {
    console.error("[TranscriptMailer] Error sending transcript notifications:", error);
  }
}
