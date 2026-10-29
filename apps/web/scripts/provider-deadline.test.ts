import { afterEach, describe, expect, it, vi } from "vitest";

import { withDeadline } from "./provider-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withDeadline", () => {
  it("moves on when an operation ignores cancellation", async () => {
    vi.useFakeTimers();
    let wasAborted = false;
    const pending = withDeadline((signal) => {
      signal.addEventListener("abort", () => {
        wasAborted = true;
      });
      return new Promise<never>(() => {});
    }, 40);
    const rejection = expect(pending).rejects.toThrow("Timed out after 40 ms");

    await vi.advanceTimersByTimeAsync(40);

    await rejection;
    expect(wasAborted).toBe(true);
  });

  it("returns a timely response and clears the deadline", async () => {
    vi.useFakeTimers();
    let wasAborted = false;
    const result = await withDeadline(async (signal) => {
      signal.addEventListener("abort", () => {
        wasAborted = true;
      });
      return "done";
    }, 40);

    await vi.advanceTimersByTimeAsync(40);

    expect(result).toBe("done");
    expect(wasAborted).toBe(false);
  });
});
