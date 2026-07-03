import { describe, it, expect } from "vitest";
import { applyAdminPresence } from "@/lib/presence";

describe("admin supervision", () => {
  it("keeps admin hidden in silent mode", () => {
    const participants = [{ userId: "student", displayName: "Student" }];
    const result = applyAdminPresence(participants, { userId: "admin", displayName: "Admin" }, "silent");
    expect(result.length).toBe(1);
  });

  it("shows admin in visible mode", () => {
    const participants = [{ userId: "student", displayName: "Student" }];
    const result = applyAdminPresence(participants, { userId: "admin", displayName: "Admin" }, "visible");
    expect(result.length).toBe(2);
  });
});
