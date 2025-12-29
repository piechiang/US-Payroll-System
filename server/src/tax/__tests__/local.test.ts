/**
 * Local/City Tax Calculator Unit Tests
 * Tests for various city and county income taxes
 */

import {
  calculateLocalTax,
  hasLocalTax,
  getCitiesWithLocalTax,
  LocalTaxInput
} from '../local/index';
import { calculateNYCTax } from '../local/nyc';
import { calculatePhiladelphiaTax } from '../local/philadelphia';
import { calculateDetroitTax } from '../local/detroit';
import { calculateOhioCityTax } from '../local/ohio-cities';
import { calculateBaltimoreTax } from '../local/baltimore';
import { calculateStLouisTax } from '../local/stlouis';
import { calculateKansasCityTax } from '../local/kansascity';
import { calculateWilmingtonTax } from '../local/wilmington';
import { calculatePittsburghTax } from '../local/pittsburgh';

describe('Local Tax Router', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'New York City',
    state: 'NY',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  describe('calculateLocalTax routing', () => {
    it('should route to NYC calculator', () => {
      const input = createInput({ city: 'NYC', state: 'NY' });
      const result = calculateLocalTax(input);

      expect(result.cityTax).toBeGreaterThan(0);
      expect(result.details.cityName).toBe('New York City');
    });

    it('should route to Philadelphia calculator', () => {
      const input = createInput({ city: 'Philadelphia', state: 'PA' });
      const result = calculateLocalTax(input);

      expect(result.cityTax).toBeGreaterThan(0);
    });

    it('should route to Detroit calculator', () => {
      const input = createInput({ city: 'Detroit', state: 'MI' });
      const result = calculateLocalTax(input);

      expect(result.cityTax).toBeGreaterThan(0);
    });

    it('should route to Cleveland calculator', () => {
      const input = createInput({ city: 'Cleveland', state: 'OH' });
      const result = calculateLocalTax(input);

      expect(result.cityTax).toBeGreaterThan(0);
    });

    it('should return zero for city without local tax', () => {
      const input = createInput({ city: 'Los Angeles', state: 'CA' });
      const result = calculateLocalTax(input);

      expect(result.total).toBe(0);
    });

    it('should calculate Maryland county tax for non-Baltimore city', () => {
      const input = createInput({
        city: 'Rockville',
        state: 'MD',
        county: 'Montgomery',
        isResident: true
      });
      const result = calculateLocalTax(input);

      expect(result.total).toBe(160); // 5000 * 0.032
    });
  });

  describe('hasLocalTax', () => {
    it('should return true for NYC', () => {
      expect(hasLocalTax('NYC', 'NY')).toBe(true);
    });

    it('should return true for Philadelphia', () => {
      expect(hasLocalTax('Philadelphia', 'PA')).toBe(true);
    });

    it('should return false for Los Angeles', () => {
      expect(hasLocalTax('Los Angeles', 'CA')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(hasLocalTax('PHILADELPHIA', 'PA')).toBe(true);
      expect(hasLocalTax('philadelphia', 'PA')).toBe(true);
    });
  });

  describe('getCitiesWithLocalTax', () => {
    it('should return array of cities', () => {
      const cities = getCitiesWithLocalTax();
      expect(Array.isArray(cities)).toBe(true);
      expect(cities.length).toBeGreaterThan(0);
    });

    it('should include major cities', () => {
      const cities = getCitiesWithLocalTax();
      expect(cities).toContain('NYC');
      expect(cities).toContain('PHILADELPHIA');
      expect(cities).toContain('DETROIT');
      expect(cities).toContain('CLEVELAND');
    });
  });
});

