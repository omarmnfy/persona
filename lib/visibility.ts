export type Message = {
  senderId: string | null;
  recipientId: string | null;
  roomId: string;
};

export function canViewMessage({
  userId,
  isAdmin,
  isRoomMember,
  message
}: {
  userId: string;
  isAdmin: boolean;
  isRoomMember: boolean;
  message: Message;
}) {
  if (isAdmin) return true;
  if (!isRoomMember) return false;
  if (!message.recipientId) return true;
  return message.senderId === userId || message.recipientId === userId;
}

export function filterMessagesForUser({
  userId,
  isAdmin,
  isRoomMember,
  messages
}: {
  userId: string;
  isAdmin: boolean;
  isRoomMember: boolean;
  messages: Message[];
}) {
  return messages.filter((message) => canViewMessage({ userId, isAdmin, isRoomMember, message }));
}
