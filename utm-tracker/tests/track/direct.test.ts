import { describe, expect, it } from "vitest";
import { campaignForPage, knownHost, pageKey, pathUnder } from "@/lib/directLeads";

const links = [
  { destinationUrl: "https://aiesecinkz.tilda.ws/toptalentssprint", campaign: "toptalentssprint_f26" },
  { destinationUrl: "https://aiesecinkz.tilda.ws/toptalentssprint/", campaign: "toptalentssprint_f26" },
  { destinationUrl: "https://aiesecinkz.tilda.ws/icy?utm_source=x", campaign: "icy_s26" },
  { destinationUrl: "https://aieseckz.tilda.ws/apply", campaign: "tts_ewa2ogx" },
  { destinationUrl: "https://aieseckz.tilda.ws/apply", campaign: "ozge_ewa2ogx" },
];

describe("direct registrations: which campaign", () => {
  it("normalises pages", () => {
    expect(pageKey("https://WWW.Site.kz/A/b/?x=1#f")).toEqual({ host: "site.kz", path: "/a/b" });
    expect(pageKey("javascript:alert(1)")).toBeNull();
    expect(pathUnder("/a/b", "/a")).toBe(true);
    expect(pathUnder("/ab", "/a")).toBe(false);
  });

  it("takes the campaign whose links lead to the page", () => {
    expect(campaignForPage("https://aiesecinkz.tilda.ws/toptalentssprint?ref=1", links)).toBe("toptalentssprint_f26");
    expect(campaignForPage("https://aiesecinkz.tilda.ws/toptalentssprint/register", links)).toBe("toptalentssprint_f26");
    expect(campaignForPage("https://aiesecinkz.tilda.ws/icy", links)).toBe("icy_s26");
  });

  it("gives none when several projects share the page, or no link leads there", () => {
    expect(campaignForPage("https://aieseckz.tilda.ws/apply", links)).toBeNull();
    expect(campaignForPage("https://aiesecinkz.tilda.ws/other", links)).toBeNull();
  });

  it("accepts only the team's sites", () => {
    expect(knownHost("https://aiesecinkz.tilda.ws/anything", links)).toBe(true);
    expect(knownHost("https://spam.example/form", links)).toBe(false);
  });
});
