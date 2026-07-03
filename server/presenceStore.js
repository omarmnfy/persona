const presenceByRoom = new Map();
const onlineUsers = new Map();

function getRoomMap(roomId) {
  if (!presenceByRoom.has(roomId)) {
    presenceByRoom.set(roomId, new Map());
  }
  return presenceByRoom.get(roomId);
}

export function setAdminPresence({ roomId, adminId, displayName, mode }) {
  const roomMap = getRoomMap(roomId);
  roomMap.set(adminId, { adminId, displayName, mode });
}

export function removeAdminPresence({ roomId, adminId }) {
  const roomMap = presenceByRoom.get(roomId);
  if (!roomMap) return;
  roomMap.delete(adminId);
  if (roomMap.size === 0) presenceByRoom.delete(roomId);
}

export function getVisibleAdmins(roomId) {
  const roomMap = presenceByRoom.get(roomId);
  if (!roomMap) return [];
  return Array.from(roomMap.values())
    .filter((entry) => entry.mode === "visible")
    .map((entry) => ({ userId: entry.adminId, displayName: entry.displayName }));
}

export function setUserOnline({ userId }) {
  const entry = onlineUsers.get(userId);
  if (entry) {
    entry.count += 1;
    entry.lastSeenAt = new Date();
    onlineUsers.set(userId, entry);
    return;
  }
  onlineUsers.set(userId, { userId, count: 1, lastSeenAt: new Date() });
}

export function setUserOffline({ userId }) {
  const entry = onlineUsers.get(userId);
  if (!entry) return;
  if (entry.count <= 1) {
    onlineUsers.delete(userId);
    return;
  }
  entry.count -= 1;
  entry.lastSeenAt = new Date();
  onlineUsers.set(userId, entry);
}

export function getOnlineUserIds() {
  return new Set(onlineUsers.keys());
}
