import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

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

export async function sendInviteEmail({
  to,
  inviteUrl,
  realName,
  inviteType = "STUDENT"
}: {
  to: string;
  inviteUrl: string;
  realName?: string | null;
  inviteType?: "STUDENT" | "ADMIN" | "SUPER_ADMIN";
}) {
  const smtp = getTransporter();
  if (!smtp) return false;

  const bannerPath = path.join(process.cwd(), "assets", "email", "persona-banner.png");
  let bannerSrc = "";
  const attachments: Array<{ filename?: string; path?: string; cid?: string; content?: Buffer; contentType?: string }> = [];

  if (fs.existsSync(bannerPath)) {
    bannerSrc = "cid:invite-banner";
    attachments.push({
      filename: "persona-banner.png",
      path: bannerPath,
      cid: "invite-banner"
    });
  }

  const greetingName = realName ? ` ${realName}` : "";
  const isAdminInvite = inviteType === "ADMIN" || inviteType === "SUPER_ADMIN";
  const subject = isAdminInvite ? "Admin Invitation to Persona" : "Invitation to Persona";
  const title = isAdminInvite ? "Persona Admin Invitation" : "Persona Invitation";
  const primaryLine = isAdminInvite
    ? "You have been invited to join Persona as an administrator for the Department of Computer Science."
    : "You have been invited to join a Persona session for the Department of Computer Science.";
  const actionLabel = isAdminInvite ? "Set Your Admin Password" : "Set Your Password";

  const html = `
  <div style="background:#ffffff;padding:24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
      ${bannerSrc ? `<tr><td style="padding-bottom:24px;"><img src="${bannerSrc}" alt="Persona Invitation" style="width:100%;height:auto;display:block;border:0;"></td></tr>` : ""}
      <tr>
        <td style="font-size:20px;font-weight:700;padding-bottom:8px;">${title}</td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;padding-bottom:16px;">
          Dear${greetingName},
          <br><br>
          ${primaryLine}
          Please set your password using the secure link below. This link is unique to you and will expire in 7 days.
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <a href="${inviteUrl}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">
            ${actionLabel}
          </a>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.6;color:#333333;padding-top:8px;">
          If you did not expect this invitation, you can safely ignore this email.
        </td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#666666;padding-top:16px;">
          Persona \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy
        </td>
      </tr>
    </table>
  </div>
  `.trim();

  const text = `
Dear${greetingName},

${primaryLine}
Please set your password using the secure link below. This link is unique to you and will expire in 7 days.

${inviteUrl}

If you did not expect this invitation, you can safely ignore this email.

Persona \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy
  `.trim();

  await smtp.transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text,
    html,
    attachments
  });

  return true;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  realName
}: {
  to: string;
  resetUrl: string;
  realName?: string | null;
}) {
  const smtp = getTransporter();
  if (!smtp) return false;

  const greetingName = realName ? ` ${realName}` : "";

  const resetBannerPath = path.join(process.cwd(), "assets", "email", "persona-banner.png");
  let resetBannerSrc = "";
  const resetAttachments: Array<{ filename?: string; path?: string; cid?: string }> = [];

  if (fs.existsSync(resetBannerPath)) {
    resetBannerSrc = "cid:reset-banner";
    resetAttachments.push({
      filename: "persona-banner.png",
      path: resetBannerPath,
      cid: "reset-banner"
    });
  }

  const html = `
  <div style="background:#ffffff;padding:24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
      ${resetBannerSrc ? `<tr><td style="padding-bottom:24px;"><img src="${resetBannerSrc}" alt="Persona" style="width:100%;height:auto;display:block;border:0;"></td></tr>` : ""}
      <tr>
        <td style="font-size:20px;font-weight:700;padding-bottom:8px;">Password Reset</td>
      </tr>
      <tr>
        <td style="font-size:15px;line-height:1.6;padding-bottom:16px;">
          Dear${greetingName},
          <br><br>
          We received a request to reset your Persona password. Click the button below to set a new password. This link will expire in 1 hour.
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <a href="${resetUrl}" style="display:inline-block;background:#5e17eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
            Reset Password
          </a>
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.6;color:#333333;padding-top:8px;">
          If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#666666;padding-top:16px;">
          Persona \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy
        </td>
      </tr>
    </table>
  </div>
  `.trim();

  const text = `Dear${greetingName},

We received a request to reset your Persona password. Use the link below to set a new password. This link will expire in 1 hour.

${resetUrl}

If you did not request a password reset, you can safely ignore this email.

Persona \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy`.trim();

  await smtp.transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Persona \u2014 Password Reset",
    text,
    html,
    attachments: resetAttachments
  });

  return true;
}
