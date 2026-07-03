"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Particle = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
  duration: number;
  drift: number;
};

const CONFETTI_COLORS = [
  "#6c3fdb",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#f97316",
];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 1.5,
    drift: -30 + Math.random() * 60,
  }));
}

export function Spring2026Button() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    setParticles(generateParticles(24));
    const interval = setInterval(() => {
      setParticles(generateParticles(24));
      setBurstKey((k) => k + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = useCallback(() => {
    setParticles(generateParticles(40));
    setBurstKey((k) => k + 1);
  }, []);

  return (
    <div className="relative">
      <div
        key={burstKey}
        className="pointer-events-none absolute -inset-6 overflow-visible"
        aria-hidden="true"
      >
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute animate-confetti-fall"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: p.size > 7 ? "50%" : "1px",
              transform: `rotate(${p.rotation}deg)`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              opacity: 0,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <Link
        href="/spring2026"
        onClick={handleClick}
        className="relative flex items-center gap-1.5 rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--accent)] shadow-sm hover:bg-[var(--accent)] hover:text-white transition-all animate-gentle-glow"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
        </svg>
        Spring 2026 Class
      </Link>
    </div>
  );
}