describe('NYC Tax Calculator', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'New York City',
    state: 'NY',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  describe('Resident Tax', () => {
    it('should calculate progressive tax for SINGLE resident', () => {
      const input = createInput({ isResident: true });
      const result = calculateNYCTax(input);

      expect(result.cityTax).toBeGreaterThan(0);
      expect(result.details.isResident).toBe(true);
    });

    it('should calculate less tax for MARRIED_FILING_JOINTLY', () => {
      const singleInput = createInput({ filingStatus: 'SINGLE' });
      const marriedInput = createInput({ filingStatus: 'MARRIED_FILING_JOINTLY' });

      const singleResult = calculateNYCTax(singleInput);
      const marriedResult = calculateNYCTax(marriedInput);

      expect(marriedResult.cityTax).toBeLessThan(singleResult.cityTax);
    });
  });

  describe('Non-Resident Tax', () => {
    it('should return zero tax for non-residents', () => {
      const input = createInput({ isResident: false });
      const result = calculateNYCTax(input);

      expect(result.cityTax).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('Yonkers Tax', () => {
    it('should calculate Yonkers resident surcharge', () => {
      const input = createInput({
        city: 'Yonkers',
        isResident: true
      });
      const result = calculateNYCTax(input);

      expect(result.otherLocalTax).toBeGreaterThan(0);
      expect(result.details.cityName).toBe('Yonkers');
    });

    it('should calculate Yonkers non-resident tax', () => {
      const input = createInput({
        city: 'Yonkers',
        isResident: false
      });
      const result = calculateNYCTax(input);

      // 0.5% of wages for non-residents working in Yonkers
      // Since calculateNYCTax handles Yonkers directly
      expect(result.otherLocalTax).toBeGreaterThanOrEqual(0);
      expect(result.details.cityName).toBe('Yonkers');
    });
  });
});

describe('Philadelphia Tax Calculator', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'Philadelphia',
    state: 'PA',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  it('should calculate 3.75% for residents', () => {
    const input = createInput({ isResident: true });
    const result = calculatePhiladelphiaTax(input);

    expect(result.cityTax).toBe(187.50);  // 5000 * 0.0375
    expect(result.details.rate).toBe(3.75);
  });

  it('should calculate 3.44% for non-residents working in Philly', () => {
    const input = createInput({
      isResident: false,
      workCity: 'Philadelphia'
    });
    const result = calculatePhiladelphiaTax(input);

    expect(result.cityTax).toBe(172);  // 5000 * 0.0344
    expect(result.details.rate).toBe(3.44);
  });

  it('should return zero for non-residents working outside Philly', () => {
    const input = createInput({
      isResident: false,
      workCity: 'Reading'
    });
    const result = calculatePhiladelphiaTax(input);

    expect(result.cityTax).toBe(0);
  });
});

describe('Detroit/Michigan City Tax', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'Detroit',
    state: 'MI',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  it('should calculate 2.4% for Detroit residents', () => {
    const input = createInput({ isResident: true });
    const result = calculateDetroitTax(input);

    expect(result.cityTax).toBe(120);  // 5000 * 0.024
    expect(result.details.rate).toBe(2.4);
  });

  it('should calculate 1.2% for Detroit non-residents', () => {
    const input = createInput({
      isResident: false,
      workCity: 'Detroit'
    });
    const result = calculateDetroitTax(input);

    expect(result.cityTax).toBe(60);  // 5000 * 0.012
    expect(result.details.rate).toBe(1.2);
  });

  it('should calculate 1.5% for Grand Rapids residents', () => {
    const input = createInput({
      city: 'Grand Rapids',
      isResident: true
    });
    const result = calculateDetroitTax(input);

    expect(result.cityTax).toBe(75);  // 5000 * 0.015
  });
});

describe('Ohio City Tax', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'Cleveland',
    state: 'OH',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  it('should calculate 2.5% for Cleveland', () => {
    const input = createInput({ city: 'Cleveland' });
    const result = calculateOhioCityTax(input);

    expect(result.cityTax).toBe(125);  // 5000 * 0.025
    expect(result.details.rate).toBe(2.5);
  });

  it('should calculate 2.5% for Columbus', () => {
    const input = createInput({ city: 'Columbus' });
    const result = calculateOhioCityTax(input);

    expect(result.cityTax).toBe(125);
  });

  it('should calculate 1.8% for Cincinnati', () => {
    const input = createInput({ city: 'Cincinnati' });
    const result = calculateOhioCityTax(input);

    expect(result.cityTax).toBe(90);  // 5000 * 0.018
  });

  it('should calculate 2.75% for Youngstown', () => {
    const input = createInput({ city: 'Youngstown' });
    const result = calculateOhioCityTax(input);

    expect(result.cityTax).toBe(137.50);  // 5000 * 0.0275
  });
});

describe('Baltimore/Maryland Local Tax', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'Baltimore',
    state: 'MD',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  it('should calculate 3.2% for Baltimore City residents', () => {
    const input = createInput({ isResident: true });
    const result = calculateBaltimoreTax(input);

    expect(result.cityTax).toBe(160);  // 5000 * 0.032
    expect(result.details.rate).toBe(3.2);
  });

  it('should return zero for non-residents', () => {
    const input = createInput({ isResident: false });
    const result = calculateBaltimoreTax(input);

    expect(result.total).toBe(0);
  });

  it('should calculate county tax for Montgomery County', () => {
    const input = createInput({
      city: 'Bethesda',
      county: 'Montgomery',
      isResident: true
    });
    const result = calculateBaltimoreTax(input);

    expect(result.countyTax).toBe(160);  // 5000 * 0.032
  });
});

