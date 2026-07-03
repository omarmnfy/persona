# Persona - Role-based Discussion Rooms

## Overview
Persona is a Next.js 15 application for classroom role-based discussion rooms, built for the COGS123: Mind, Brains, & Programs class at The Claremont Colleges. It features real-time communication via Socket.IO, user authentication, admin management of rounds/rooms, and role assignment (True Collegian, Poser, Interrogator). Created by Omar Mnfy.

## Tech Stack
- **Framework**: Next.js 15 (App Router) with custom server (server.js)
- **Language**: TypeScript / JavaScript
- **Database**: PostgreSQL via Prisma ORM
- **Real-time**: Socket.IO
- **Styling**: Tailwind CSS
- **Auth**: Custom session-based authentication (bcryptjs)

## Project Structure
- `app/` - Next.js App Router pages and API routes
- `components/` - Reusable React UI components
- `lib/` - Server-side utility libraries (auth, db, roles, etc.)
- `server/` - Custom server files (Socket.IO, presence, round scheduler)
- `prisma/` - Database schema and migrations
- `prisma/deploy-seed.ts` - Production seed script (creates super admin)
- `assets/` - Static assets (email templates)

## Running the App
- **Dev**: `npm run dev` (runs custom server.js on port 5000)
- **Build**: `npm run build`
- **Production**: `npm run start`
- **Deploy Build**: `npm run deploy:build` (generates Prisma, pushes schema, seeds super admin, builds Next.js)

## Account Types
- **STUDENT**: Regular student accounts, invited by admins
- **ADMIN**: Administrator accounts, can manage rounds/rooms/students
- **SUPER_ADMIN**: Super administrator (omarmnfy@gmail.com), can do everything admins can plus delete/edit other admins. Uses email claim flow for initial setup.

