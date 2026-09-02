import { describe, it, expect } from 'vitest';
import { createCustomerSchema } from '../src/app/api/customers/route';

describe('createCustomerSchema', () => {
  it('Valid customer creation (Happy Path)', () => {
    const validData = {
      name: 'John Doe',
      phone: '09123456789',
      type: 'BUYER',
      stage: 'NEW',
      nextFollowUpAt: new Date().toISOString()
    };
    const result = createCustomerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('Missing mandatory fields', () => {
    const missingData = {};
    const result = createCustomerSchema.safeParse(missingData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors).toHaveProperty('name');
      expect(errors).toHaveProperty('phone');
      expect(errors).toHaveProperty('type');
    }
  });

  it('Empty name', () => {
    const data = {
      name: '',
      phone: '09123456789',
      type: 'BUYER',
      nextFollowUpAt: new Date().toISOString()
    };
    const result = createCustomerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('Invalid phone length', () => {
    const data = {
      name: 'John Doe',
      phone: '123', // too short
      type: 'BUYER',
      nextFollowUpAt: new Date().toISOString()
    };
    const result = createCustomerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('Invalid type (enum)', () => {
    const data = {
      name: 'John Doe',
      phone: '09123456789',
      type: 'INVALID_TYPE',
      nextFollowUpAt: new Date().toISOString()
    };
    const result = createCustomerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  describe('MVP Rule 1 (LOST stage)', () => {
    it('Invalid: Setting stage to LOST without a lostReasonCategory', () => {
      const data = {
        name: 'John Doe',
        phone: '09123456789',
        type: 'BUYER',
        stage: 'LOST'
      };
      const result = createCustomerSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors).toHaveProperty('lostReasonCategory');
      }
    });

    it('Valid: Setting stage to LOST with a lostReasonCategory', () => {
      const data = {
        name: 'John Doe',
        phone: '09123456789',
        type: 'BUYER',
        stage: 'LOST',
        lostReasonCategory: 'PRICE_REJECTED'
      };
      const result = createCustomerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('MVP Rule 2 (nextFollowUpAt)', () => {
    it('Invalid: Setting stage to a non-LOST value without a nextFollowUpAt', () => {
      const data = {
        name: 'John Doe',
        phone: '09123456789',
        type: 'BUYER',
        stage: 'NEW'
      };
      const result = createCustomerSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        expect(errors).toHaveProperty('nextFollowUpAt');
      }
    });

    it('Valid: Setting stage to a non-LOST value with a nextFollowUpAt', () => {
      const data = {
        name: 'John Doe',
        phone: '09123456789',
        type: 'BUYER',
        stage: 'NEW',
        nextFollowUpAt: new Date().toISOString()
      };
      const result = createCustomerSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