describe('Missouri City Taxes', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'St. Louis',
    state: 'MO',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  describe('St. Louis', () => {
    it('should calculate 1% earnings tax for residents', () => {
      const input = createInput({ isResident: true });
      const result = calculateStLouisTax(input);

      expect(result.cityTax).toBe(50);  // 5000 * 0.01
      expect(result.details.rate).toBe(1);
    });

    it('should calculate 1% for non-residents working in city', () => {
      const input = createInput({
        isResident: false,
        workCity: 'St. Louis'
      });
      const result = calculateStLouisTax(input);

      expect(result.cityTax).toBe(50);
    });
  });

  describe('Kansas City', () => {
    it('should calculate 1% earnings tax', () => {
      const input: LocalTaxInput = {
        city: 'Kansas City',
        state: 'MO',
        grossPay: 5000,
        annualIncome: 120000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
        isResident: true
      };
      const result = calculateKansasCityTax(input);

      expect(result.cityTax).toBe(50);  // 5000 * 0.01
    });

    it('should return zero for Kansas City, KS', () => {
      const input: LocalTaxInput = {
        city: 'Kansas City',
        state: 'KS',  // Kansas, not Missouri
        grossPay: 5000,
        annualIncome: 120000,
        filingStatus: 'SINGLE',
        payPeriodsPerYear: 24,
        isResident: true
      };
      const result = calculateKansasCityTax(input);

      expect(result.cityTax).toBe(0);
    });
  });
});

describe('Wilmington Tax', () => {
  it('should calculate 1.25% for residents', () => {
    const input: LocalTaxInput = {
      city: 'Wilmington',
      state: 'DE',
      grossPay: 5000,
      annualIncome: 120000,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
      isResident: true
    };
    const result = calculateWilmingtonTax(input);

    expect(result.cityTax).toBe(62.50);  // 5000 * 0.0125
    expect(result.details.rate).toBe(1.25);
  });

  it('should calculate 1.25% for non-residents working in Wilmington', () => {
    const input: LocalTaxInput = {
      city: 'Wilmington',
      state: 'DE',
      grossPay: 5000,
      annualIncome: 120000,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
      isResident: false,
      workCity: 'Wilmington'
    };
    const result = calculateWilmingtonTax(input);

    expect(result.cityTax).toBe(62.50);
  });
});

describe('Pittsburgh/PA Local Tax', () => {
  const createInput = (overrides: Partial<LocalTaxInput> = {}): LocalTaxInput => ({
    city: 'Pittsburgh',
    state: 'PA',
    grossPay: 5000,
    annualIncome: 120000,
    filingStatus: 'SINGLE',
    payPeriodsPerYear: 24,
    isResident: true,
    ...overrides,
  });

  it('should calculate 3% EIT for Pittsburgh residents', () => {
    const input = createInput({ isResident: true });
    const result = calculatePittsburghTax(input);

    expect(result.cityTax).toBe(150);  // 5000 * 0.03
    expect(result.details.rate).toBe(3);
  });

  it('should include LST for higher earners', () => {
    const input = createInput({
      isResident: true,
      payPeriodsPerYear: 24,
      grossPay: 5000
    });
    const result = calculatePittsburghTax(input);

    // $52/year / 24 periods = ~$2.17 per period
    expect(result.otherLocalTax).toBeCloseTo(2.17, 1);
  });

  it('should calculate different rate for Scranton', () => {
    const input = createInput({
      city: 'Scranton',
      isResident: true
    });
    const result = calculatePittsburghTax(input);

    expect(result.cityTax).toBe(170);  // 5000 * 0.034
  });
});

describe('Edge Cases', () => {
  it('should handle zero gross pay', () => {
    const input: LocalTaxInput = {
      city: 'NYC',
      state: 'NY',
      grossPay: 0,
      annualIncome: 0,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
      isResident: true
    };
    const result = calculateLocalTax(input);

    expect(result.cityTax).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should handle unknown city gracefully', () => {
    const input: LocalTaxInput = {
      city: 'Unknown City',
      state: 'XX',
      grossPay: 5000,
      annualIncome: 120000,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
      isResident: true
    };
    const result = calculateLocalTax(input);

    expect(result.total).toBe(0);
  });

  it('should be case insensitive for city names', () => {
    const upperInput: LocalTaxInput = {
      city: 'PHILADELPHIA',
      state: 'PA',
      grossPay: 5000,
      annualIncome: 120000,
      filingStatus: 'SINGLE',
      payPeriodsPerYear: 24,
      isResident: true
    };
    const lowerInput: LocalTaxInput = {
      ...upperInput,
      city: 'philadelphia'
    };

    const upperResult = calculateLocalTax(upperInput);
    const lowerResult = calculateLocalTax(lowerInput);

    expect(upperResult.cityTax).toBe(lowerResult.cityTax);
  });
});
