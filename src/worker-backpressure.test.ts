import { describe, expect, it } from "vitest";
import { MAX_PENDING_ENGINE_COMMANDS, PendingCommandGate } from "./worker-backpressure";

describe("PendingCommandGate", () => {
  it("rejects the first command above the pending-message ceiling", () => {
    const gate = new PendingCommandGate();
    for (let index = 0; index < MAX_PENDING_ENGINE_COMMANDS; index += 1) {
      expect(gate.tryEnter()).toBe(true);
    }
    expect(gate.size).toBe(MAX_PENDING_ENGINE_COMMANDS);
    expect(gate.tryEnter()).toBe(false);
    gate.leave();
    expect(gate.tryEnter()).toBe(true);
  });

  it("rejects an unmatched completion", () => {
    const gate = new PendingCommandGate();
    expect(() => gate.leave()).toThrow(/vazia/);
  });
});
