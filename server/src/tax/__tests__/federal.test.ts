/**
 * Federal Tax Calculator Unit Tests
 * Tests for IRS 2024 tax calculations
 */

import { calculateFederalTax, getTaxBracketInfo, FederalTaxInput } from '../federal';

describe('Federal Tax Calculator', () => {
  // Helper to create test input
  const createInput = (overrides: Partial<FederalTaxInput> = {}): FederalTaxInput => ({
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    allowances: 0,
    additionalWithholding: 0,
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('Income Tax Withholding', () => {
    it('should calculate correct tax for SINGLE filer', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      // $5000 gross - ($14600/24 = $608.33 std deduction) = $4391.67 taxable
      // Annual taxable = $4391.67 * 24 = $105,400
      // Tax: $5426 + ($105400 - $47150) * 0.22 = $5426 + $12815 = $18241
      // Per period: $18241 / 24 = $760.04
      expect(result.incomeTax).toBeGreaterThan(700);
      expect(result.incomeTax).toBeLessThan(800);
    });

    it('should calculate correct tax for MARRIED_FILING_JOINTLY', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'MARRIED_FILING_JOINTLY',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      // MFJ has larger standard deduction ($29200) so lower tax
      expect(result.incomeTax).toBeLessThan(700);
    });

    it('should calculate correct tax for HEAD_OF_HOUSEHOLD', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'HEAD_OF_HOUSEHOLD',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      // HOH has larger brackets than SINGLE
      expect(result.incomeTax).toBeGreaterThan(0);
    });

    it('should return zero tax when income is below standard deduction', () => {
      const input = createInput({
        grossPay: 500,  // Annual = $12000, below $14600 std deduction
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      expect(result.incomeTax).toBe(0);
    });

    it('should apply dependent credit correctly', () => {
      const inputNoDependents = createInput({
        grossPay: 5000,
        allowances: 0,
      });

      const inputWithDependents = createInput({
        grossPay: 5000,
        allowances: 2,  // 2 dependents = $4000 annual credit
      });

      const resultNoDependents = calculateFederalTax(inputNoDependents);
      const resultWithDependents = calculateFederalTax(inputWithDependents);

      // $4000 / 24 = $166.67 credit per pay period
      expect(resultNoDependents.incomeTax - resultWithDependents.incomeTax).toBeCloseTo(166.67, 0);
    });

    it('should add additional withholding', () => {
      const inputNoAdditional = createInput({
        grossPay: 5000,
        additionalWithholding: 0,
      });

      const inputWithAdditional = createInput({
        grossPay: 5000,
        additionalWithholding: 100,
      });

      const resultNoAdditional = calculateFederalTax(inputNoAdditional);
      const resultWithAdditional = calculateFederalTax(inputWithAdditional);

      expect(resultWithAdditional.incomeTax - resultNoAdditional.incomeTax).toBe(100);
    });

    it('should default to SINGLE brackets for unknown filing status', () => {
      const input = createInput({
        filingStatus: 'UNKNOWN_STATUS',
      });

      const result = calculateFederalTax(input);

      // Should use SINGLE brackets as default
      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });

  describe('Social Security Tax', () => {
    const SS_RATE = 0.062;
    const SS_WAGE_CAP = 168600;

    it('should calculate 6.2% of gross pay', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 0,
      });

      const result = calculateFederalTax(input);

      expect(result.socialSecurity).toBe(310); // 5000 * 0.062
    });

    it('should respect wage cap of $168,600', () => {
      const input = createInput({
        grossPay: 10000,
        ytdGrossWages: 165000,  // Only $3600 left before cap
      });

      const result = calculateFederalTax(input);

      // Only $3600 is subject to SS tax
      expect(result.socialSecurity).toBe(223.20); // 3600 * 0.062
    });

    it('should return zero when YTD already at wage cap', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 170000,  // Already past cap
      });

      const result = calculateFederalTax(input);

      expect(result.socialSecurity).toBe(0);
    });

    it('should correctly calculate partial period at cap boundary', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 168000,  // $600 left before cap
      });

      const result = calculateFederalTax(input);

      expect(result.socialSecurity).toBe(37.20); // 600 * 0.062
    });
  });

  describe('Medicare Tax', () => {
    const MEDICARE_RATE = 0.0145;

    it('should calculate 1.45% of gross pay', () => {
      const input = createInput({
        grossPay: 5000,
      });

      const result = calculateFederalTax(input);

      expect(result.medicare).toBe(72.50); // 5000 * 0.0145
    });

    it('should not have a wage cap', () => {
      const input = createInput({
        grossPay: 50000,
        ytdGrossWages: 500000,  // Way past SS cap
      });

      const result = calculateFederalTax(input);

      expect(result.medicare).toBe(725); // 50000 * 0.0145
    });
  });

  describe('Additional Medicare Tax', () => {
    // IMPORTANT: Per IRS Publication 15, employer withholding for Additional Medicare
    // MUST use a fixed $200,000 threshold regardless of filing status.
    // The actual liability based on filing status is reconciled on employee's tax return.

    it('should apply 0.9% on wages over $200,000 for SINGLE', () => {
      const input = createInput({
        grossPay: 10000,
        filingStatus: 'SINGLE',
        ytdGrossWages: 195000,  // Will cross $200k threshold
      });

      const result = calculateFederalTax(input);

      // $5000 over threshold
      expect(result.medicareAdditional).toBe(45); // 5000 * 0.009
    });

    it('should use fixed $200k threshold for MARRIED_FILING_JOINTLY (per IRS withholding rules)', () => {
      // Note: The actual MFJ liability threshold is $250k, but employer WITHHOLDING
      // must use $200k. Employee reconciles difference on their tax return.
      const input = createInput({
        grossPay: 10000,
        filingStatus: 'MARRIED_FILING_JOINTLY',
        ytdGrossWages: 195000,  // Will cross $200k withholding threshold
      });

      const result = calculateFederalTax(input);

      // $5000 over $200k threshold (not $250k)
      expect(result.medicareAdditional).toBe(45); // 5000 * 0.009
    });

    it('should use fixed $200k threshold for MARRIED_FILING_SEPARATELY (per IRS withholding rules)', () => {
      // Note: The actual MFS liability threshold is $125k, but employer WITHHOLDING
      // must use $200k. MFS filers may owe additional tax at filing.
      const input = createInput({
        grossPay: 10000,
        filingStatus: 'MARRIED_FILING_SEPARATELY',
        ytdGrossWages: 195000,  // Will cross $200k withholding threshold
      });

      const result = calculateFederalTax(input);

      // $5000 over $200k threshold
      expect(result.medicareAdditional).toBe(45); // 5000 * 0.009
    });

    it('should return zero when below $200k threshold', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
        ytdGrossWages: 50000,  // Way below $200k threshold
      });

      const result = calculateFederalTax(input);

      expect(result.medicareAdditional).toBe(0);
    });

    it('should calculate for full paycheck when entirely over threshold', () => {
      const input = createInput({
        grossPay: 10000,
        filingStatus: 'SINGLE',
        ytdGrossWages: 250000,  // Already over threshold
      });

      const result = calculateFederalTax(input);

      // Full paycheck is subject to additional Medicare
      expect(result.medicareAdditional).toBe(90); // 10000 * 0.009
    });
  });

  describe('Total Tax Calculation', () => {
    it('should sum all tax components correctly', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
        allowances: 0,
        additionalWithholding: 0,
        ytdGrossWages: 0,
      });

      const result = calculateFederalTax(input);

      const expectedTotal = result.incomeTax + result.socialSecurity +
                           result.medicare + result.medicareAdditional;

      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });

    it('should round total to 2 decimal places', () => {
      const input = createInput({
        grossPay: 3333.33,
      });

      const result = calculateFederalTax(input);

      // Check that total has at most 2 decimal places
      expect(result.total).toBe(Math.round(result.total * 100) / 100);
    });
  });

  describe('Details Object', () => {
    it('should return correct taxable wages', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      // Taxable = gross - (standard deduction / periods)
      // = 5000 - (14600 / 24) = 5000 - 608.33 = 4391.67
      expect(result.details.taxableWages).toBeCloseTo(4391.67, 1);
    });

    it('should return correct standard deduction per period', () => {
      const input = createInput({
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      expect(result.details.standardDeduction).toBeCloseTo(608.33, 0);
    });

    it('should return correct dependent credit per period', () => {
      const input = createInput({
        allowances: 3,
        payPeriodsPerYear: 24,
      });

      const result = calculateFederalTax(input);

      // 3 * $2000 / 24 = $250
      expect(result.details.dependentCredit).toBe(250);
    });

    it('should add other income per period to taxable wages', () => {
      const baseInput = createInput({
        grossPay: 5000,
        payPeriodsPerYear: 24,
        otherIncome: 0,
      });
      const withOtherIncome = createInput({
        grossPay: 5000,
        payPeriodsPerYear: 24,
        otherIncome: 2400, // $100 per period
      });

      const baseResult = calculateFederalTax(baseInput);
      const otherResult = calculateFederalTax(withOtherIncome);

      expect(otherResult.details.taxableWages - baseResult.details.taxableWages).toBeCloseTo(100, 2);
    });

    it('should subtract additional deductions per period from taxable wages', () => {
      const baseInput = createInput({
        grossPay: 5000,
        payPeriodsPerYear: 24,
        deductions: 0,
      });
      const withDeductions = createInput({
        grossPay: 5000,
        payPeriodsPerYear: 24,
        deductions: 2400, // $100 per period
      });

      const baseResult = calculateFederalTax(baseInput);
      const deductionResult = calculateFederalTax(withDeductions);

      expect(baseResult.details.taxableWages - deductionResult.details.taxableWages).toBeCloseTo(100, 2);
    });
  });

  describe('Pay Period Variations', () => {
    it('should calculate correctly for weekly pay (52 periods)', () => {
      const input = createInput({
        grossPay: 2500,
        payPeriodsPerYear: 52,
      });

      const result = calculateFederalTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.socialSecurity).toBe(155); // 2500 * 0.062
    });

    it('should calculate correctly for bi-weekly pay (26 periods)', () => {
      const input = createInput({
        grossPay: 5000,
        payPeriodsPerYear: 26,
      });

      const result = calculateFederalTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });

    it('should calculate correctly for monthly pay (12 periods)', () => {
      const input = createInput({
        grossPay: 10000,
        payPeriodsPerYear: 12,
      });

      const result = calculateFederalTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.details.standardDeduction).toBeCloseTo(1216.67, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero gross pay', () => {
      const input = createInput({
        grossPay: 0,
      });

      const result = calculateFederalTax(input);

      expect(result.incomeTax).toBe(0);
      expect(result.socialSecurity).toBe(0);
      expect(result.medicare).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle very high income (top bracket)', () => {
      const input = createInput({
        grossPay: 100000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 12,
        ytdGrossWages: 500000,
      });

      const result = calculateFederalTax(input);

      // Should use 37% bracket
      expect(result.incomeTax).toBeGreaterThan(30000);
      expect(result.medicareAdditional).toBeGreaterThan(0);
    });

    it('should handle negative taxable wages (high deductions)', () => {
      const input = createInput({
        grossPay: 100,  // Very low pay
        payPeriodsPerYear: 52,  // Weekly = small deduction per period
      });

      const result = calculateFederalTax(input);

      // Taxable wages should be clamped to 0
      expect(result.details.taxableWages).toBe(0);
      expect(result.incomeTax).toBe(0);
    });
  });
});

