import { describe, it, expect } from "vitest";
import { filterMessagesForUser } from "@/lib/visibility";

const messages = [
  { senderId: "a", recipientId: null, roomId: "room-1" },
  { senderId: "a", recipientId: "b", roomId: "room-1" },
  { senderId: "c", recipientId: "a", roomId: "room-1" }
];

describe("message visibility", () => {
  it("allows sender and recipient to see DMs", () => {
    const aView = filterMessagesForUser({ userId: "a", isAdmin: false, isRoomMember: true, messages });
    expect(aView.length).toBe(3);

    const bView = filterMessagesForUser({ userId: "b", isAdmin: false, isRoomMember: true, messages });
    expect(bView.length).toBe(2);
  });

  it("allows admins to see all messages", () => {
    const adminView = filterMessagesForUser({ userId: "admin", isAdmin: true, isRoomMember: false, messages });
    expect(adminView.length).toBe(3);
  });
});
