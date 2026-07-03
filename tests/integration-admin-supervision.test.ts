import { describe, it, expect } from "vitest";
import { applyAdminPresence } from "@/lib/presence";

describe("integration: admin supervision", () => {
  it("does not show admin in silent mode", () => {
    const participants = [{ userId: "student", displayName: "Student" }];
    const result = applyAdminPresence(participants, { userId: "admin", displayName: "Admin" }, "silent");
    expect(result.find((p) => p.userId === "admin")).toBeUndefined();
  });

  it("shows admin in visible mode", () => {
    const participants = [{ userId: "student", displayName: "Student" }];
    const result = applyAdminPresence(participants, { userId: "admin", displayName: "Admin" }, "visible");
    expect(result.find((p) => p.userId === "admin")).toBeDefined();
  });
});
