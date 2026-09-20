import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const port = 3217;
const nextBin = fileURLToPath(new URL("./node_modules/next/dist/bin/next", import.meta.url));
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa-*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `${shellQuote(process.execPath)} ${shellQuote(nextBin)} start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/app`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
