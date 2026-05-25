import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const generated = path.join(root, "public", "generated");
const posters = ["carousel-poster-1", "carousel-poster-2", "carousel-poster-3"];

for (const name of posters) {
  const svgPath = path.join(generated, `${name}.svg`);
  const pngPath = path.join(generated, `${name}.png`);
  const svg = await readFile(svgPath);
  await sharp(svg, { density: 192 })
    .resize(1600, 900, { fit: "cover" })
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(pngPath);
  await rm(svgPath);
}
