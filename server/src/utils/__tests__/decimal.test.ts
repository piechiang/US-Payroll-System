/**
 * Decimal.js Utility Tests
 *
 * These tests verify that our decimal utility functions provide penny-perfect precision
 * and prevent floating-point rounding errors.
 */

import { describe, it, expect } from '@jest/globals';
import {
  decimal,
  toNumber,
  add,
  subtract,
  multiply,
  divide,
  percentOf,
  min,
  max,
  nonNegative,
  assertPrecision
} from '../decimal';

describe('Decimal Utility Functions', () => {
  describe('decimal()', () => {
    it('should create decimal from number', () => {
      const d = decimal(10.5);
      expect(toNumber(d)).toBe(10.5);
    });

    it('should create decimal from string', () => {
      const d = decimal('10.50');
      expect(toNumber(d)).toBe(10.5);
    });

    it('should round to 2 decimal places', () => {
      const d = decimal('10.556');
      expect(toNumber(d)).toBe(10.56);
    });

    it('should handle very small numbers', () => {
      const d = decimal('0.001');
      expect(toNumber(d)).toBe(0);
    });
  });

  describe('add()', () => {
    it('should add numbers with precision', () => {
      // Classic floating-point error: 0.1 + 0.2 = 0.30000000000000004
      const result = add(0.1, 0.2);
      expect(toNumber(result)).toBe(0.3);
    });

    it('should add multiple values', () => {
      const result = add(10.50, 20.30, 5.10);
      expect(toNumber(result)).toBe(35.90);
    });

    it('should add 100 pennies to equal 1 dollar', () => {
      // Critical test: accumulation of small values
      let sum = decimal(0);
      for (let i = 0; i < 100; i++) {
        sum = add(sum, 0.01);
      }
      expect(toNumber(sum)).toBe(1.00);
    });

    it('should maintain precision over 26 pay periods', () => {
      // Simulate annual salary divided into 26 biweekly paychecks
      const annualSalary = 52000;
      const biweeklyPay = divide(annualSalary, 26); // 2000.00

      let total = decimal(0);
      for (let i = 0; i < 26; i++) {
        total = add(total, biweeklyPay);
      }

      expect(toNumber(total)).toBe(52000.00);
    });
  });

  describe('subtract()', () => {
    it('should subtract with precision', () => {
      const result = subtract(100, 10.5, 5.3);
      expect(toNumber(result)).toBe(84.20);
    });

    it('should handle negative results', () => {
      const result = subtract(10, 20);
      expect(toNumber(result)).toBe(-10.00);
    });
  });

  describe('multiply()', () => {
    it('should multiply with precision', () => {
      const result = multiply(10.5, 1.5);
      expect(toNumber(result)).toBe(15.75);
    });

    it('should calculate overtime pay correctly', () => {
      // Hourly rate $25.50, overtime multiplier 1.5
      const hourlyRate = 25.50;
      const overtimeMultiplier = 1.5;
      const overtimeRate = multiply(hourlyRate, overtimeMultiplier);

      expect(toNumber(overtimeRate)).toBe(38.25);
    });

    it('should calculate tips correctly', () => {
      // Bill $123.45, tip 18%
      const bill = 123.45;
      const tipPercent = 0.18;
      const tip = multiply(bill, tipPercent);

      expect(toNumber(tip)).toBe(22.22);
    });
  });

  describe('divide()', () => {
    it('should divide with precision', () => {
      const result = divide(100, 3);
      expect(toNumber(result)).toBe(33.33);
    });

    it('should calculate per-period amounts correctly', () => {
      // Annual salary $52,000, 26 pay periods
      const annualSalary = 52000;
      const payPeriodsPerYear = 26;
      const biweeklyPay = divide(annualSalary, payPeriodsPerYear);

      expect(toNumber(biweeklyPay)).toBe(2000.00);
    });

    it('should handle division by zero gracefully', () => {
      expect(() => divide(100, 0)).toThrow();
    });
  });

  describe('percentOf()', () => {
    it('should calculate Social Security tax (6.2%)', () => {
      const grossPay = 2000;
      const ssRate = 6.2;
      const ssTax = percentOf(grossPay, ssRate);

      expect(toNumber(ssTax)).toBe(124.00);
    });

    it('should calculate Medicare tax (1.45%)', () => {
      const grossPay = 2000;
      const medicareRate = 1.45;
      const medicareTax = percentOf(grossPay, medicareRate);

      expect(toNumber(medicareTax)).toBe(29.00);
    });

    it('should calculate 401k contribution (5% of $2000)', () => {
      const grossPay = 2000;
      const contributionRate = 5;
      const contribution = percentOf(grossPay, contributionRate);

      expect(toNumber(contribution)).toBe(100.00);
    });
  });

  describe('min() and max()', () => {
    it('should find minimum value', () => {
      const result = min(10.50, 5.25, 20.00);
      expect(toNumber(result)).toBe(5.25);
    });

    it('should find maximum value', () => {
      const result = max(10.50, 5.25, 20.00);
      expect(toNumber(result)).toBe(20.00);
    });

    it('should calculate SS tax with wage cap', () => {
      // If YTD is $167,000 and current pay is $3,000, only $1,600 is taxable
      const wageCap = 168600;
      const ytdWages = 167000;
      const currentPay = 3000;

      const remainingWages = subtract(wageCap, ytdWages); // 1600
      const taxableWages = min(currentPay, remainingWages); // 1600

      expect(toNumber(taxableWages)).toBe(1600.00);

      const ssTax = percentOf(taxableWages, 6.2);
      expect(toNumber(ssTax)).toBe(99.20);
    });
  });

  describe('nonNegative()', () => {
    it('should return positive value unchanged', () => {
      const result = nonNegative(10.50);
      expect(toNumber(result)).toBe(10.50);
    });

    it('should convert negative to zero', () => {
      const result = nonNegative(-10.50);
      expect(toNumber(result)).toBe(0.00);
    });

    it('should handle taxable wages calculation', () => {
      // Gross pay $1000, deductions $1200 -> taxable wages = 0
      const grossPay = 1000;
      const deductions = 1200;
      const taxableWages = nonNegative(subtract(grossPay, deductions));

      expect(toNumber(taxableWages)).toBe(0.00);
    });
  });

  describe('assertPrecision()', () => {
    it('should pass for correct precision', () => {
      const value = decimal(123.45);
      expect(() => assertPrecision(value, 12345)).not.toThrow();
    });

    it('should throw for incorrect precision', () => {
      const value = decimal(123.45);
      expect(() => assertPrecision(value, 12346)).toThrow();
    });
  });

  describe('Real-world payroll scenarios', () => {
    it('should calculate net pay correctly', () => {
      const grossPay = 2000.00;
      const federalTax = 240.00;
      const ssTax = 124.00;
      const medicareTax = 29.00;
      const stateTax = 100.00;
      const retirement401k = 100.00;

      const totalDeductions = add(federalTax, ssTax, medicareTax, stateTax, retirement401k);
      const netPay = subtract(grossPay, totalDeductions);

      expect(toNumber(totalDeductions)).toBe(593.00);
      expect(toNumber(netPay)).toBe(1407.00);
    });

    it('should handle hourly pay with overtime', () => {
      const hourlyRate = 25.50;
      const regularHours = 40;
      const overtimeHours = 10;
      const overtimeMultiplier = 1.5;

      const regularPay = multiply(hourlyRate, regularHours);
      const overtimeRate = multiply(hourlyRate, overtimeMultiplier);
      const overtimePay = multiply(overtimeRate, overtimeHours);
      const grossPay = add(regularPay, overtimePay);

      expect(toNumber(regularPay)).toBe(1020.00);
      expect(toNumber(overtimeRate)).toBe(38.25);
      expect(toNumber(overtimePay)).toBe(382.50);
      expect(toNumber(grossPay)).toBe(1402.50);
    });

    it('should calculate YTD totals accurately', () => {
      // Employee has worked 25 pay periods, now on 26th
      const biweeklyPay = 2000.00;
      const ytdGrossPay = multiply(biweeklyPay, 25); // 50,000

      const currentGrossPay = 2000.00;
      const newYtdGrossPay = add(ytdGrossPay, currentGrossPay); // 52,000

      expect(toNumber(ytdGrossPay)).toBe(50000.00);
      expect(toNumber(newYtdGrossPay)).toBe(52000.00);
    });

    it('should prevent rounding drift in tax calculations', () => {
      // Calculate tax 26 times and verify total matches expected
      const biweeklyPay = 2000.00;
      const taxRate = 6.2; // Social Security

      let totalTax = decimal(0);
      for (let i = 0; i < 26; i++) {
        const tax = percentOf(biweeklyPay, taxRate); // 124.00 each time
        totalTax = add(totalTax, tax);
      }

      // Expected: 26 * 124.00 = 3224.00
      expect(toNumber(totalTax)).toBe(3224.00);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero values', () => {
      expect(toNumber(add(0, 0))).toBe(0.00);
      expect(toNumber(multiply(100, 0))).toBe(0.00);
      expect(toNumber(nonNegative(0))).toBe(0.00);
    });

    it('should handle very large salaries', () => {
      const ceoSalary = 5000000; // $5M annual
      const biweeklyPay = divide(ceoSalary, 26);

      expect(toNumber(biweeklyPay)).toBe(192307.69);

      // Verify 26 pay periods sum back to salary
      const annualTotal = multiply(biweeklyPay, 26);
      expect(toNumber(annualTotal)).toBe(4999999.94); // Slight rounding due to .69 repeating
    });

    it('should handle minimum wage scenarios', () => {
      const minWage = 7.25;
      const hours = 40;
      const weeklyPay = multiply(minWage, hours);

      expect(toNumber(weeklyPay)).toBe(290.00);
    });
  });
});
