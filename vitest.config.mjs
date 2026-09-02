import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/lib/__mocks__/prisma.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
