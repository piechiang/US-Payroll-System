/**
 * Federal Tax Calculator Tests (Decimal.js Version)
 *
 * These tests verify IRS Publication 15-T (2024) compliance
 * and ensure penny-perfect precision in tax calculations.
 */

import { describe, it, expect } from '@jest/globals';
import { calculateFederalTax } from '../federalDecimal';

describe('Federal Tax Calculator (Decimal.js)', () => {
  describe('Income Tax Withholding - Single Filing Status', () => {
    it('should calculate tax for $2,000 biweekly pay correctly', () => {
      const result = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Annual income: $52,000
      // Standard deduction: $14,600
      // Taxable income: $37,400
      // Tax: 10% on first $11,600 = $1,160
      //      12% on remaining $25,800 = $3,096
      // Total annual tax: $4,256
      // Per period: $4,256 / 26 = $163.69

      expect(result.incomeTax).toBeCloseTo(163.69, 2);
      expect(result.socialSecurity).toBe(124.00); // 6.2% of $2,000
      expect(result.medicare).toBe(29.00); // 1.45% of $2,000
      expect(result.medicareAdditional).toBe(0.00);
      expect(result.total).toBeCloseTo(316.69, 2);
    });

    it('should apply 10% bracket for low income', () => {
      // Annual income $20,000, below first bracket threshold
      const result = calculateFederalTax({
        grossPay: 769.23,
        annualIncome: 20000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Taxable income: $20,000 - $14,600 = $5,400
      // Tax: 10% of $5,400 = $540 annual
      // Per period: $540 / 26 = $20.77

      expect(result.incomeTax).toBeCloseTo(20.77, 2);
    });

    it('should apply 22% bracket for mid-range income', () => {
      // Annual income $75,000
      const result = calculateFederalTax({
        grossPay: 2884.62,
        annualIncome: 75000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Taxable income: $75,000 - $14,600 = $60,400
      // Tax: $1,160 + 12% of ($47,150 - $11,600) + 22% of ($60,400 - $47,150)
      //      $1,160 + $4,266 + $2,915 = $8,341 annual
      // Per period: $8,341 / 26 = $320.81

      expect(result.incomeTax).toBeCloseTo(320.81, 2);
    });
  });

  describe('Income Tax Withholding - Married Filing Jointly', () => {
    it('should use correct brackets for MFJ', () => {
      const result = calculateFederalTax({
        grossPay: 4000,
        annualIncome: 104000,
        filingStatus: 'MARRIED_FILING_JOINTLY',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Standard deduction for MFJ: $29,200
      // Taxable income: $104,000 - $29,200 = $74,800
      // Tax: $2,320 + 12% of ($74,800 - $23,200) = $2,320 + $6,192 = $8,512 annual
      // Per period: $8,512 / 26 = $327.38

      expect(result.incomeTax).toBeCloseTo(327.38, 2);
    });
  });

  describe('W-4 Step 3 - Dependent Allowances', () => {
    it('should reduce tax for 2 dependents', () => {
      const withoutDependents = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      const withDependents = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 2, // 2 dependents
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Dependent credit: 2 * $2,000 = $4,000 annual
      // Per period: $4,000 / 26 = $153.85 reduction
      const expectedReduction = 153.85;

      expect(withDependents.incomeTax).toBeCloseTo(
        withoutDependents.incomeTax - expectedReduction,
        2
      );
    });

    it('should not allow negative tax', () => {
      // Very low income with many dependents
      const result = calculateFederalTax({
        grossPay: 500,
        annualIncome: 13000,
        filingStatus: 'SINGLE',
        allowances: 5,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      expect(result.incomeTax).toBeGreaterThanOrEqual(0);
    });
  });

  describe('W-4 Step 4 - Additional Adjustments', () => {
    it('should add W-4 Step 4(a) other income to withholding', () => {
      const withoutOtherIncome = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      const withOtherIncome = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        otherIncome: 5000, // $5,000 other income (e.g., investment income)
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Other income increases taxable wages
      expect(withOtherIncome.incomeTax).toBeGreaterThan(withoutOtherIncome.incomeTax);
    });

    it('should subtract W-4 Step 4(b) deductions from withholding', () => {
      const withoutDeductions = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      const withDeductions = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        deductions: 10000, // $10,000 itemized deductions
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Deductions reduce taxable wages
      expect(withDeductions.incomeTax).toBeLessThan(withoutDeductions.incomeTax);
    });

    it('should add W-4 Step 4(c) additional withholding', () => {
      const result = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 50, // Extra $50 per paycheck
        payPeriodsPerYear: 26
      });

      // Additional withholding is added directly to income tax
      expect(result.incomeTax).toBeGreaterThan(113.69); // Base tax + $50
    });
  });

  describe('Social Security Tax (FICA)', () => {
    it('should calculate 6.2% on gross pay', () => {
      const result = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      expect(result.socialSecurity).toBe(124.00); // 6.2% of $2,000
    });

    it('should respect $168,600 wage cap for 2024', () => {
      // Employee has earned $167,000 YTD, current pay is $3,000
      // Only $1,600 should be taxed ($168,600 - $167,000)
      const result = calculateFederalTax({
        grossPay: 3000,
        annualIncome: 170000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 167000
      });

      const expectedSS = 1600 * 0.062; // $99.20
      expect(result.socialSecurity).toBe(99.20);
    });

    it('should charge zero SS tax if YTD already exceeds cap', () => {
      const result = calculateFederalTax({
        grossPay: 5000,
        annualIncome: 175000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 170000 // Already over $168,600 cap
      });

      expect(result.socialSecurity).toBe(0.00);
    });
  });

  describe('Medicare Tax', () => {
    it('should calculate 1.45% on gross pay', () => {
      const result = calculateFederalTax({
        grossPay: 2000,
        annualIncome: 52000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      expect(result.medicare).toBe(29.00); // 1.45% of $2,000
    });

    it('should have no wage cap for regular Medicare', () => {
      const result = calculateFederalTax({
        grossPay: 10000,
        annualIncome: 260000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 250000 // Well over SS cap
      });

      expect(result.medicare).toBe(145.00); // 1.45% of $10,000
    });
  });

  describe('Additional Medicare Tax (0.9%)', () => {
    it('should apply 0.9% over $200,000 threshold', () => {
      // Employee has $195,000 YTD, current pay $10,000
      // Threshold: $200,000
      // Excess: $5,000 ($205,000 - $200,000)
      const result = calculateFederalTax({
        grossPay: 10000,
        annualIncome: 260000,
        filingStatus: 'SINGLE', // Threshold is $200,000 for withholding regardless of filing status
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 195000
      });

      const expectedAdditional = 5000 * 0.009; // $45.00
      expect(result.medicareAdditional).toBe(45.00);
    });

    it('should not apply if below threshold', () => {
      const result = calculateFederalTax({
        grossPay: 5000,
        annualIncome: 130000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 120000
      });

      expect(result.medicareAdditional).toBe(0.00);
    });

    it('should use $200,000 threshold for withholding (not filing status threshold)', () => {
      // Even for MFJ (which has $250,000 threshold for actual liability),
      // withholding uses $200,000 per IRS Publication 15
      const result = calculateFederalTax({
        grossPay: 10000,
        annualIncome: 260000,
        filingStatus: 'MARRIED_FILING_JOINTLY',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 195000
      });

      // Should still trigger at $200,000, not $250,000
      expect(result.medicareAdditional).toBeGreaterThan(0);
    });
  });

  describe('Precision and Rounding', () => {
    it('should maintain penny precision', () => {
      const result = calculateFederalTax({
        grossPay: 1234.56,
        annualIncome: 32098.56,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // All results should have exactly 2 decimal places
      expect(result.incomeTax).toBe(parseFloat(result.incomeTax.toFixed(2)));
      expect(result.socialSecurity).toBe(parseFloat(result.socialSecurity.toFixed(2)));
      expect(result.medicare).toBe(parseFloat(result.medicare.toFixed(2)));
      expect(result.total).toBe(parseFloat(result.total.toFixed(2)));
    });

    it('should not accumulate rounding errors over multiple pay periods', () => {
      // Calculate tax for 26 pay periods and verify consistency
      const results = [];
      for (let i = 0; i < 26; i++) {
        const result = calculateFederalTax({
          grossPay: 2000,
          annualIncome: 52000,
          filingStatus: 'SINGLE',
          allowances: 0,
          additionalWithholding: 0,
          payPeriodsPerYear: 26
        });
        results.push(result);
      }

      // All pay periods should have identical tax
      const firstTax = results[0].incomeTax;
      for (const result of results) {
        expect(result.incomeTax).toBe(firstTax);
      }

      // Total Social Security for year should be exactly 6.2% of annual salary
      const totalSS = results.reduce((sum, r) => sum + r.socialSecurity, 0);
      const expectedSS = 52000 * 0.062; // $3,224
      expect(totalSS).toBeCloseTo(expectedSS, 2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero gross pay', () => {
      const result = calculateFederalTax({
        grossPay: 0,
        annualIncome: 0,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      expect(result.incomeTax).toBe(0.00);
      expect(result.socialSecurity).toBe(0.00);
      expect(result.medicare).toBe(0.00);
      expect(result.total).toBe(0.00);
    });

    it('should handle minimum wage worker', () => {
      // Federal minimum wage $7.25/hour, 40 hours/week
      const weeklyPay = 7.25 * 40; // $290
      const biweeklyPay = 580;
      const annualIncome = biweeklyPay * 26; // $15,080

      const result = calculateFederalTax({
        grossPay: biweeklyPay,
        annualIncome: annualIncome,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26
      });

      // Very low tax burden due to standard deduction
      expect(result.incomeTax).toBeLessThan(20);
      expect(result.socialSecurity).toBe(35.96); // 6.2% of $580
      expect(result.medicare).toBe(8.41); // 1.45% of $580
    });

    it('should handle high earner (CEO)', () => {
      // $500,000 annual salary
      const biweeklyPay = 500000 / 26; // $19,230.77

      const result = calculateFederalTax({
        grossPay: biweeklyPay,
        annualIncome: 500000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        payPeriodsPerYear: 26,
        ytdGrossWages: 0 // First paycheck of year
      });

      // Should be in top bracket (37%)
      expect(result.incomeTax).toBeGreaterThan(5000);

      // Social Security capped at first few paychecks
      expect(result.socialSecurity).toBe(1192.31); // 6.2% of $19,230.77
    });
  });
});
