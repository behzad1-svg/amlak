import { PrismaClient, Customer, Property } from '@prisma/client';

const prisma = new PrismaClient();

// Configurable weights as per spec
const MATCHING_CONFIG = {
  WEIGHT_BUDGET: 0.6,
  WEIGHT_SIZE: 0.4,
  MATCH_THRESHOLD: 70, // %
  BUDGET_FLEXIBILITY: 1.1, // Up to 10% higher than max budget gives partial score
};

/**
 * Creates notification for a match if the score is above threshold.
 */
async function createMatchNotification(
  userId: string,
  message: string,
  relatedType: string,
  relatedId: string
) {
  await prisma.notification.create({
    data: {
      userId,
      type: 'MATCH_SUGGESTION',
      priority: 'HIGH',
      message,
      relatedType,
      relatedId,
    },
  });
}

/**
 * Evaluates match score between a Customer and a Property.
 * Returns null if Hard Filters fail.
 * Returns score 0-100 if Hard Filters pass.
 */
export function evaluateMatch(customer: Customer, property: Property): { score: number; reason: string } | null {
  // Hard Filter: Deal Type
  if (customer.preferredDealType && customer.preferredDealType !== property.dealType) {
    return null;
  }

  // Hard Filter: Property Type
  if (customer.preferredType && customer.preferredType !== property.type) {
    return null;
  }

  // Hard Filter: Region (Exact match)
  if (customer.preferredArea && customer.preferredArea !== property.region) {
    return null;
  }

  let budgetScore = 0;
  let sizeScore = 0;
  let budgetChecked = false;
  let sizeChecked = false;

  // Soft Score: Budget
  if (customer.budgetMax !== null) {
    budgetChecked = true;
    const maxBudget = Number(customer.budgetMax); // Using Number assuming it fits within safe JS ints for percentage calc, or we can use BigInt math.

    let propertyPrice = 0;
    if (property.dealType === 'SALE' && property.salePriceToman !== null) {
      propertyPrice = Number(property.salePriceToman);
    } else if (property.dealType === 'RENT' && property.depositToman !== null) {
      // Simplified approach: just looking at deposit for now or combining them.
      // Spec says: "For rent: custom market conversion (e.g. total mortgage)".
      // Let's assume deposit is the main check or we use deposit + rent * 30.
      propertyPrice = Number(property.depositToman) + Number(property.monthlyRentToman || BigInt(0)) * 30; // standard conversion
    }

    if (propertyPrice <= maxBudget) {
      budgetScore = 100;
    } else if (propertyPrice <= maxBudget * MATCHING_CONFIG.BUDGET_FLEXIBILITY) {
      budgetScore = 70;
    } else {
      return null; // Budget is a hard reject if > 10%
    }
  } else {
    budgetScore = 100; // If no budget specified, full score
  }

  // Soft Score: Size
  if (customer.preferredSizeMin !== null || customer.preferredSizeMax !== null) {
    sizeChecked = true;
    const pSize = property.sizeSqm || 0;
    const minSize = customer.preferredSizeMin || 0;
    const maxSize = customer.preferredSizeMax || Infinity;

    if (pSize >= minSize && pSize <= maxSize) {
      sizeScore = 100;
    } else {
      // Partial score logic: just a simple proximity
      const diff = pSize < minSize ? minSize - pSize : pSize - maxSize;
      if (diff <= 20) {
        sizeScore = 70; // within 20 sqm
      } else {
        sizeScore = 30; // further
      }
    }
  } else {
    sizeScore = 100;
  }

  const finalScore = Math.round(
    budgetScore * MATCHING_CONFIG.WEIGHT_BUDGET + sizeScore * MATCHING_CONFIG.WEIGHT_SIZE
  );

  const reason = `${finalScore}% — بودجه ${budgetChecked && budgetScore >= 70 ? '✓' : '؟'} — متراژ ${sizeChecked && sizeScore >= 70 ? '✓' : '؟'} — منطقه ✓`;

  return { score: finalScore, reason };
}

/**
 * Run matching for a newly created or updated Property against all Customers.
 */
export async function matchPropertyToCustomers(property: Property) {
  // Find all active customers looking for something similar
  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      stage: {
        not: 'LOST' // don't match for lost customers
      },
      OR: [
        { preferredDealType: property.dealType },
        { preferredDealType: null }
      ]
    },
    include: {
      assignedAgent: true
    }
  });

  for (const customer of customers) {
    const match = evaluateMatch(customer, property);
    if (match && match.score >= MATCHING_CONFIG.MATCH_THRESHOLD) {
      // Notify Customer's Agent
      await createMatchNotification(
        customer.assignedAgentId,
        `یک فایل جدید (مشاور: ${property.listedById}) با نیازهای مشتری شما (${customer.name}) همخوانی دارد: ${match.reason}`,
        'PROPERTY',
        property.id
      );

      // Notify Property's Agent
      if (property.listedById !== customer.assignedAgentId) {
         await createMatchNotification(
           property.listedById,
           `فایل شما با مشتری مشاور دیگری (${customer.assignedAgent.name}) همخوانی دارد: ${match.reason}`,
           'CUSTOMER',
           customer.id
         );
      }
    }
  }
}

/**
 * Run matching for a newly created or updated Customer against all Properties.
 */
export async function matchCustomerToProperties(customer: Customer) {
  const properties = await prisma.property.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { dealType: customer.preferredDealType || undefined }, // Handles null properly via prisma undefined ignore
      ]
    },
    include: {
      listedBy: true
    }
  });

  for (const property of properties) {
    const match = evaluateMatch(customer, property);
    if (match && match.score >= MATCHING_CONFIG.MATCH_THRESHOLD) {
      // Notify Customer's Agent
      await createMatchNotification(
        customer.assignedAgentId,
        `مشتری شما با فایل مشاور (${property.listedBy.name}) همخوانی دارد: ${match.reason}`,
        'PROPERTY',
        property.id
      );

      // Notify Property's Agent
      if (property.listedById !== customer.assignedAgentId) {
         await createMatchNotification(
           property.listedById,
           `فایل شما با مشتری مشاور دیگری (${customer.assignedAgentId}) همخوانی دارد: ${match.reason}`,
           'CUSTOMER',
           customer.id
         );
      }
    }
  }
}
