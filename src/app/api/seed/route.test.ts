import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// Mock prisma and NextResponse
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    customer: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: vi.fn().mockImplementation((body, init) => {
        return { body, init };
      }),
    },
  };
});

describe('GET /api/seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should seed database successfully when default user exists', async () => {
    // Arrange
    const mockUser = { id: 1, role: 'OWNER' };
    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.customer.deleteMany as any).mockResolvedValue({ count: 0 });
    (prisma.customer.createMany as any).mockResolvedValue({ count: 3 });

    // Act
    const response = await GET();

    // Assert
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { role: 'OWNER' } });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.customer.createMany).toHaveBeenCalled();

    // Check specific shape of createMany call
    const createManyArg = (prisma.customer.createMany as any).mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(3);
    expect(createManyArg.data[0].assignedAgentId).toBe(mockUser.id);
    expect(createManyArg.data[1].assignedAgentId).toBe(mockUser.id);
    expect(createManyArg.data[2].assignedAgentId).toBe(mockUser.id);

    expect(response).toEqual({ body: { message: 'Database seeded successfully!' }, init: undefined });
  });

  it('should create default user and seed database when user does not exist', async () => {
    // Arrange
    const newMockUser = { id: 2, role: 'OWNER' };
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue(newMockUser);
    (prisma.customer.deleteMany as any).mockResolvedValue({ count: 0 });
    (prisma.customer.createMany as any).mockResolvedValue({ count: 3 });

    // Act
    const response = await GET();

    // Assert
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { role: 'OWNER' } });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'مدیر سیستم',
        phone: '09123456789',
        passwordHash: 'temp_hash',
        role: 'OWNER',
      },
    });
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.customer.createMany).toHaveBeenCalled();

    const createManyArg = (prisma.customer.createMany as any).mock.calls[0][0];
    expect(createManyArg.data[0].assignedAgentId).toBe(newMockUser.id);

    expect(response).toEqual({ body: { message: 'Database seeded successfully!' }, init: undefined });
  });

  it('should handle errors and return 500 status', async () => {
    // Arrange
    const error = new Error('Database connection failed');
    (prisma.user.findFirst as any).mockRejectedValue(error);

    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    const response = await GET();

    // Assert
    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(response).toEqual({
      body: { error: 'Failed to seed database' },
      init: { status: 500 },
    });

    consoleSpy.mockRestore();
  });
});
