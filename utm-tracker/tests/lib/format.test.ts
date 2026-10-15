import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, formatDateTime, formatNumber } from "@/lib/utils";

// The server runs in UTC with an English locale, browsers often in Asia/Almaty with
// ru-RU. Anything rendered on both sides must not depend on either, or React hydration
// fails (#418).
describe("formatting that must match on server and browser", () => {
  it("formats date-times in the team's time zone, whatever the machine's zone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Almaty");
    // 14:00 UTC = 19:00 in Almaty (UTC+5)
    expect(formatDateTime("2026-10-15T14:00:00Z")).toBe("15 Oct 2026, 19:00");
    // crosses midnight: still the Almaty calendar day
    expect(formatDateTime(new Date("2026-10-15T20:30:00Z"))).toBe("16 Oct 2026, 01:30");
  });

  it("groups digits the same way everywhere", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});
