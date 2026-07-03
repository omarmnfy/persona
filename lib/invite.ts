import crypto from "crypto";

export function generateInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return crypto.createHash("sha256").update(token + secret).digest("hex");
}
