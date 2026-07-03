import { describe, it, expect } from "vitest";
import { buildAssignments } from "@/lib/assign";
import { Role } from "@prisma/client";

function makeStudents(count: number) {
  return Array.from({ length: count }).map((_, index) => ({
    id: `user-${index + 1}`,
    realName: `Student ${index + 1}`
  }));
}

describe("assignment algorithm", () => {
  it("is deterministic with a seed", () => {
    const students = makeStudents(9);
    const first = buildAssignments(students, "seed-123");
    const second = buildAssignments(students, "seed-123");
    expect(first.roomAssignments).toEqual(second.roomAssignments);
    expect(first.waiting).toEqual(second.waiting);
  });

  it("assigns one of each role per room", () => {
    const students = makeStudents(6);
    const result = buildAssignments(students, "roles");
    for (const room of result.roomAssignments) {
      const roles = room.roles.sort();
      expect(roles).toEqual([Role.FAKE, Role.INTERROGATOR, Role.REAL].sort());
    }
  });

  it("puts leftovers into waiting pool", () => {
    const students = makeStudents(8);
    const result = buildAssignments(students, "leftovers");
    expect(result.roomAssignments.length).toBe(2);
    expect(result.waiting.length).toBe(2);
  });
});
