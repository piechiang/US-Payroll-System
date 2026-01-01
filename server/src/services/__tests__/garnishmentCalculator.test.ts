import { describe, it, expect } from '@jest/globals';
import { GarnishmentCalculator } from '../garnishmentCalculator.js';
import { Decimal } from 'decimal.js';
import { Garnishment } from '@prisma/client';

describe('GarnishmentCalculator', () => {
  // Mock garnishment helper
  const createMockGarnishment = (overrides: Partial<Garnishment>): Garnishment => ({
    id: 'test-id',
    employeeId: 'emp-id',
    description: 'Test Garnishment',
    type: 'CREDITOR_GARNISHMENT',
    amount: new Decimal(0),
    percent: null,
    totalOwed: null,
    totalPaid: new Decimal(0),
    active: true,
    priority: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  describe('calculateDeductions', () => {
    it('should enforce federal 25% limit', () => {
      const disposableEarnings = new Decimal(2000); // $2000
      const garnishments = [
        createMockGarnishment({
          amount: new Decimal(1000), // Requesting $1000 (50%)
          priority: 1
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // Should be capped at 25% = $500
      expect(result.totalDeduction.toNumber()).toBe(500);
      expect(result.details.length).toBe(1);
      expect(result.details[0].amount).toBe(500);
    });

    it('should handle multiple garnishments with priority', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          id: 'g1',
          amount: new Decimal(300),
          priority: 1, // Higher priority
          type: 'CHILD_SUPPORT'
        }),
        createMockGarnishment({
          id: 'g2',
          amount: new Decimal(400),
          priority: 2, // Lower priority
          type: 'CREDITOR_GARNISHMENT'
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // Total federal limit: $500
      // Priority 1 takes $300, leaving $200 for priority 2
      expect(result.totalDeduction.toNumber()).toBe(500);
      expect(result.details.length).toBe(2);
      expect(result.details[0].garnishmentId).toBe('g1');
      expect(result.details[0].amount).toBe(300);
      expect(result.details[1].garnishmentId).toBe('g2');
      expect(result.details[1].amount).toBe(200); // Capped by remaining limit
    });

    it('should handle percentage-based garnishments', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          amount: new Decimal(0),
          percent: new Decimal(15), // 15% of disposable
          priority: 1
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // 15% of $2000 = $300, within 25% limit
      expect(result.totalDeduction.toNumber()).toBe(300);
    });

    it('should respect totalOwed balance', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          amount: new Decimal(500),
          totalOwed: new Decimal(1000),
          totalPaid: new Decimal(900), // Only $100 remaining
          priority: 1
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // Should only deduct remaining $100
      expect(result.totalDeduction.toNumber()).toBe(100);
      expect(result.details[0].amount).toBe(100);
    });

    it('should skip garnishments with fully paid balance', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          id: 'g1',
          amount: new Decimal(300),
          totalOwed: new Decimal(1000),
          totalPaid: new Decimal(1000), // Fully paid
          priority: 1
        }),
        createMockGarnishment({
          id: 'g2',
          amount: new Decimal(200),
          priority: 2
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // Should only process g2
      expect(result.details.length).toBe(1);
      expect(result.details[0].garnishmentId).toBe('g2');
      expect(result.totalDeduction.toNumber()).toBe(200);
    });

    it('should skip inactive garnishments', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          id: 'g1',
          amount: new Decimal(300),
          active: false
        }),
        createMockGarnishment({
          id: 'g2',
          amount: new Decimal(200),
          active: true
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      expect(result.details.length).toBe(1);
      expect(result.details[0].garnishmentId).toBe('g2');
    });

    it('should handle no garnishments', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments: Garnishment[] = [];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      expect(result.totalDeduction.toNumber()).toBe(0);
      expect(result.details.length).toBe(0);
    });

    it('should handle zero disposable earnings', () => {
      const disposableEarnings = new Decimal(0);
      const garnishments = [
        createMockGarnishment({
          amount: new Decimal(300)
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      expect(result.totalDeduction.toNumber()).toBe(0);
    });

    it('should correctly sort by priority', () => {
      const disposableEarnings = new Decimal(2000);
      const garnishments = [
        createMockGarnishment({
          id: 'g1',
          amount: new Decimal(200),
          priority: 3
        }),
        createMockGarnishment({
          id: 'g2',
          amount: new Decimal(200),
          priority: 1
        }),
        createMockGarnishment({
          id: 'g3',
          amount: new Decimal(200),
          priority: 2
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // All should be processed in priority order: g2, g3, g1
      expect(result.details[0].garnishmentId).toBe('g2');
      expect(result.details[1].garnishmentId).toBe('g3');
      // g1 should not be processed as limit is reached ($500 limit, $400 used)
      expect(result.details.length).toBe(2);
    });

    it('should handle complex multi-garnishment scenario', () => {
      const disposableEarnings = new Decimal(3000); // Federal limit = $750

      const garnishments = [
        createMockGarnishment({
          id: 'child-support',
          type: 'CHILD_SUPPORT',
          amount: new Decimal(400),
          priority: 1
        }),
        createMockGarnishment({
          id: 'tax-levy',
          type: 'TAX_LEVY',
          percent: new Decimal(10), // 10% = $300
          priority: 2
        }),
        createMockGarnishment({
          id: 'creditor',
          type: 'CREDITOR_GARNISHMENT',
          amount: new Decimal(500),
          priority: 3
        })
      ];

      const result = GarnishmentCalculator.calculateDeductions(
        disposableEarnings,
        garnishments
      );

      // Total limit: $750
      // Child support: $400
      // Tax levy: $300
      // Creditor: $50 (remaining from $750 limit)
      expect(result.totalDeduction.toNumber()).toBe(750);
      expect(result.details[0].amount).toBe(400);
      expect(result.details[1].amount).toBe(300);
      expect(result.details[2].amount).toBe(50);
    });
  });
});
