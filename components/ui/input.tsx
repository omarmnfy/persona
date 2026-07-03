import * as React from "react";
import { cn } from "./utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm transition-shadow",
          "focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
