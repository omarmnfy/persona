"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const HIDE_ON_PREFIX = ["/admin", "/room", "/waiting"];

export default function SiteHeader() {
  const pathname = usePathname();
  if (HIDE_ON_PREFIX.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b border-transparent bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-slate-900">Persona</span>
        </Link>
        <div className="flex items-center gap-4">
          {pathname !== "/login" && (
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
