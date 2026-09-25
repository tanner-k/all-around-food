import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const staticRoot = join(root, ".next/static");
const buildId = (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim();
if (!buildId) throw new Error("Next build ID is empty.");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const emitted = (await files(staticRoot)).map((file) =>
  `/_next/static/${relative(staticRoot, file).split(sep).join("/")}`,
);
if (!emitted.some((path) => path.endsWith(".js")) ||
    !emitted.some((path) => path.endsWith(".css")) ||
    !emitted.some((path) => path.endsWith(".woff2"))) {
  throw new Error("Next build is missing expected JavaScript, CSS, or font assets.");
}
const assets = [
  "/app",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
  ...emitted.sort(),
];
await mkdir(join(root, "public/assets"), { recursive: true });
await writeFile(join(root, "public/assets/pwa-precache.js"),
  `self.__PWA_PRECACHE = ${JSON.stringify({ buildId, assets })};\n`);
console.log(`PWA manifest ${buildId}: ${assets.length} required URLs`);
