import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt from Node's crypto: no native dependency, slow enough to make guessing expensive.
const KEYLEN = 64;
const COST = 16384;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: COST, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$<salt>$<hash>", both base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await derive(password, salt)).toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [algo, saltB64, hashB64] = (stored ?? "").split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A readable one-time password for resets, e.g. "kq7m-3vtx-p9ha". */
export function temporaryPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => abc[b % abc.length]);
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join("")).join("-");
}
