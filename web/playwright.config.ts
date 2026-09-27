/**
 * End-to-end tests against the local dev server and the hosted Supabase project. Every test
 * signs in as its own throwaway user and deletes it afterwards, so real data is never read
 * or touched. Uses the installed Chrome rather than a downloaded browser.
 */
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
