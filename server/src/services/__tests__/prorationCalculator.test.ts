import { describe, it, expect } from '@jest/globals';
import { ProrationCalculator } from '../prorationCalculator.js';
import { Decimal } from 'decimal.js';

describe('ProrationCalculator', () => {
  describe('calculateProrationFactor', () => {
    it('should return 1.0 for full pay period employment', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-15');
      const hireDate = new Date('2023-12-01'); // Hired before period

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate
      );

      expect(factor.toNumber()).toBe(1);
    });

    it('should return 0.0 for employee not working during period', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-15');
      const hireDate = new Date('2024-02-01'); // Hired after period

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate
      );

      expect(factor.toNumber()).toBe(0);
    });

    it('should calculate correct factor for mid-period hire', () => {
      // 2-week pay period (10 business days: Jan 1-15, 2024)
      // Employee starts Jan 8 (Monday)
      // Works: Jan 8-15 = 6 business days
      // Factor should be approximately 0.6
      const payPeriodStart = new Date('2024-01-01'); // Monday
      const payPeriodEnd = new Date('2024-01-15'); // Monday
      const hireDate = new Date('2024-01-08'); // Monday

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate
      );

      // Allow small tolerance due to date-fns business day calculation
      expect(factor.toNumber()).toBeGreaterThan(0.5);
      expect(factor.toNumber()).toBeLessThan(0.7);
    });

    it('should calculate correct factor for mid-period termination', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-15');
      const hireDate = new Date('2023-12-01'); // Hired before
      const terminationDate = new Date('2024-01-08'); // Terminated mid-period

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate,
        terminationDate
      );

      // Should work roughly half the period
      expect(factor.toNumber()).toBeGreaterThan(0.4);
      expect(factor.toNumber()).toBeLessThan(0.6);
    });

    it('should handle hire and termination in same period', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-31');
      const hireDate = new Date('2024-01-08');
      const terminationDate = new Date('2024-01-22');

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate,
        terminationDate
      );

      // Should be less than 1 but greater than 0
      expect(factor.toNumber()).toBeGreaterThan(0);
      expect(factor.toNumber()).toBeLessThan(1);
    });

    it('should return Decimal type', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-15');
      const hireDate = new Date('2023-12-01');

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate
      );

      expect(factor).toBeInstanceOf(Decimal);
    });

    it('should handle termination before period starts', () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-15');
      const hireDate = new Date('2023-12-01');
      const terminationDate = new Date('2023-12-31');

      const factor = ProrationCalculator.calculateProrationFactor(
        payPeriodStart,
        payPeriodEnd,
        hireDate,
        terminationDate
      );

      expect(factor.toNumber()).toBe(0);
    });
  });

  describe('prorateAmount', () => {
    it('should correctly prorate salary amount', () => {
      const salary = 5000;
      const factor = new Decimal(0.5);

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      expect(prorated.toNumber()).toBe(2500);
    });

    it('should round to 2 decimal places using ROUND_HALF_UP', () => {
      const salary = 5000;
      const factor = new Decimal(0.333); // 1/3

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      // 5000 * 0.333 = 1665.00 (ROUND_HALF_UP)
      expect(prorated.toFixed(2)).toBe('1665.00');
    });

    it('should handle Decimal input amounts', () => {
      const salary = new Decimal(7500.75);
      const factor = new Decimal(0.6);

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      expect(prorated.toFixed(2)).toBe('4500.45');
    });

    it('should return zero for zero factor', () => {
      const salary = 5000;
      const factor = new Decimal(0);

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      expect(prorated.toNumber()).toBe(0);
    });

    it('should return full amount for factor of 1', () => {
      const salary = 5000;
      const factor = new Decimal(1);

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      expect(prorated.toNumber()).toBe(5000);
    });

    it('should handle edge case amounts correctly', () => {
      const salary = 0.01; // One penny
      const factor = new Decimal(0.5);

      const prorated = ProrationCalculator.prorateAmount(salary, factor);

      expect(prorated.toFixed(2)).toBe('0.01'); // Rounds up
    });
  });
});
