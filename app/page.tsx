import Link from "next/link";
import { ClaimAdminForm } from "@/components/claim-admin-form";
import { Spring2026Button } from "@/components/spring-2026-button";

export default function HomePage() {
  return (
    <main className="h-screen flex flex-col selection:bg-[var(--surface)] overflow-hidden">
      <div className="absolute top-5 right-6 z-10 flex flex-col items-end gap-2">
        <a
          href="https://forms.gle/FPFMU1RtKSkyoFtA7"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--muted)] shadow-sm hover:text-[var(--ink)] hover:border-[var(--ink)] transition-all"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Feedback
        </a>
        <Spring2026Button />
      </div>

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[var(--primary)] opacity-[0.07] blur-3xl" />
        </div>

        <div className="relative flex-1 flex flex-col justify-center mx-auto max-w-5xl w-full px-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-5xl font-bold tracking-tight sm:text-7xl mb-3">
              Persona
            </h1>

            <p className="text-lg leading-relaxed text-[var(--muted)] mb-2 max-w-2xl">
              A platform for performing the Turing Test
            </p>

            <p className="text-sm text-[var(--muted)] mb-8 max-w-xl opacity-75">
              COGS123: Mind, Brains, &amp; Programs at The Claremont Colleges
            </p>

            <div className="w-full max-w-sm space-y-3">
              <Link
                href="/login"
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-8 py-3.5 text-base font-semibold text-[var(--primary-contrast)] shadow-lg hover:bg-[var(--primary-hover)] transition-all"
              >
                Sign in as Student
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>

              <Link
                href="/login"
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-8 py-3.5 text-base font-semibold text-white shadow-lg hover:opacity-90 transition-all"
              >
                Sign in as Admin
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>

            <div className="w-full max-w-sm mt-5">
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest">
                  <span className="bg-[var(--bg)] px-4 text-[var(--muted)] opacity-60">or</span>
                </div>
              </div>
              <ClaimAdminForm />
            </div>

            <div className="mt-6 flex items-center gap-6 text-xs text-[var(--muted)] opacity-60">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Invite-only
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Real-time
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Secure
              </span>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-4 border-t border-[var(--border)]">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-[var(--muted)] opacity-60">
          <p>
            Persona &bull; COGS123: Mind, Brains, &amp; Programs &bull; The Claremont Colleges &bull; Created by{" "}
            <a
              href="https://omarmnfy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-[var(--primary)] transition-colors"
            >
              Omar Mnfy
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
