import { describe, expect, it } from "vitest";
import { isCompleted, presentClock, queueCounts, rowTone, visitStatus, type PresenceFields } from "./opdPresence";

const v = (over: Partial<PresenceFields> = {}): PresenceFields => ({
  status: "waiting", rxStatus: null, presentAt: null, criticallyIll: false, urgent: false, padStage: null, ...over,
});
const AT = "2026-10-29T12:00:00.000Z"; // 18:00 in Dhaka

describe("rowTone — Urgent over Critically ill over Present", () => {
  it("each alone", () => {
    expect(rowTone(v())).toBeNull();
    expect(rowTone(v({ presentAt: AT }))).toBe("ok");
    expect(rowTone(v({ criticallyIll: true }))).toBe("warn");
    expect(rowTone(v({ urgent: true }))).toBe("danger");
  });
  it("the highest wins when several are ticked", () => {
    expect(rowTone(v({ presentAt: AT, criticallyIll: true }))).toBe("warn");
    expect(rowTone(v({ presentAt: AT, criticallyIll: true, urgent: true }))).toBe("danger");
    expect(rowTone(v({ criticallyIll: true, urgent: true }))).toBe("danger");
  });
});

describe("visitStatus — later wins", () => {
  it("is empty before Present", () => expect(visitStatus(v())).toBe(""));
  it("Present → Waiting", () => expect(visitStatus(v({ presentAt: AT }))).toBe("Waiting"));
  it("history, then pending, then completed", () => {
    expect(visitStatus(v({ presentAt: AT, padStage: "history" }))).toBe("History taken");
    expect(visitStatus(v({ presentAt: AT, padStage: "pending" }))).toBe("Prescription pending");
    expect(visitStatus(v({ presentAt: AT, padStage: "pending", rxStatus: "complete" }))).toBe("Completed");
  });
  it("Done and a printed prescription are both Completed", () => {
    expect(visitStatus(v({ status: "done" }))).toBe("Completed");
    expect(visitStatus(v({ rxStatus: "complete" }))).toBe("Completed");
    expect(isCompleted(v({ rxStatus: "incomplete" }))).toBe(false);
  });
  it("a stage shows even before Present is ticked (the doctor opened them)", () => {
    expect(visitStatus(v({ padStage: "history" }))).toBe("History taken");
  });
});

describe("presentClock — Dhaka time, no locale", () => {
  it("writes h.mm and am/pm", () => {
    expect(presentClock(AT)).toBe("6.00pm");
    expect(presentClock("2026-10-29T00:05:00.000Z")).toBe("6.05am");
    expect(presentClock("2026-10-29T18:00:00.000Z")).toBe("12.00am");
    expect(presentClock("2026-10-29T06:30:00.000Z")).toBe("12.30pm");
  });
  it("is empty for no time or a bad one", () => {
    expect(presentClock(null)).toBe("");
    expect(presentClock("not a date")).toBe("");
  });
});

describe("queueCounts", () => {
  it("counts what the rows say", () => {
    const rows = [
      v({ presentAt: AT }), v({ presentAt: AT, padStage: "history" }),
      v({ presentAt: AT, rxStatus: "complete" }), v({ status: "done" }), v(),
    ];
    expect(queueCounts(rows)).toEqual({ total: 5, present: 3, completed: 2, waiting: 2 });
  });
});
