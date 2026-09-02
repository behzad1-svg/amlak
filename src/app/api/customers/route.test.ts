import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { CustomerType, CustomerPipelineStage, CustomerTemperature } from '@prisma/client';
import { NextResponse } from 'next/server';

// Mock the prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Customers API - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 with validation error when invalid data is provided', async () => {
    // Missing required 'name' and 'phone' fields
    const invalidData = {
      type: CustomerType.BUYER,
    };

    const request = new Request('http://localhost:3000/api/customers', {
      method: 'POST',
      body: JSON.stringify(invalidData),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('خطای اعتبارسنجی');
    expect(data.details).toBeDefined();
    // Verify it didn't call prisma
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('should return 500 when an internal server error occurs (e.g. Prisma connection failure)', async () => {
    // Valid data that passes validation
    const validData = {
      name: 'Test User',
      phone: '09123456789',
      type: CustomerType.BUYER,
      stage: CustomerPipelineStage.NEW,
      temperature: CustomerTemperature.WARM,
      nextFollowUpAt: new Date().toISOString(),
    };

    const request = new Request('http://localhost:3000/api/customers', {
      method: 'POST',
      body: JSON.stringify(validData),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Mock prisma to throw an error
    vi.mocked(prisma.customer.findFirst).mockRejectedValue(new Error('Database connection failed'));

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('خطای داخلی سرور');
  });
});
