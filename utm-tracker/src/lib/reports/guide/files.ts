import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The report kit handed to the team on /reports/guide. The files are read at
 * request time; `outputFileTracingIncludes` in next.config.mjs ships them to
 * Vercel with the route.
 */
export const GUIDE_FILES = {
  mainPrompt: "main-prompt.txt",
  skillReference: "skill-reference.txt",
  kit: "report_kit.py",
} as const;

export function readGuideFile(name: (typeof GUIDE_FILES)[keyof typeof GUIDE_FILES]): Promise<string> {
  return readFile(path.join(process.cwd(), "src/lib/reports/guide", name), "utf8");
}
