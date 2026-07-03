export type Membership = { userId: string; roomId: string | null };

export function canAccessRoomByMembership(userId: string, roomId: string, memberships: Membership[]) {
  return memberships.some((m) => m.userId === userId && m.roomId === roomId);
}
