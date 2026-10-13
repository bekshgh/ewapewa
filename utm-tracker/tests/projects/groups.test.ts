import { describe, expect, it } from "vitest";
import { groupCampaigns, parseCampaignName, personKeys } from "@/lib/projectGroups";

const c = (id: string, name: string, label: string | null, day = 1) => ({ id, name, label, createdAt: new Date(2026, 8, day) });

describe("parseCampaignName", () => {
  it("splits project, season and programme", () => {
    expect(parseCampaignName("TopTalents Sprint F'26")).toEqual({ base: "toptalentssprint", season: "f26", programme: "" });
    expect(parseCampaignName("toptalentssprint_f26")).toEqual({ base: "toptalentssprint", season: "f26", programme: "" });
    expect(parseCampaignName("TopTalents Sprint EwA2oGX")).toEqual({ base: "toptalentssprint", season: "", programme: "ogx" });
    expect(parseCampaignName("Özge EwA2MXP")).toEqual({ base: "ozge", season: "", programme: "mxp" });
    expect(parseCampaignName("ozge_s26")).toEqual({ base: "ozge", season: "s26", programme: "" });
  });
});

describe("groupCampaigns", () => {
  const list = [
    c("tts", "toptalentssprint_f26", "TopTalents Sprint F'26", 1),
    c("ttsogx", "tts_ewa2ogx", "TopTalents Sprint EwA2oGX", 2),
    c("ozge", "ozge_s26", null, 3),
    c("ozgeogx", "ozge_ewa2ogx", "Özge EwA2oGX", 4),
    c("ozgemxp", "ozge_ewa2mxp", "Özge EwA2MXP", 5),
    c("solo", "icy_s26", "ICY S'26", 6),
  ];

  it("puts a project's campaigns in one folder, project campaign first", () => {
    const groups = groupCampaigns(list);
    const ozge = groups.find((g) => g.key === "ozge-s26")!;
    expect(ozge.campaigns.map((x) => [x.id, x.role.title])).toEqual([
      ["ozge", "Project"],
      ["ozgeogx", "EwA2oGX"],
      ["ozgemxp", "EwA2MXP"],
    ]);
    const tts = groups.find((g) => g.key === "toptalentssprint-f26")!;
    expect(tts.title).toBe("TopTalents Sprint F'26");
    expect(tts.campaigns.map((x) => x.id)).toEqual(["tts", "ttsogx"]);
    expect(groups.find((g) => g.key === "icy-s26")!.campaigns).toHaveLength(1);
  });

  it("joins a season-less programme to the latest season of the project", () => {
    const groups = groupCampaigns([
      c("old", "tts_f25", "TTS F'25", 1),
      c("new", "tts_s26", "TTS S'26", 10),
      c("ogx", "tts_ewa2ogx", "TTS EwA2oGX", 11),
    ]);
    expect(groups.find((g) => g.key === "tts-s26")!.campaigns.map((x) => x.id)).toEqual(["new", "ogx"]);
    expect(groups.find((g) => g.key === "tts-f25")!.campaigns.map((x) => x.id)).toEqual(["old"]);
  });

  it("names a folder without a project campaign after the programme campaign", () => {
    const [g] = groupCampaigns([c("x", "abc_ewa2ogx", "Alpha EwA2oGX")]);
    expect(g.title).toBe("Alpha");
  });
});

describe("personKeys", () => {
  it("matches by e-mail or phone", () => {
    expect(personKeys({ email: " A@B.kz ", phone: "+7 (701) 123-45-67" })).toEqual(["e:a@b.kz", "p:7011234567"]);
    expect(personKeys({ email: "nope", phone: "123" })).toEqual([]);
  });
});
