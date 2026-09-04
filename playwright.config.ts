import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      // Let AudioContext start without a user gesture and use a fake audio sink.
      args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
