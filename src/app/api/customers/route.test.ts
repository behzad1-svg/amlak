import { GET } from './route';
import { prisma } from '@/lib/__mocks__/prisma';
import { CustomerPipelineStage, CustomerTemperature, CustomerType } from '@prisma/client';

describe('GET /api/customers', () => {
  it('should return a list of customers successfully (happy path)', async () => {
    // Arrange
    const mockCustomers = [
      {
        id: 'c1',
        name: 'Test Customer 1',
        phone: '09123456789',
        type: CustomerType.BUYER,
        stage: CustomerPipelineStage.NEW,
        temperature: CustomerTemperature.WARM,
        assignedAgentId: 'agent1',
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        updatedAt: new Date('2023-01-01T00:00:00.000Z'),
        deletedAt: null,
        source: null,
        preferredType: null,
        preferredDealType: null,
        preferredArea: null,
        preferredBeds: null,
        preferredSizeMin: null,
        preferredSizeMax: null,
        budgetMin: null,
        budgetMax: null,
        nextFollowUpAt: null,
        lostReasonCategory: null,
        lostReasonDetail: null,
        notes: null,
        needsManagerReview: false,
        managerReviewReason: null,
        managerReviewRequestedAt: null,
        lostAt: null,
      },
    ];

    prisma.customer.findMany.mockResolvedValue(mockCustomers as any);

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(data).toEqual(JSON.parse(JSON.stringify(mockCustomers))); // Next.js returns JSON-serialized data
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
  });

  it('should handle database errors gracefully (error path)', async () => {
    // Arrange
    prisma.customer.findMany.mockRejectedValue(new Error('Database error'));

    // Act
    const response = await GET();
    const data = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'خطای داخلی سرور' });
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
  });
});
