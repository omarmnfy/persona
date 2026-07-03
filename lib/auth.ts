import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./db";

const SESSION_COOKIE_ADMIN = "session_admin";
const SESSION_COOKIE_STUDENT = "session_student";
const CSRF_COOKIE_ADMIN = "csrf_admin";
const CSRF_COOKIE_STUDENT = "csrf_student";
const SESSION_TTL_DAYS = 7;
export type SessionRole = "ADMIN" | "STUDENT" | "SUPER_ADMIN";

function cookieNames(role: SessionRole) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? { session: SESSION_COOKIE_ADMIN, csrf: CSRF_COOKIE_ADMIN }
    : { session: SESSION_COOKIE_STUDENT, csrf: CSRF_COOKIE_STUDENT };
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return crypto.createHash("sha256").update(token + secret).digest("hex");
}

export function createToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function createSession(userId: string) {
  const token = createToken();
  const tokenHash = hashToken(token);
  const csrfToken = createToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      csrfToken,
      expiresAt
    }
  });

  return { token, csrfToken, expiresAt };
}

export function setSessionCookies(
  response: NextResponse,
  session: { token: string; csrfToken: string; expiresAt: Date },
  role: SessionRole
) {
  const secure = process.env.NODE_ENV === "production";
  const names = cookieNames(role);
  response.cookies.set(names.session, session.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt
  });
  response.cookies.set(names.csrf, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt
  });
}

export function clearSessionCookies(response: NextResponse, role?: SessionRole) {
  const roles: SessionRole[] = role ? [role] : ["ADMIN", "STUDENT"];
  for (const roleName of roles) {
    const names = cookieNames(roleName);
    response.cookies.set(names.session, "", {
      httpOnly: true,
      expires: new Date(0),
      path: "/"
    });
    response.cookies.set(names.csrf, "", {
      httpOnly: false,
      expires: new Date(0),
      path: "/"
    });
  }
}

export async function getSessionUser(token?: string) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });
  return session ?? null;
}

export async function getSessionFromRequest(request: NextRequest, role?: SessionRole) {
  if (role) {
    const token = request.cookies.get(cookieNames(role).session)?.value;
    return getSessionUser(token);
  }
  const adminToken = request.cookies.get(SESSION_COOKIE_ADMIN)?.value;
  const adminSession = await getSessionUser(adminToken);
  if (adminSession) return adminSession;
  const studentToken = request.cookies.get(SESSION_COOKIE_STUDENT)?.value;
  return getSessionUser(studentToken);
}

export async function requireUser(request: NextRequest, role?: SessionRole) {
  const session = await getSessionFromRequest(request, role);
  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}

export function requireCsrf(request: NextRequest, session: { csrfToken: string }, role?: SessionRole) {
  const headerToken = request.headers.get("x-csrf-token");
  let cookieToken = null;
  if (role) {
    cookieToken = request.cookies.get(cookieNames(role).csrf)?.value ?? null;
  } else {
    cookieToken =
      request.cookies.get(CSRF_COOKIE_ADMIN)?.value ??
      request.cookies.get(CSRF_COOKIE_STUDENT)?.value ??
      null;
  }
  if (!headerToken || !cookieToken || headerToken !== cookieToken || headerToken !== session.csrfToken) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

export async function getCsrfCookie(role: SessionRole) {
  const cookieStore = await cookies();
  return cookieStore.get(cookieNames(role).csrf)?.value ?? null;
}

export async function getSessionCookie(role: SessionRole) {
  const cookieStore = await cookies();
  return cookieStore.get(cookieNames(role).session)?.value ?? null;
}
