import { describe, it, expect } from "vitest";
import { filterMessagesForUser } from "@/lib/visibility";

describe("integration: dm visibility", () => {
  it("blocks non-members from seeing any messages", () => {
    const messages = [
      { senderId: "a", recipientId: null, roomId: "room-1" },
      { senderId: "a", recipientId: "b", roomId: "room-1" }
    ];
    const outsider = filterMessagesForUser({
      userId: "c",
      isAdmin: false,
      isRoomMember: false,
      messages
    });
    expect(outsider.length).toBe(0);
  });
});
