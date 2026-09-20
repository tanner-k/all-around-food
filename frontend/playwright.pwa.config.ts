import { defineConfig } from "@playwright/test";

const port = 3217;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa-*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `/private/tmp/aaf-tooling/node_modules/.bin/pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/app`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
