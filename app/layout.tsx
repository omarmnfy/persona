import "./globals.css";
import type { ReactNode } from "react";
import AppShell from "@/components/ui/app-shell";

export const metadata = {
  title: "Persona",
  description: "Role-based classroom discussion platform",
  icons: {
    icon: [{ url: "/icons/persona-icon-512.png" }],
    apple: [{ url: "/icons/persona-apple-180.png" }]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
