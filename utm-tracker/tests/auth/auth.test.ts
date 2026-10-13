import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken, OWNER } from "@/lib/session";
import { hashPassword, temporaryPassword, verifyPassword } from "@/lib/password";
import { canEditFolder, isAdmin, type Actor } from "@/lib/permissions";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-123456";
});

const enc = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("session tokens", () => {
  it("carry who signed in", async () => {
    expect(await readSessionToken((await createSessionToken("user123"))!)).toBe("user123");
    expect(await readSessionToken((await createSessionToken())!)).toBe(OWNER);
  });

  it("reject forged or tampered tokens", async () => {
    const t = (await createSessionToken("user123"))!;
    const decoded = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    const forged = enc(decoded.replace("user123", "admin99"));
    expect(await readSessionToken(forged)).toBeNull();
    expect(await readSessionToken("garbage")).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
  });
});

describe("passwords", () => {
  it("hash and verify", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });

  it("makes readable temporary passwords", () => {
    expect(temporaryPassword()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});

describe("permissions", () => {
  const actor = (over: Partial<Actor>): Actor => ({
    id: "u", owner: false, email: "a@b.kz", name: null, position: null, role: "viewer", status: "active", projectKeys: [], ...over,
  });

  it("admins edit everything, managers their folders, viewers nothing", () => {
    expect(canEditFolder(actor({ role: "admin" }), "tts-f26")).toBe(true);
    expect(canEditFolder(actor({ role: "manager", projectKeys: ["tts-f26"] }), "tts-f26")).toBe(true);
    expect(canEditFolder(actor({ role: "manager", projectKeys: ["tts-f26"] }), "ozge-s26")).toBe(false);
    expect(canEditFolder(actor({ role: "viewer", projectKeys: ["tts-f26"] }), "tts-f26")).toBe(false);
  });

  it("pending and disabled accounts can do nothing", () => {
    expect(canEditFolder(actor({ role: "admin", status: "pending" }), "x")).toBe(false);
    expect(isAdmin(actor({ role: "admin", status: "disabled" }))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
