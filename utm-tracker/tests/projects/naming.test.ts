import { describe, expect, it } from "vitest";
import { normalizeProjectName, parseProjectName, seasonOf, termOf, termOptions, utmCampaignOf, withTerm } from "@/lib/naming";

describe("project naming: <Project> F'26 / S'26", () => {
  it("reads the term in any common spelling and writes it one way", () => {
    expect(normalizeProjectName("SheCodes F'26")).toBe("SheCodes F'26");
    expect(normalizeProjectName("SheCodes f’26")).toBe("SheCodes F'26");
    expect(normalizeProjectName("SheCodes F26")).toBe("SheCodes F'26");
    expect(normalizeProjectName("  SheCodes   Fall 2026 ")).toBe("SheCodes F'26");
    expect(normalizeProjectName("ICY spring 27")).toBe("ICY S'27");
    expect(normalizeProjectName("Business Cup 2.0 F'26")).toBe("Business Cup 2.0 F'26");
    expect(normalizeProjectName("TopTalents Sprint EwA2oGX S'26")).toBe("TopTalents Sprint EwA2oGX S'26");
    expect(parseProjectName("ÖZGE Forum S'26")).toEqual({ base: "ÖZGE Forum", term: "S'26" });
  });

  it("rejects names without a term, or with only a term", () => {
    expect(normalizeProjectName("SheCodes")).toBeNull();
    expect(normalizeProjectName("Business Cup 2.0")).toBeNull();
    expect(normalizeProjectName("F'26")).toBeNull();
    expect(normalizeProjectName("SheCodes W'26")).toBeNull();
  });

  it("adds the term from the event date when a file's name has none", () => {
    expect(termOf("2026-03-10")).toBe("S'26");
    expect(termOf("2026-07-01")).toBe("F'26");
    expect(withTerm("Özge", "2026-08-21")).toBe("Özge F'26");
    expect(withTerm("Özge S'26", "2026-08-21")).toBe("Özge S'26");
    expect(withTerm("Özge", null)).toBe("Özge");
  });

  it("gives the campaign its season and utm_campaign value", () => {
    expect(seasonOf("F'26")).toBe("fall 2026");
    expect(seasonOf("S'27")).toBe("spring 2027");
    expect(utmCampaignOf("SheCodes F'26")).toBe("shecodes_f26");
    expect(utmCampaignOf("Business Cup 2.0 F'26")).toBe("business_cup_2_0_f26");
    expect(utmCampaignOf("ÖZGE Forum S'26")).toBe("ozge_forum_s26");
  });

  it("offers terms from two years back to a year ahead", () => {
    expect(termOptions(new Date("2026-10-19"))).toEqual(["F'27", "S'27", "F'26", "S'26", "F'25", "S'25", "F'24", "S'24"]);
  });
});

describe("the rule is enforced when saving", () => {
  it("projects: canonical name, or a readable error", async () => {
    const { projectCreateSchema, validationError } = await import("@/lib/projects/validation");
    const ok = projectCreateSchema.safeParse({ name: "SheCodes fall 2026", typeKey: "forum" });
    expect(ok.success && ok.data).toMatchObject({ name: "SheCodes F'26", campaign: true });
    const bad = projectCreateSchema.safeParse({ name: "SheCodes", typeKey: "forum" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(validationError(bad.error)).toMatch(/F'26/);
  });

  it("campaigns: the label needs a term, utm_campaign may be left empty", async () => {
    const { createCampaignSchema } = await import("@/lib/validation");
    const ok = createCampaignSchema.safeParse({ label: "ICY S'27" });
    expect(ok.success && ok.data).toMatchObject({ label: "ICY S'27", name: "" });
    expect(createCampaignSchema.safeParse({ name: "icy", label: "ICY" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "icy_s27" }).success).toBe(false);
  });
});
