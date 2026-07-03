export type Participant = { userId: string; displayName: string };

export function applyAdminPresence(
  participants: Participant[],
  admin: Participant,
  mode: "silent" | "visible"
) {
  if (mode === "silent") return participants;
  const exists = participants.some((p) => p.userId === admin.userId);
  return exists ? participants : [...participants, admin];
}
