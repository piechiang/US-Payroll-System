/**
 * State Tax Calculator Unit Tests
 * Tests for various state tax calculations
 */

import { calculateStateTax, isStateSupported, getSupportedStates, StateTaxInput, UnsupportedStateError } from '../state/index';
import { calculateCaliforniaTax, CA_TAX_INFO } from '../state/california';

describe('State Tax Router', () => {
  // Helper to create test input
  const createInput = (overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state: 'CA',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('calculateStateTax routing', () => {
    it('should route to California calculator for CA', () => {
      const input = createInput({ state: 'CA' });
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.sdi).toBeGreaterThan(0);  // CA has SDI
    });

    it('should route to New York calculator for NY', () => {
      const input = createInput({ state: 'NY' });
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });

    it('should route to Texas calculator (no income tax)', () => {
      const input = createInput({ state: 'TX' });
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should route to Florida calculator (no income tax)', () => {
      const input = createInput({ state: 'FL' });
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBe(0);
    });

    it('should throw UnsupportedStateError for invalid state code', () => {
      const input = createInput({ state: 'XX' });

      expect(() => calculateStateTax(input)).toThrow(UnsupportedStateError);
      expect(() => calculateStateTax(input)).toThrow(/not supported/);
    });
  });

  describe('No Income Tax States', () => {
    const noTaxStates = ['AK', 'FL', 'NV', 'SD', 'TX', 'WA', 'WY', 'NH', 'TN'];

    noTaxStates.forEach(state => {
      it(`should return zero income tax for ${state}`, () => {
        const input = createInput({ state });
        const result = calculateStateTax(input);

        expect(result.incomeTax).toBe(0);
        expect(result.details?.marginalRate).toBe(0);
      });
    });
  });

  describe('isStateSupported', () => {
    it('should return true for California', () => {
      expect(isStateSupported('CA')).toBe(true);
    });

    it('should return true for no-tax states', () => {
      expect(isStateSupported('TX')).toBe(true);
      expect(isStateSupported('FL')).toBe(true);
    });

    it('should return false for invalid state', () => {
      expect(isStateSupported('XX')).toBe(false);
    });
  });

  describe('getSupportedStates', () => {
    it('should return all 50 states plus DC', () => {
      const states = getSupportedStates();
      expect(states.length).toBe(51);  // 42 income tax (including DC) + 9 no income tax
    });

    it('should include major states', () => {
      const states = getSupportedStates();
      expect(states).toContain('CA');
      expect(states).toContain('NY');
      expect(states).toContain('TX');
      expect(states).toContain('FL');
      expect(states).toContain('DC');
    });
  });
});

describe('California Tax Calculator', () => {
  const createInput = (overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state: 'CA',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('Income Tax Calculation', () => {
    it('should calculate progressive tax for SINGLE filer', () => {
      const input = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
      });

      const result = calculateCaliforniaTax(input);

      // Should have income tax
      expect(result.incomeTax).toBeGreaterThan(0);
      // CA has 9.3% bracket for middle income
      expect(result.details?.marginalRate).toBeGreaterThanOrEqual(1);
    });

    it('should calculate less tax for MARRIED_FILING_JOINTLY', () => {
      const singleInput = createInput({
        grossPay: 5000,
        filingStatus: 'SINGLE',
      });

      const marriedInput = createInput({
        grossPay: 5000,
        filingStatus: 'MARRIED_FILING_JOINTLY',
      });

      const singleResult = calculateCaliforniaTax(singleInput);
      const marriedResult = calculateCaliforniaTax(marriedInput);

      // MFJ has larger brackets, so lower tax
      expect(marriedResult.incomeTax).toBeLessThan(singleResult.incomeTax);
    });

    it('should apply standard deduction correctly', () => {
      const input = createInput({
        grossPay: 200,  // Very low pay
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
      });

      const result = calculateCaliforniaTax(input);

      // Standard deduction should reduce taxable wages
      // $5363 / 24 = $223.46 per period, so $200 gross = $0 taxable
      expect(result.details?.taxableWages).toBe(0);
      expect(result.incomeTax).toBe(0);
    });

    it('should handle MARRIED_FILING_SEPARATELY as SINGLE', () => {
      const mfsInput = createInput({
        filingStatus: 'MARRIED_FILING_SEPARATELY',
      });

      const singleInput = createInput({
        filingStatus: 'SINGLE',
      });

      const mfsResult = calculateCaliforniaTax(mfsInput);
      const singleResult = calculateCaliforniaTax(singleInput);

      // MFS uses SINGLE brackets in CA
      expect(mfsResult.incomeTax).toBe(singleResult.incomeTax);
    });

    it('should calculate top bracket (13.3%) for millionaire', () => {
      const input = createInput({
        grossPay: 100000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 12,  // Monthly
      });

      const result = calculateCaliforniaTax(input);

      // Annual = $1.2M, in 13.3% bracket
      expect(result.details?.marginalRate).toBe(13.3);
    });
  });

  describe('SDI Calculation', () => {
    const SDI_RATE = 0.009;  // 0.9% for 2024
    const SDI_CAP = 153164;

    it('should calculate 0.9% SDI', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 0,
      });

      const result = calculateCaliforniaTax(input);

      expect(result.sdi).toBe(45);  // 5000 * 0.009
    });

    it('should respect SDI wage cap', () => {
      const input = createInput({
        grossPay: 10000,
        ytdGrossWages: 150000,  // Only $3164 left before cap
      });

      const result = calculateCaliforniaTax(input);

      // Only $3164 subject to SDI
      expect(result.sdi).toBeCloseTo(28.48, 1);  // 3164 * 0.009
    });

    it('should return zero SDI when cap reached', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 160000,  // Already past cap
      });

      const result = calculateCaliforniaTax(input);

      expect(result.sdi).toBe(0);
    });
  });

  describe('SUI (Employee Portion)', () => {
    it('should return zero SUI for California', () => {
      const input = createInput();
      const result = calculateCaliforniaTax(input);

      // CA doesn't have employee-paid SUI
      expect(result.sui).toBe(0);
    });
  });

  describe('Total Calculation', () => {
    it('should sum income tax and SDI correctly', () => {
      const input = createInput({
        grossPay: 5000,
      });

      const result = calculateCaliforniaTax(input);

      expect(result.total).toBe(result.incomeTax + result.sdi + result.sui);
    });
  });
});

