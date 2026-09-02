import { vi } from 'vitest';

export const prisma = {
  customer: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn()
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn()
  }
};