describe('getTaxBracketInfo', () => {
  it('should return correct bracket for SINGLE in first bracket', () => {
    const info = getTaxBracketInfo('SINGLE', 10000);

    expect(info.marginalRate).toBe(10);
    expect(info.bracketMin).toBe(0);
    expect(info.bracketMax).toBe(11600);
  });

  it('should return correct bracket for middle income', () => {
    const info = getTaxBracketInfo('SINGLE', 50000);

    expect(info.marginalRate).toBe(22);
    expect(info.bracketMin).toBe(47150);
    expect(info.bracketMax).toBe(100525);
  });

  it('should return top bracket for very high income', () => {
    const info = getTaxBracketInfo('SINGLE', 1000000);

    expect(info.marginalRate).toBe(37);
    expect(info.bracketMin).toBe(609350);
    expect(info.bracketMax).toBe(Infinity);
  });

  it('should return SINGLE brackets for unknown filing status', () => {
    const info = getTaxBracketInfo('UNKNOWN', 50000);

    expect(info.marginalRate).toBe(22);
  });

  it('should handle MARRIED_FILING_JOINTLY brackets', () => {
    const info = getTaxBracketInfo('MARRIED_FILING_JOINTLY', 100000);

    expect(info.marginalRate).toBe(22);
    expect(info.bracketMin).toBe(94300);
    expect(info.bracketMax).toBe(201050);
  });
});
