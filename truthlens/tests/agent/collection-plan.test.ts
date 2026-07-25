import { describe, it, expect } from "vitest";
import { buildCollectionPlan, type PIR, type EEI, type DoctrineTask } from "../../lib/agent/collection-plan";

const pirs: PIR[] = [{ id: "pir1", question: "are a.com and b.com operated together?" }];
const eeis: EEI[] = [
  { id: "eei1", pirId: "pir1", fact: "shared individual identifier" },
  { id: "eei2", pirId: "pir1", fact: "shared true origin" },
];

describe("collection doctrine PIR->EEI->task (06·P3)", () => {
  it("rejects a task that does not trace up to a PIR, with a reason", () => {
    const tasks: DoctrineTask[] = [
      { id: "t1", eeiId: "eei1", source: "page", description: "GA id", diagnosticity: 0.9 },
      { id: "t2", eeiId: "orphan", source: "whim", description: "curiosity", diagnosticity: 0.8 },
    ];
    const plan = buildCollectionPlan(pirs, eeis, tasks);
    expect(plan.accepted.map((t) => t.id)).toEqual(["t1"]);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].reason).toMatch(/untraceable/);
  });

  it("ranks tasks within EEI within PIR by diagnosticity", () => {
    const tasks: DoctrineTask[] = [
      { id: "low", eeiId: "eei1", source: "page", description: "x", diagnosticity: 0.2 },
      { id: "high", eeiId: "eei1", source: "cert", description: "y", diagnosticity: 0.9 },
    ];
    const plan = buildCollectionPlan(pirs, eeis, tasks);
    expect(plan.accepted.map((t) => t.id)).toEqual(["high", "low"]);
  });

  it("the matrix doubles as the gaps register — every unfilled cell is a known gap", () => {
    const tasks: DoctrineTask[] = [{ id: "t1", eeiId: "eei1", source: "page", description: "GA id", diagnosticity: 0.9 }];
    const plan = buildCollectionPlan(pirs, eeis, tasks);
    // eei2 has no planned task => a known gap
    expect(plan.gaps.some((c) => c.eeiId === "eei2")).toBe(true);
    expect(plan.matrix.find((c) => c.eeiId === "eei1")?.status).toBe("filled");
  });
});
