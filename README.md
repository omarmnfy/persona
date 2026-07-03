# Persona

Production-ready classroom role-based discussion game. Students are grouped into rooms of three with roles (Real, Fake, Interrogator). Each round has a single shared topic and realtime public + private chat, with admin supervision and exports.

## Tech Stack
- Next.js (App Router) + React
- TypeScript
- Prisma + PostgreSQL
- Socket.IO
- Tailwind + shadcn-style UI components

## Local Setup

1) Copy env
```bash
cp .env.example .env
```

2) Start Postgres
```bash
docker-compose up -d db
```

3) Install deps and migrate
```bash
npm install
npm run prisma:generate
npx prisma migrate dev
```

4) Seed
```bash
npm run seed
```

5) Run app
```bash
npm run dev
```

App: http://localhost:3000

## Admin Workflow

1) Log in as admin (seeded in `.env`)
2) Generate a class join code in **Settings**
3) Import students via CSV (`realName,email`)
4) Create a round with topic + duration + seed (optional)
5) Generate assignments, lock them, start round
6) Monitor rooms in **Rooms**
7) Export logs in **Exports**

## Student Workflow

- Sign up with class join code OR use invite link
- Set nickname on profile page
- Wait for admin to start a round
- Join assigned room and chat

## Exports

`/api/admin/exports?roundId=...&format=json|csv`

JSON includes:
- round metadata
- rooms
- participants
- messages (public + DMs)

CSV is a combined export with participant rows and message rows.

## Security Notes

- Passwords hashed with bcryptjs
- Session cookies are HTTP-only, SameSite=Lax
- CSRF protection via double-submit token (`csrf` cookie + `x-csrf-token` header)
- Socket.IO events validate membership on each send
- DMs visible only to sender, recipient, and admins
- Messages sanitized to prevent XSS
- Rate limiting on auth and chat

## Auto-reshuffle

When `autoReshuffle` is enabled, the system ends the round at the timer and immediately creates a new round using the same topic and duration, reshuffling eligible students.

If you need a different topic each round, keep auto-reshuffle off and create the next round manually.

## Deployment

This app runs as a Node server (custom Socket.IO server) and is compatible with Render/Fly/VPS.

- Set `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`
- Optional email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Optional banner: set `INVITE_BANNER_URL` (public URL) or `INVITE_BANNER_PATH` (local file path for CID embedding)
- Run `prisma migrate deploy`
- Start with `node server.js`

## Prisma Baseline (if DB already exists)

If you already applied the SQL migration manually, run:
```bash
npx prisma migrate resolve --applied 000_init
```
Then `npx prisma migrate deploy` will succeed.

## Invite Emails

If SMTP is configured, invite links are emailed automatically. Otherwise, the admin UI will show the invite URL for manual sharing.

## CSV Import Format

```
realName,email
Jane Doe,jane@school.edu
John Smith,john@school.edu
```