describe('States with Flat Tax', () => {
  const createInput = (state: string, overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state,
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('Pennsylvania (3.07%)', () => {
    it('should apply flat 3.07% rate', () => {
      const input = createInput('PA');
      const result = calculateStateTax(input);

      // PA has flat 3.07% with no standard deduction for withholding
      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });

  describe('Illinois (4.95%)', () => {
    it('should apply flat 4.95% rate', () => {
      const input = createInput('IL');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });

  describe('Colorado (4.4%)', () => {
    it('should apply flat 4.4% rate', () => {
      const input = createInput('CO');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });

  describe('Michigan (4.25%)', () => {
    it('should apply flat rate', () => {
      const input = createInput('MI');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });
});

describe('States with Progressive Tax', () => {
  const createInput = (state: string, overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state,
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('New York', () => {
    it('should calculate progressive tax', () => {
      const lowInput = createInput('NY', { grossPay: 1000 });
      const highInput = createInput('NY', { grossPay: 10000 });

      const lowResult = calculateStateTax(lowInput);
      const highResult = calculateStateTax(highInput);

      // Higher income should have higher marginal rate
      expect(highResult.details?.marginalRate).toBeGreaterThanOrEqual(lowResult.details?.marginalRate || 0);
    });
  });

  describe('New Jersey', () => {
    it('should calculate progressive tax with SDI', () => {
      const input = createInput('NJ');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.sdi).toBeGreaterThan(0);  // NJ has SDI
    });
  });

  describe('Georgia', () => {
    it('should calculate flat tax (GA moved to flat in 2024)', () => {
      const input = createInput('GA');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });
  });
});

describe('States with Special Programs', () => {
  const createInput = (state: string, overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state,
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  describe('Hawaii (TDI)', () => {
    it('should include TDI contribution', () => {
      const input = createInput('HI');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.sdi).toBeGreaterThan(0);  // HI has TDI
    });
  });

  describe('Rhode Island (TDI)', () => {
    it('should include TDI contribution', () => {
      const input = createInput('RI');
      const result = calculateStateTax(input);

      expect(result.sdi).toBeGreaterThan(0);  // RI has TDI
    });
  });

  describe('Massachusetts (PFML)', () => {
    it('should include PFML contribution', () => {
      const input = createInput('MA');
      const result = calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.sdi).toBeGreaterThan(0);  // MA has PFML
    });
  });
});

describe('Filing Status Variations', () => {
  const createInput = (state: string, filingStatus: string): StateTaxInput => ({
    state,
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus,
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
  });

  it('MARRIED_FILING_JOINTLY should have lower tax than SINGLE', () => {
    const singleResult = calculateStateTax(createInput('CA', 'SINGLE'));
    const marriedResult = calculateStateTax(createInput('CA', 'MARRIED_FILING_JOINTLY'));

    expect(marriedResult.incomeTax).toBeLessThan(singleResult.incomeTax);
  });

  it('HEAD_OF_HOUSEHOLD should have different brackets than SINGLE', () => {
    const singleResult = calculateStateTax(createInput('NY', 'SINGLE'));
    const hohResult = calculateStateTax(createInput('NY', 'HEAD_OF_HOUSEHOLD'));

    // HOH typically has more favorable brackets
    expect(hohResult.incomeTax).toBeLessThanOrEqual(singleResult.incomeTax);
  });
});

describe('Edge Cases', () => {
  it('should handle zero gross pay', () => {
    const input: StateTaxInput = {
      state: 'CA',
      grossPay: 0,
      annualIncome: 0,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
    };

    const result = calculateStateTax(input);

    expect(result.incomeTax).toBe(0);
    expect(result.sdi).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should handle very high income', () => {
    const input: StateTaxInput = {
      state: 'CA',
      grossPay: 500000,
      annualIncome: 6000000,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 12,
    };

    const result = calculateStateTax(input);

    // Should be in top 13.3% bracket
    expect(result.details?.marginalRate).toBe(13.3);
  });

  it('should default to SINGLE for unknown filing status', () => {
    const input: StateTaxInput = {
      state: 'CA',
      grossPay: 5000,
      annualIncome: 120000,
      filingStatus: 'UNKNOWN_STATUS',
      payPeriodsPerYear: 24,
    };

    const result = calculateStateTax(input);

    // Should still calculate without error
    expect(result.incomeTax).toBeGreaterThan(0);
  });
});
