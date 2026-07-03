"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "./utils";
import { evaluatePassword } from "@/lib/password";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  showStrength?: boolean;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showStrength = false, value, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const passwordValue = typeof value === "string" ? value : "";
    const strength = showStrength ? evaluatePassword(passwordValue) : null;
    const strengthPercent = strength ? Math.min(100, strength.score * 20) : 0;
    const strengthColor =
      strength?.strength === "strong"
        ? "bg-[var(--primary)]"
        : strength?.strength === "moderate"
        ? "bg-[var(--accent)]"
        : "bg-[var(--primary)]/30";

    return (
      <div className="space-y-2">
        <div className="relative">
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            className={cn(
              "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 pr-10 text-sm transition-shadow",
              "focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
              className
            )}
            value={value}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {strength && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
              <div
                className={cn("h-full transition-all", strengthColor)}
                style={{ width: `${strengthPercent}%` }}
              />
            </div>
            <div className="text-xs text-[var(--muted)]">
              <div className="capitalize">Strength: {strength.strength}</div>
              <div className="mt-1">Strong passwords should contain:</div>
              <div>• 8+ characters</div>
              <div>• Uppercase</div>
              <div>• Lowercase</div>
              <div>• Number</div>
              <div>• Symbol</div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
