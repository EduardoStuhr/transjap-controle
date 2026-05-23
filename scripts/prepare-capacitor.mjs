import { copyFile, cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const mobileDir = path.join(root, "mobile");
const publicDir = path.join(root, "public");

await mkdir(distDir, { recursive: true });

await copyFile(path.join(mobileDir, "index.html"), path.join(distDir, "index.html"));
await copyFile(path.join(mobileDir, "offline.html"), path.join(distDir, "offline.html"));

const assets = [
  "app-icon-foreground.png",
  "logoapp.png",
  "logo.png",
  "logotransjap.png",
  "apple-touch-icon.png",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "app-store-icon.png",
  "manifest.webmanifest",
  "sw.js",
];

for (const asset of assets) {
  const source = path.join(publicDir, asset);
  if (existsSync(source)) {
    await copyFile(source, path.join(distDir, asset));
  }
}

const clientAssets = path.join(distDir, "client", "assets");
if (existsSync(clientAssets)) {
  await cp(clientAssets, path.join(distDir, "assets"), { recursive: true });
}

console.log("Capacitor web assets prepared in dist/.");
