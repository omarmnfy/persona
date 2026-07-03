import { describe, it, expect } from "vitest";
import { canAccessRoomByMembership } from "@/lib/access";

describe("room access", () => {
  it("prevents student from accessing other rooms", () => {
    const memberships = [
      { userId: "student-1", roomId: "room-a" },
      { userId: "student-2", roomId: "room-b" }
    ];

    expect(canAccessRoomByMembership("student-1", "room-a", memberships)).toBe(true);
    expect(canAccessRoomByMembership("student-1", "room-b", memberships)).toBe(false);
  });
});
