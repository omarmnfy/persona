import Link from "next/link";
import Image from "next/image";

export default function Spring2026Page() {
  return (
    <main className="min-h-screen bg-white relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-[var(--accent)] opacity-[0.05] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[var(--primary)] opacity-[0.05] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-12"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6c3fdb] mb-4">
          Spring 2026
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-2">
          The Inaugural Class
        </h1>
        <p className="text-base text-gray-400 mb-10">
          COGS123: Mind, Brains, &amp; Programs &middot; The Claremont Colleges
        </p>

        <div className="rounded-xl overflow-hidden shadow-lg border border-gray-100 mb-12">
          <Image
            src="/spring2026.jpg"
            alt="COGS123 Spring 2026 Class Photo"
            width={960}
            height={320}
            className="w-full h-auto"
            priority
          />
        </div>

        <div className="space-y-4 text-base leading-relaxed">
          <p className="text-gray-900">
            Thank you for being the very first users of Persona.
          </p>
          <p className="text-gray-500">
            You were the ones who brought this platform to life &mdash; testing the boundaries
            of the Turing Test, debating what makes us human, and challenging each other with
            every question asked. Every bug you found, every round you played, and every
            conversation you had shaped Persona into what it is today.
          </p>
          <p className="text-gray-900 font-medium">
            This one&apos;s for you. The OGs.
          </p>
        </div>
      </div>
    </main>
  );
}
