import { defineConfig, devices } from "@playwright/test";

const appPort = 3100;
const mockBackendPort = 4317;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `node e2e/mock-pricing-server.mjs ${mockBackendPort}`,
      url: `http://127.0.0.1:${mockBackendPort}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `BACKEND_URL=http://127.0.0.1:${mockBackendPort} pnpm dev --hostname 127.0.0.1 --port ${appPort}`,
      url: `http://127.0.0.1:${appPort}/prices`,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
