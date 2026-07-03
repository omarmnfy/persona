import crypto from "crypto";

export function hashJoinCode(code: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return crypto.createHash("sha256").update(code + secret).digest("hex");
}

export function generateJoinCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}
