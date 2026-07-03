import { describe, it, expect } from "vitest";
import { canAccessRoomByMembership } from "@/lib/access";

describe("integration: room access", () => {
  it("denies access when membership is for another room", () => {
    const memberships = [
      { userId: "student-1", roomId: "room-a" },
      { userId: "student-2", roomId: "room-b" }
    ];
    expect(canAccessRoomByMembership("student-1", "room-b", memberships)).toBe(false);
  });
});