## Database
- PostgreSQL database managed via Prisma
- Schema push: `npx prisma db push`
- Dev seed: `npx tsx prisma/seed.ts`
- Deploy seed: `npx tsx prisma/deploy-seed.ts` (creates super admin if not exists)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `APP_BASE_URL` - Public URL of the application (https://persona-omarmnfy.replit.app)
- `PORT` - Server port (default 5000)
- SMTP settings for email invitations: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Deployment
- Target: Reserved VM (for Socket.IO real-time support)
- Build: `npm run deploy:build`
- Run: `npm run start`
- The deploy-seed ensures the super admin account exists in production

## Recent Changes
- Added SUPER_ADMIN account type with email claim flow (Feb 2026)
- Homepage updated with Student/Admin sign-in buttons and "Claim Admin Account" option
- Super admin (omarmnfy@gmail.com) can delete/edit other admins via API
- Deploy build now includes production seeding for super admin
- All admin API routes updated to recognize SUPER_ADMIN as fully privileged
- PDF chat transcript download for students (lib/chatPdf.ts) — color-coded questions in red, assigned names only, available from room page (Feb 2026)
- Auto-download chat PDF when room countdown ends (Feb 2026)
- Server-side transcript email: students receive email with link to web-based transcript page when round ends (server/transcriptMailer.js) (Feb 2026)
- Web-based transcript viewing page at /transcript/[roundId] — authenticated, shows student's personalized chat history (Feb 2026)
- Admin removal: super admin can remove other admins from admin dashboard (Feb 2026)
- Removed nickname option from student profile (only real names and assigned names)
- Waiting room instructions modal with adapted Turing Test rules (Feb 2026)
- Intake Form button in student chat room sidebar + link included in transcript emails (Feb 2026)
- Changed institution reference to "The Claremont Colleges" across all pages, PDFs, and emails
- Password reset: token-based forgot password flow with 1-hour expiration and email notification (Feb 2026)
- "Other" school option added for non-Claremont students (Feb 2026)
- Admins can edit student school assignments from admin dashboard (Feb 2026)
- All admins can remove other admins (not just super admin) (Feb 2026)
- Security dependency updates: next 14.2.5→14.2.35, nodemailer 6.x→7.x, glob override to 11.1.0 (Feb 2026)
- Security dependency update: next 14.2.35→15.0.8 with all breaking change fixes (async params, async cookies, useParams hook) (Feb 2026)
- Pre-round assignment management: admins can assign/shuffle students to rooms before starting a round (Feb 2026)
- Rooms tab enhanced with round selector to view and manage assignments for any round (scheduled, active, or ended)
- Admin dashboard Students page redesigned with professional data table layout and summary statistics (Feb 2026)
- Removed seconds from all timing displays; countdowns show minutes only (Feb 2026)
- Session-based round management: DiscussionSession model groups multiple rounds; bulk create sessions with N rounds (Feb 2026)
- Rounds tab redesigned with session grouping, collapsible session cards, standalone rounds section (Feb 2026)
- Role uniqueness enforced per room: assigning a duplicate role auto-bumps previous holder to Waiting (Feb 2026)
- Student assigned name saves automatically on selection (no Save button) (Feb 2026)
- Custom email banner (Persona Platform + all 5 Claremont Colleges logos) used across invite, reset, and transcript emails (Feb 2026)
- Fair interrogator assignment: session-level bulk assign ensures every student gets Interrogator at least once across rounds (Feb 2026)
- Dynamic room names based on True Collegian's school: e.g. "Finding Who is Actually From Harvey Mudd College?" (Feb 2026)
- Students with "Other" school cannot be assigned as True Collegian (only Interrogator or Poser) (Feb 2026)
- Room names update dynamically when admin reassigns students to different roles (Feb 2026)
- Remove from room button added to admin Rooms tab (sends student to waiting pool) (Feb 2026)
- Interrogator guess feature: after room time ends, interrogators guess who the True Collegian was; confetti on correct guess (Feb 2026)
- InterrogatorGuess model tracks guesses with correctness per room/round (Feb 2026)
- Homepage feedback button linking to Google Form (Feb 2026)
- Homepage single-viewport layout (no scrolling) (Feb 2026)
- Question timer auto-send: responders' draft answers auto-submit when timer expires (Feb 2026)
- Server-side grace period (1.5s) for accepting late auto-sent answers (Feb 2026)
- Question timer moved from header to chatbox area for better usability (Feb 2026)
- Fixed chatbox lock bug: hasSubmittedAnswer now resets on every question:update event (Feb 2026)
- Security dependency updates: jspdf 4.1.0→4.2.0, minimatch override to 10.2.1 (Feb 2026)
- Exports tab redesigned: session/round dropdowns replace manual Round ID input; Export button on each round row (Feb 2026)
- Analytics tab: per-session student role tracking, leaderboards for Best Poser/True Collegian/Interrogator (Feb 2026)
- Analytics API endpoint: /api/admin/analytics computes per-session performance stats from InterrogatorGuess data (Feb 2026)
- Analytics full student roster: per-round role, room number, outcome (success/fail/no-guess), summary stats with win/total per role (Feb 2026)
- Analytics room assignments & chat logs: expandable rounds with expandable rooms showing participants, roles, and full chat transcripts (Feb 2026)
- Chat auto-scroll: messages auto-scroll to bottom on new messages; pauses when user scrolls up to read history, resumes when scrolled back near bottom (WhatsApp-style) — applies to both student room and admin room views (Feb 2026)
- WebGL shader homepage was tested but reverted; original purple UI restored (Mar 2026)
- Assignment rule: True Collegian and Poser must be from different schools; enforced in both single-round (buildAssignments) and session-level (generateSessionAssignments) assignment logic (Mar 2026)
- New students auto-join scheduled rounds as WAITING: when admin views the Rooms tab for a scheduled round, any active students not yet in that round are automatically added to the waiting pool (Mar 2026)
- Waiting-to-room drag: students dropped from waiting pool into a room now auto-detect the missing role (e.g., if room has Interrogator + True Collegian, student becomes Poser); students no longer carry stale roles from previous assignments (Mar 2026)

## User Preferences
- Creator attribution: Omar Mnfy (omarmnfy.com)
- Registration: Admin-invite only (no public signup)
- Super admin email: omarmnfy@gmail.com
