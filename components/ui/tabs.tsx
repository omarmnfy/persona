import * as React from "react";
import { cn } from "./utils";

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold",
        active
          ? "bg-[var(--primary)] text-white shadow-sm"
          : "text-[var(--muted)] hover:bg-[var(--surface-hover)]",
        className
      )}
      {...props}
    />
  );
}
