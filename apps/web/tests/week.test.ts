import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  formatLocalDate,
  getLocalWeekStart,
  getWeekDates,
  parseLocalDate,
  resolveWeekStart,
  shiftWeek,
} from "@/lib/week";

describe("local week helpers", () => {
  it.each([
    ["2026-01-01", [2026, 0, 1]],
    ["2024-02-29", [2024, 1, 29]],
    ["2026-12-31", [2026, 11, 31]],
  ])(
    "parses and formats calendar date %s without changing its day",
    (value, parts) => {
      const date = parseLocalDate(value);

      expect(date).not.toBeNull();
      expect([date!.getFullYear(), date!.getMonth(), date!.getDate()]).toEqual(
        parts,
      );
      expect(formatLocalDate(date!)).toBe(value);
    },
  );

  it.each(["", "2026-2-02", "2026-02-30", "2025-02-29", "not-a-date"])(
    "rejects invalid local date %j",
    (value) => {
      expect(parseLocalDate(value)).toBeNull();
    },
  );

  it("finds Monday for dates on both sides of a month boundary", () => {
    expect(formatLocalDate(getLocalWeekStart(new Date(2026, 9, 1, 12)))).toBe(
      "2026-09-28",
    );
    expect(formatLocalDate(getLocalWeekStart(new Date(2026, 9, 4, 12)))).toBe(
      "2026-09-28",
    );
  });

  it("uses a valid requested Monday and falls back to today's week otherwise", () => {
    const today = new Date(2026, 9, 1, 12);

    expect(resolveWeekStart("2026-10-05", today)).toBe("2026-10-05");
    expect(resolveWeekStart("2026-10-01", today)).toBe("2026-09-28");
    expect(resolveWeekStart("invalid", today)).toBe("2026-09-28");
    expect(resolveWeekStart(null, today)).toBe("2026-09-28");
  });

  it("builds Monday through Sunday across month and year boundaries", () => {
    expect(getWeekDates("2026-12-28").map(formatLocalDate)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("shifts weeks across month and year boundaries", () => {
    expect(shiftWeek("2026-09-28", 1)).toBe("2026-10-05");
    expect(shiftWeek("2027-01-04", -1)).toBe("2026-12-28");
  });

  it("advances by calendar day across daylight-saving transitions", () => {
    const springWeek = getWeekDates("2026-03-02");
    const fallWeek = getWeekDates("2026-10-26");

    expect(springWeek.map(formatLocalDate)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
    expect(formatLocalDate(addLocalDays(springWeek[6], 1))).toBe("2026-03-09");
    expect(fallWeek.map(formatLocalDate)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(formatLocalDate(addLocalDays(fallWeek[6], 1))).toBe("2026-11-02");
  });

  it.each(["2026-10-01", "2026-02-30", "invalid"])(
    "rejects invalid week start %j",
    (value) => {
      expect(() => getWeekDates(value)).toThrow("Invalid week start");
      expect(() => shiftWeek(value, 1)).toThrow("Invalid week start");
    },
  );
});
