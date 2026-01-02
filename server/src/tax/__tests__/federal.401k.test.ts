import { describe, it, expect } from '@jest/globals';
import { calculateFederalTax } from '../federal.js';

describe('Federal Tax - 401(k) Pre-Tax Deduction Fix', () => {
  /**
   * CRITICAL TEST: Verify that 401(k) contributions are deducted from
   * Federal Income Tax but NOT from FICA (Social Security + Medicare)
   */

  it('should deduct 401k from income tax but NOT from FICA', () => {
    // Employee earning $4,000 biweekly ($104k annual)
    // Contributing $200 to 401(k) (5%)

    const WITHOUT_401K = calculateFederalTax({
      grossPay: 4000,
      preTaxDeductions: 0,  // No 401k
      annualIncome: 104000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    const WITH_401K = calculateFederalTax({
      grossPay: 4000,
      preTaxDeductions: 200,  // $200 401k contribution
      annualIncome: 104000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // FICA should be IDENTICAL (401k doesn't affect FICA)
    expect(WITH_401K.socialSecurity).toBe(WITHOUT_401K.socialSecurity);
    expect(WITH_401K.medicare).toBe(WITHOUT_401K.medicare);

    // FICA is calculated on full $4,000 gross
    const expectedSS = Math.round(4000 * 0.062 * 100) / 100; // 6.2%
    const expectedMedicare = Math.round(4000 * 0.0145 * 100) / 100; // 1.45%
    expect(WITH_401K.socialSecurity).toBe(expectedSS);
    expect(WITH_401K.medicare).toBe(expectedMedicare);

    // Income tax should be LOWER with 401k (taxable base reduced)
    expect(WITH_401K.incomeTax).toBeLessThan(WITHOUT_401K.incomeTax);

    // Estimate tax savings: $200 * marginal tax rate
    // At $104k annual (single), marginal rate is 22%
    // Expected savings: ~$200 * 22% / period = ~$44 per paycheck
    const incomeTaxSavings = WITHOUT_401K.incomeTax - WITH_401K.incomeTax;
    expect(incomeTaxSavings).toBeGreaterThan(30); // At least $30 savings
    expect(incomeTaxSavings).toBeLessThan(60);    // Less than $60 savings
  });

  it('should handle large 401k contributions correctly', () => {
    // Employee earning $8,000 biweekly ($208k annual)
    // Contributing $800 to 401(k) (10%)

    const result = calculateFederalTax({
      grossPay: 8000,
      preTaxDeductions: 800,  // $800 401k (10%)
      annualIncome: 208000,
      filingStatus: 'MARRIED_FILING_JOINTLY',
      allowances: 2,  // 2 dependents
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // FICA calculated on full $8,000
    expect(result.socialSecurity).toBe(Math.round(8000 * 0.062 * 100) / 100);
    expect(result.medicare).toBe(Math.round(8000 * 0.0145 * 100) / 100);

    // Income tax should be calculated on $7,200 ($8,000 - $800)
    // Verify it's less than if calculated on $8,000
    const withoutDeduction = calculateFederalTax({
      grossPay: 8000,
      preTaxDeductions: 0,
      annualIncome: 208000,
      filingStatus: 'MARRIED_FILING_JOINTLY',
      allowances: 2,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    expect(result.incomeTax).toBeLessThan(withoutDeduction.incomeTax);

    // At this income level (married), marginal rate is 22-24%
    // $800 * ~23% = ~$184 per paycheck savings
    const savings = withoutDeduction.incomeTax - result.incomeTax;
    expect(savings).toBeGreaterThan(150);
    expect(savings).toBeLessThan(220);
  });

  it('should handle zero 401k contribution', () => {
    const resultWithZero = calculateFederalTax({
      grossPay: 3000,
      preTaxDeductions: 0,
      annualIncome: 78000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    const resultWithoutParam = calculateFederalTax({
      grossPay: 3000,
      // preTaxDeductions omitted (defaults to 0)
      annualIncome: 78000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // Should be identical
    expect(resultWithZero.incomeTax).toBe(resultWithoutParam.incomeTax);
    expect(resultWithZero.socialSecurity).toBe(resultWithoutParam.socialSecurity);
    expect(resultWithZero.medicare).toBe(resultWithoutParam.medicare);
  });

  it('should not allow preTaxDeductions to create negative taxable base', () => {
    // Edge case: 401k contribution exceeds gross pay (shouldn't happen, but test anyway)
    const result = calculateFederalTax({
      grossPay: 1000,
      preTaxDeductions: 1500,  // More than gross (invalid, but testing robustness)
      annualIncome: 26000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // Income tax should be minimal (standard deduction covers it)
    expect(result.incomeTax).toBeGreaterThanOrEqual(0);

    // FICA should still be calculated on $1,000 gross
    expect(result.socialSecurity).toBe(Math.round(1000 * 0.062 * 100) / 100);
    expect(result.medicare).toBe(Math.round(1000 * 0.0145 * 100) / 100);
  });

  it('should demonstrate the bug fix with real-world scenario', () => {
    /**
     * REAL SCENARIO that was broken before the fix:
     * Employee: Software engineer, $104k annual salary
     * Pay frequency: Biweekly (26 periods)
     * 401(k): 5% contribution ($200 per paycheck)
     * Filing: Single, no dependents
     *
     * BEFORE FIX: System calculated income tax on $4,000
     * AFTER FIX: System correctly calculates income tax on $3,800
     */

    const grossPay = 4000;
    const contribution401k = 200;  // 5% of $4,000

    const result = calculateFederalTax({
      grossPay,
      preTaxDeductions: contribution401k,
      annualIncome: 104000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // Verify correct FICA calculation (on full $4,000)
    expect(result.socialSecurity).toBe(248);  // $4,000 * 6.2%
    expect(result.medicare).toBe(58);         // $4,000 * 1.45%

    // Verify income tax is calculated on reduced base ($3,800)
    // At $104k single filer, marginal rate is 22%
    // Approximate income tax on $3,800 biweekly with standard deduction
    // Standard deduction: $14,600/26 = $561.54 per period
    // Taxable: $3,800 - $561.54 = $3,238.46
    // Annual taxable: $3,238.46 * 26 = $84,200
    // Tax on $84,200 (single): ~$13,500/year = ~$519 per period

    // Income tax should be in reasonable range
    expect(result.incomeTax).toBeGreaterThan(450);
    expect(result.incomeTax).toBeLessThan(550);

    // Total deductions
    const totalTax = result.total;
    expect(totalTax).toBeGreaterThan(700);  // At least $700
    expect(totalTax).toBeLessThan(900);     // Less than $900

    // Net pay calculation
    const netPay = grossPay - totalTax - contribution401k;
    expect(netPay).toBeGreaterThan(2900);  // Should have >$2,900 take-home
    expect(netPay).toBeLessThan(3200);     // Should have <$3,200 take-home
  });

  it('should correctly handle multiple pay frequencies', () => {
    const annualSalary = 52000;
    const contribution401kPercent = 0.06;  // 6%

    // Weekly (52 periods)
    const weekly = calculateFederalTax({
      grossPay: annualSalary / 52,  // $1,000
      preTaxDeductions: (annualSalary / 52) * contribution401kPercent,  // $60
      annualIncome: annualSalary,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 52
    });

    // Biweekly (26 periods)
    const biweekly = calculateFederalTax({
      grossPay: annualSalary / 26,  // $2,000
      preTaxDeductions: (annualSalary / 26) * contribution401kPercent,  // $120
      annualIncome: annualSalary,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      payPeriodsPerYear: 26
    });

    // Annual tax should be approximately the same
    const annualTaxWeekly = weekly.total * 52;
    const annualTaxBiweekly = biweekly.total * 26;

    // Allow small variance due to rounding
    expect(Math.abs(annualTaxWeekly - annualTaxBiweekly)).toBeLessThan(50);
  });
});
