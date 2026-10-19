// Render the site icons from scripts/icon-source.svg:
//   node scripts/render-icons.mjs
// icon.png (tab icon) and apple-icon.png (home-screen icon) live in src/app and
// are served by Next.js; the middleware lets /icon.png and /apple-icon.png through.
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const app = (f) => fileURLToPath(new URL(`../src/app/${f}`, import.meta.url));
const svg = fileURLToPath(new URL("./icon-source.svg", import.meta.url));

await sharp(svg, { density: 384 }).resize(256, 256).png().toFile(app("icon.png"));
await sharp(svg, { density: 384 }).resize(180, 180).flatten({ background: "#0A1F36" }).png().toFile(app("apple-icon.png"));
console.log("icon.png 256×256, apple-icon.png 180×180");
