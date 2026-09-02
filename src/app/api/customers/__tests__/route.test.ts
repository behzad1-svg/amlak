import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { CustomerPipelineStage, CustomerTemperature, CustomerType } from '@prisma/client';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    customer: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('POST /api/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = {
    name: 'John Doe',
    phone: '09123456789',
    type: CustomerType.BUYER,
    stage: CustomerPipelineStage.NEW,
    temperature: CustomerTemperature.WARM,
    nextFollowUpAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  };

  function createMockRequest(body: any): Request {
    return new Request('http://localhost/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('should return 400 if phone already exists', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-id' });

    const request = createMockRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('این شماره تلفن قبلاً ثبت شده است');
  });

  it('should successfully create a new customer', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'agent-1' });
    (prisma.customer.create as jest.Mock).mockResolvedValue({ id: 'new-cust-id', ...validPayload });

    const request = createMockRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe('new-cust-id');
    expect(prisma.customer.create).toHaveBeenCalled();
  });

  it('should return 400 for validation errors (missing name)', async () => {
    const invalidPayload = { ...validPayload, name: '' };

    const request = createMockRequest(invalidPayload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('خطای اعتبارسنجی');
  });
});
