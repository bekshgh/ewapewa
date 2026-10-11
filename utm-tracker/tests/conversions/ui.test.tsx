import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { computeRatios } from "@/lib/conversions/compute";
import { RatioCards } from "@/components/conversions/RatioCards";
import { NumbersScheme } from "@/components/conversions/NumbersScheme";
import { breakdownText } from "@/components/conversions/Breakdown";
import type { InputState } from "@/lib/conversions/state";

const input = (key: string, label: string, value: number | null) => ({ key, label, value, mode: "auto", origin: "" }) as unknown as InputState;

describe("conversion UI", () => {
  it("cards show percent + fraction, and say what is missing instead of 0", () => {
    const html = renderToStaticMarkup(<RatioCards ratios={computeRatios({ projectRegs: 600, showUp: null, regOgx: 60, aiesecOrgSignup: 30 })} />);
    expect(html).toContain("10,0%");
    expect(html).toContain("60 / 600");
    expect(html).toContain("Не хватает: Шоуап");
    expect(html).not.toMatch(/>0,0%</);
  });

  it("small base and >100% badges carry text, not only colour", () => {
    const html = renderToStaticMarkup(<RatioCards ratios={computeRatios({ projectRegs: 10, showUp: 5, regOgx: 12, aiesecOrgSignup: 3 })} />);
    expect(html).toContain("малая база");
    expect(html).toContain("проверьте данные");
  });

  it("the scheme is labelled, keeps units and never talks about a funnel or losses", () => {
    const html = renderToStaticMarkup(
      <NumbersScheme
        inputs={{
          projectRegs: input("projectRegs", "Реги на проект", 600),
          showUp: input("showUp", "Шоуап", 300),
          regOgx: input("regOgx", "Рега oGX", 60),
          aiesecOrgSignup: input("aiesecOrgSignup", "AIESEC.org signup", null),
        }}
      />,
    );
    expect(html).toContain('aria-label="Реги на проект: 600 человек"');
    expect(html).toContain("чел.");
    expect(html).toContain("нет данных");
    expect(html).not.toMatch(/воронк|потер/i);
  });

  it("breakdown reads like the spec", () => {
    const text = breakdownText({ raw: 629, invalid: 0, duplicates: 26, unique: 603, quarantined: 4, rejected: 0, pending: 7, approved: 0, suspiciousExcluded: 0, total: 599, strict: 592 });
    expect(text).toBe("629 записей → −26 дублей → −4 карантин → итог 599");
  });
});
