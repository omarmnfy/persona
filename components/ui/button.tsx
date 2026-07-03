import * as React from "react";
import { cn } from "./utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:translate-y-0 disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none disabled:border-gray-300",
        variant === "primary" &&
          "bg-[var(--primary)] text-[var(--primary-contrast)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--primary-hover)]",
        variant === "outline" &&
          "border border-[var(--border)] bg-white/80 text-[var(--ink)] hover:-translate-y-0.5 hover:bg-[var(--surface-hover)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--ink)] hover:-translate-y-0.5 hover:bg-[var(--surface-hover)]",
        variant === "danger" &&
          "bg-[var(--danger)] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[var(--danger-hover)]",
        size === "sm" && "px-3 py-2 text-sm",
        size === "md" && "px-4 py-2 text-sm",
        size === "lg" && "px-5 py-3 text-base",
        className
      )}
      {...props}
    />
  );
}
