import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const txDir = path.join(root, "public", "tx");
const fmDir = path.join(root, "public", "fm");

const assets = [
  {
    name: "violet-witch-princess",
    src: "C:/Users/user/.codex/generated_images/019e488c-91c3-7821-9c2f-6644ee7a3cde/ig_0a592c6ccecc2467016a0f143b9ef48191814bfb1a521ffe2e.png",
    avatarPosition: "left"
  },
  {
    name: "blonde-lightning-swordswoman",
    src: "C:/Users/user/.codex/generated_images/019e488c-91c3-7821-9c2f-6644ee7a3cde/ig_0a592c6ccecc2467016a0f13dd6a948191be6a67712907e575.png",
    avatarPosition: "left"
  },
  {
    name: "black-shrine-exorcist",
    src: "C:/Users/user/.codex/generated_images/019e488c-91c3-7821-9c2f-6644ee7a3cde/ig_0a592c6ccecc2467016a0f138837c88191b64f665b545cff00.png",
    avatarPosition: "left"
  }
];

await fs.mkdir(txDir, { recursive: true });
await fs.mkdir(fmDir, { recursive: true });

for (const [index, item] of assets.entries()) {
  const n = String(index + 1).padStart(2, "0");
  const image = sharp(item.src);
  const meta = await image.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const side = Math.min(width, height);
  const left = item.avatarPosition === "left" ? 0 : Math.max(0, Math.floor((width - side) / 2));
  const top = Math.max(0, Math.floor((height - side) / 2));

  await sharp(item.src)
    .resize(1280, 720, { fit: "cover", position: "attention" })
    .jpeg({ quality: 94, mozjpeg: true })
    .toFile(path.join(fmDir, `anime-cover-${n}-${item.name}.jpg`));

  await sharp(item.src)
    .extract({ left, top, width: side, height: side })
    .resize(512, 512, { fit: "cover", position: "attention" })
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(path.join(txDir, `anime-avatar-${n}-${item.name}.png`));
}

console.log(`installed ${assets.length} generated covers and ${assets.length} generated avatars`);
