export const ROLE_LABELS: Record<string, string> = {
  REAL: "True Collegian",
  FAKE: "Poser",
  INTERROGATOR: "Interrogator",
  WAITING: "Waiting"
};

export const ROLE_COLORS: Record<string, string> = {
  REAL: "#16A34A",
  FAKE: "#F59E0B",
  INTERROGATOR: "#DC2626",
  WAITING: "#64748B"
};

export function roleLabel(role?: string | null) {
  if (!role) return "--";
  return ROLE_LABELS[role] ?? role;
}

export function roleBadgeStyle(role?: string | null) {
  const color = ROLE_COLORS[role ?? ""] ?? ROLE_COLORS.WAITING;
  return {
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.12)
  };
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(15, 23, 42, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
