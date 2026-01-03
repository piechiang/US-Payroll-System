/**
 * State Tax Calculator Unit Tests
 * Tests for various state tax calculations
 *
 * NOTE: Since calculateStateTax and calculateCaliforniaTax are now async,
 * all tests must use async/await
 */

import { calculateStateTax, isStateSupported, getSupportedStates, StateTaxInput, UnsupportedStateError } from '../state/index';
import { calculateCaliforniaTax, getCaliforniaTaxInfo } from '../state/california';

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
    it('should route to California calculator for CA', async () => {
      const input = createInput({ state: 'CA' });
      const result = await calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.sdi).toBeGreaterThan(0);  // CA has SDI
    });

    it('should route to New York calculator for NY', async () => {
      const input = createInput({ state: 'NY' });
      const result = await calculateStateTax(input);

      expect(result.incomeTax).toBeGreaterThan(0);
    });

    it('should route to Texas calculator (no income tax)', async () => {
      const input = createInput({ state: 'TX' });
      const result = await calculateStateTax(input);

      expect(result.incomeTax).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should route to Florida calculator (no income tax)', async () => {
      const input = createInput({ state: 'FL' });
      const result = await calculateStateTax(input);

      expect(result.incomeTax).toBe(0);
    });

    it('should throw UnsupportedStateError for invalid state code', async () => {
      const input = createInput({ state: 'XX' });

      await expect(calculateStateTax(input)).rejects.toThrow(UnsupportedStateError);
      await expect(calculateStateTax(input)).rejects.toThrow(/not supported/);
    });
  });

  describe('No Income Tax States', () => {
    const noTaxStates = ['AK', 'FL', 'NV', 'SD', 'TX', 'WA', 'WY', 'NH', 'TN'];

    noTaxStates.forEach(state => {
      it(`should return zero income tax for ${state}`, async () => {
        const input = createInput({ state });
        const result = await calculateStateTax(input);

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
    });
  });
});

describe('California State Tax', () => {
  const createCAInput = (overrides: Partial<StateTaxInput> = {}): StateTaxInput => ({
    state: 'CA',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    ytdGrossWages: 0,
    ...overrides,
  });

  it('should calculate income tax for single filer', async () => {
    const input = createCAInput();
    const result = await calculateCaliforniaTax(input);

    expect(result.incomeTax).toBeGreaterThan(0);
    expect(result.sdi).toBeGreaterThan(0);
    expect(result.details?.marginalRate).toBeGreaterThan(0);
  });

  it('should handle different filing statuses', async () => {
    const singleInput = createCAInput({ filingStatus: 'SINGLE' });
    const marriedInput = createCAInput({ filingStatus: 'MARRIED_FILING_JOINTLY' });

    const singleResult = await calculateCaliforniaTax(singleInput);
    const marriedResult = await calculateCaliforniaTax(marriedInput);

    // Married filing jointly should have lower tax due to higher brackets
    expect(singleResult.incomeTax).toBeGreaterThan(marriedResult.incomeTax);
  });

  it('should calculate SDI correctly', async () => {
    const input = createCAInput({ grossPay: 5000 });
    const result = await calculateCaliforniaTax(input, 2024);

    // 2024 SDI rate is 0.9% (0.009)
    const expectedSDI = Math.round(5000 * 0.009 * 100) / 100;
    expect(result.sdi).toBe(expectedSDI);
  });

  it('should stop SDI withholding at wage cap', async () => {
    // 2024 SDI wage cap is $153,164
    const input = createCAInput({
      grossPay: 5000,
      ytdGrossWages: 153000  // Near the cap
    });
    const result = await calculateCaliforniaTax(input, 2024);

    // Should only withhold on remaining $164 ($153,164 - $153,000)
    const expectedSDI = Math.round(164 * 0.009 * 100) / 100;
    expect(result.sdi).toBe(expectedSDI);
  });

  it('should not withhold SDI after wage cap', async () => {
    // Already exceeded 2024 wage cap
    const input = createCAInput({
      grossPay: 5000,
      ytdGrossWages: 160000  // Above cap
    });
    const result = await calculateCaliforniaTax(input, 2024);

    expect(result.sdi).toBe(0);
  });

  it('should return correct config year in details', async () => {
    const input = createCAInput();
    const result = await calculateCaliforniaTax(input, 2024);

    expect(result.details?.configYear).toBe(2024);
  });
});

describe('California Tax Info', () => {
  it('should return 2024 tax configuration', async () => {
    const info = await getCaliforniaTaxInfo(2024);

    expect(info.year).toBe(2024);
    expect(info.sdiRate).toBe(0.009);
    expect(info.sdiWageCap).toBe(153164);
    expect(info.standardDeductions.SINGLE).toBe(5363);
  });
});
