/**
 * Employer Tax Calculator Unit Tests
 * Tests for FUTA, SUTA, and employer FICA calculations
 */

import {
  calculateEmployerTax,
  getSUTAConfig,
  getStatesWithSUTA,
  EmployerTaxInput,
  SUTA_RATES_2024,
  EMPLOYER_TAX_INFO
} from '../employerTax';

describe('Employer Tax Calculator', () => {
  // Helper to create test input
  const createInput = (overrides: Partial<EmployerTaxInput> = {}): EmployerTaxInput => ({
    grossPay: 5000,
    state: 'CA',
    ytdGrossWages: 0,
    isNewEmployer: true,
    ...overrides,
  });

  describe('FUTA Calculation', () => {
    const FUTA_EFFECTIVE_RATE = 0.006;  // 0.6%
    const FUTA_WAGE_CAP = 7000;

    it('should calculate 0.6% on wages up to $7,000', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 0,
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(30);  // 5000 * 0.006
      expect(result.details.futaWages).toBe(5000);
    });

    it('should respect $7,000 wage cap', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 5000,  // Only $2000 left before cap
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(12);  // 2000 * 0.006
      expect(result.details.futaWages).toBe(2000);
    });

    it('should return zero when cap already reached', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 7000,  // Already at cap
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(0);
      expect(result.details.futaWages).toBe(0);
    });

    it('should return zero when past cap', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 10000,  // Past cap
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(0);
    });

    it('should cap wages at first $7,000', () => {
      const input = createInput({
        grossPay: 10000,
        ytdGrossWages: 0,
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(42);  // 7000 * 0.006 (only first $7k taxed)
      expect(result.details.futaWages).toBe(7000);
    });
  });

  describe('SUTA Calculation', () => {
    describe('California', () => {
      const CA_CONFIG = SUTA_RATES_2024.CA;

      it('should use new employer rate when isNewEmployer is true', () => {
        const input = createInput({
          state: 'CA',
          grossPay: 5000,
          ytdGrossWages: 0,
          isNewEmployer: true,
        });

        const result = calculateEmployerTax(input);

        expect(result.details.sutaRate).toBe(CA_CONFIG.newEmployerRate);
        expect(result.suta).toBe(Math.round(5000 * CA_CONFIG.newEmployerRate * 100) / 100);
      });

      it('should use provided sutaRate when specified', () => {
        const customRate = 0.025;
        const input = createInput({
          state: 'CA',
          grossPay: 5000,
          sutaRate: customRate,
        });

        const result = calculateEmployerTax(input);

        expect(result.details.sutaRate).toBe(customRate);
        expect(result.suta).toBe(125);  // 5000 * 0.025
      });

      it('should clamp sutaRate to min/max range', () => {
        // Below min
        const lowInput = createInput({
          state: 'CA',
          sutaRate: 0.001,  // Below CA min of 0.015
        });
        const lowResult = calculateEmployerTax(lowInput);
        expect(lowResult.details.sutaRate).toBe(CA_CONFIG.minRate);

        // Above max
        const highInput = createInput({
          state: 'CA',
          sutaRate: 0.10,  // Above CA max of 0.062
        });
        const highResult = calculateEmployerTax(highInput);
        expect(highResult.details.sutaRate).toBe(CA_CONFIG.maxRate);
      });

      it('should respect CA wage base of $7,000', () => {
        const input = createInput({
          state: 'CA',
          grossPay: 5000,
          ytdGrossWages: 5000,  // Only $2000 left before cap
        });

        const result = calculateEmployerTax(input);

        expect(result.details.sutaWages).toBe(2000);
      });
    });

    describe('Washington (high wage base)', () => {
      const WA_CONFIG = SUTA_RATES_2024.WA;  // $68,500 wage base

      it('should respect WA high wage base', () => {
        const input = createInput({
          state: 'WA',
          grossPay: 10000,
          ytdGrossWages: 60000,  // $8,500 left before WA cap
        });

        const result = calculateEmployerTax(input);

        expect(result.details.sutaWages).toBe(8500);
      });

      it('should have higher SUTA for WA with high wage base', () => {
        const caInput = createInput({
          state: 'CA',
          grossPay: 50000,
          ytdGrossWages: 0,
        });

        const waInput = createInput({
          state: 'WA',
          grossPay: 50000,
          ytdGrossWages: 0,
        });

        const caResult = calculateEmployerTax(caInput);
        const waResult = calculateEmployerTax(waInput);

        // WA has $68,500 wage base vs CA $7,000
        expect(waResult.details.sutaWages).toBeGreaterThan(caResult.details.sutaWages);
      });
    });

    describe('Default configuration', () => {
      it('should use default config for unknown state', () => {
        const input = createInput({
          state: 'XX',  // Unknown state
          grossPay: 5000,
        });

        const result = calculateEmployerTax(input);

        // Default wage base is $7,000
        expect(result.details.sutaWages).toBeLessThanOrEqual(7000);
        expect(result.suta).toBeGreaterThan(0);
      });
    });
  });

  describe('Employer FICA', () => {
    const SS_RATE = 0.062;
    const MEDICARE_RATE = 0.0145;
    const SS_WAGE_CAP = 168600;

    describe('Social Security', () => {
      it('should calculate 6.2% employer match', () => {
        const input = createInput({
          grossPay: 5000,
          ytdGrossWages: 0,
        });

        const result = calculateEmployerTax(input);

        expect(result.socialSecurity).toBe(310);  // 5000 * 0.062
      });

      it('should respect SS wage cap of $168,600', () => {
        const input = createInput({
          grossPay: 10000,
          ytdGrossWages: 165000,  // Only $3600 left before cap
        });

        const result = calculateEmployerTax(input);

        expect(result.socialSecurity).toBe(223.20);  // 3600 * 0.062
      });

      it('should return zero when past wage cap', () => {
        const input = createInput({
          grossPay: 5000,
          ytdGrossWages: 170000,  // Past cap
        });

        const result = calculateEmployerTax(input);

        expect(result.socialSecurity).toBe(0);
      });
    });

    describe('Medicare', () => {
      it('should calculate 1.45% employer match', () => {
        const input = createInput({
          grossPay: 5000,
        });

        const result = calculateEmployerTax(input);

        expect(result.medicare).toBe(72.50);  // 5000 * 0.0145
      });

      it('should have no wage cap for Medicare', () => {
        const input = createInput({
          grossPay: 50000,
          ytdGrossWages: 500000,  // Way past SS cap
        });

        const result = calculateEmployerTax(input);

        expect(result.medicare).toBe(725);  // 50000 * 0.0145
      });

      it('should NOT include additional Medicare tax (employee only)', () => {
        // Additional Medicare is only for employees, not employers
        const input = createInput({
          grossPay: 10000,
          ytdGrossWages: 200000,  // Over additional Medicare threshold
        });

        const result = calculateEmployerTax(input);

        // Just regular 1.45%, no additional
        expect(result.medicare).toBe(145);  // 10000 * 0.0145
      });
    });
  });

  describe('Total Calculation', () => {
    it('should sum all employer taxes correctly', () => {
      const input = createInput({
        grossPay: 5000,
        ytdGrossWages: 0,
      });

      const result = calculateEmployerTax(input);

      const expectedTotal = result.futa + result.suta + result.socialSecurity + result.medicare;
      expect(result.total).toBeCloseTo(expectedTotal, 2);
    });

    it('should round total to 2 decimal places', () => {
      const input = createInput({
        grossPay: 3333.33,
      });

      const result = calculateEmployerTax(input);

      expect(result.total).toBe(Math.round(result.total * 100) / 100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero gross pay', () => {
      const input = createInput({
        grossPay: 0,
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(0);
      expect(result.suta).toBe(0);
      expect(result.socialSecurity).toBe(0);
      expect(result.medicare).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle undefined ytdGrossWages', () => {
      const input: EmployerTaxInput = {
        grossPay: 5000,
        state: 'CA',
        // ytdGrossWages not provided
      };

      const result = calculateEmployerTax(input);

      // Should default to 0 YTD
      expect(result.futa).toBe(30);  // Full $5000 subject to FUTA
    });

    it('should handle very high wages', () => {
      const input = createInput({
        grossPay: 100000,
        ytdGrossWages: 200000,  // Past all caps except Medicare
      });

      const result = calculateEmployerTax(input);

      expect(result.futa).toBe(0);  // Past $7k cap
      expect(result.suta).toBe(0);  // Past state wage base
      expect(result.socialSecurity).toBe(0);  // Past $168,600 cap
      expect(result.medicare).toBe(1450);  // No cap
    });
  });
});

describe('getSUTAConfig', () => {
  it('should return correct config for California', () => {
    const config = getSUTAConfig('CA');

    expect(config.wageBase).toBe(7000);
    expect(config.newEmployerRate).toBe(0.034);
  });

  it('should return correct config for high wage base states', () => {
    const waConfig = getSUTAConfig('WA');
    expect(waConfig.wageBase).toBe(68500);

    const njConfig = getSUTAConfig('NJ');
    expect(njConfig.wageBase).toBe(42300);
  });

  it('should return default config for unknown state', () => {
    const config = getSUTAConfig('XX');

    expect(config.wageBase).toBe(7000);
    expect(config.newEmployerRate).toBe(0.027);
  });
});

describe('getStatesWithSUTA', () => {
  it('should return array of state codes', () => {
    const states = getStatesWithSUTA();

    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
  });

  it('should include major states', () => {
    const states = getStatesWithSUTA();

    expect(states).toContain('CA');
    expect(states).toContain('NY');
    expect(states).toContain('TX');
    expect(states).toContain('FL');
  });

  it('should match SUTA_RATES_2024 keys', () => {
    const states = getStatesWithSUTA();
    const configKeys = Object.keys(SUTA_RATES_2024);

    expect(states).toEqual(expect.arrayContaining(configKeys));
    expect(states.length).toBe(configKeys.length);
  });
});

describe('EMPLOYER_TAX_INFO constants', () => {
  it('should have correct FUTA rates', () => {
    expect(EMPLOYER_TAX_INFO.futaRate).toBe(0.06);
    expect(EMPLOYER_TAX_INFO.futaEffectiveRate).toBe(0.006);
    expect(EMPLOYER_TAX_INFO.futaWageCap).toBe(7000);
  });

  it('should have correct employer FICA rates', () => {
    expect(EMPLOYER_TAX_INFO.employerSsRate).toBe(0.062);
    expect(EMPLOYER_TAX_INFO.employerMedicareRate).toBe(0.0145);
    expect(EMPLOYER_TAX_INFO.ssWageCap).toBe(168600);
  });

  it('should export SUTA rates', () => {
    expect(EMPLOYER_TAX_INFO.sutaRates).toBeDefined();
    expect(EMPLOYER_TAX_INFO.sutaRates.CA).toBeDefined();
  });
});

describe('State-specific SUTA Variations', () => {
  const states = Object.keys(SUTA_RATES_2024);

  states.forEach(state => {
    it(`should have valid SUTA config for ${state}`, () => {
      const config = SUTA_RATES_2024[state];

      expect(config.wageBase).toBeGreaterThan(0);
      expect(config.newEmployerRate).toBeGreaterThanOrEqual(0);
      expect(config.minRate).toBeLessThanOrEqual(config.maxRate);
      expect(config.newEmployerRate).toBeGreaterThanOrEqual(config.minRate);
      expect(config.newEmployerRate).toBeLessThanOrEqual(config.maxRate);
    });
  });

  it('should have varying wage bases across states', () => {
    const wageBases = states.map(s => SUTA_RATES_2024[s].wageBase);
    const uniqueWageBases = new Set(wageBases);

    // Different states should have different wage bases
    expect(uniqueWageBases.size).toBeGreaterThan(1);
  });
});
