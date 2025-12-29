/**
 * Payroll Calculator Integration Tests
 * Tests for the complete payroll calculation flow
 */

import { PayrollCalculator, PayrollInput } from '../payrollCalculator';

// Mock types for testing (avoid Prisma dependency in tests)
interface MockCompany {
  id: string;
  name: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  payFrequency: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  sutaRate: number | null;
  retirement401kMatchRate?: number | null;
  retirement401kMatchLimitPercent?: number | null;
}

interface MockEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  ssn: string;
  dateOfBirth: Date;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  payType: string;
  payRate: number;
  filingStatus: string;
  allowances: number;
  additionalWithholding: number;
  retirement401kType?: string | null;
  retirement401kRate?: number | null;
  retirement401kAmount?: number | null;
  bankName: string | null;
  accountType: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  companyId: string;
  hireDate: Date;
  terminationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  company: MockCompany;
}

describe('PayrollCalculator', () => {
  let calculator: PayrollCalculator;

  beforeEach(() => {
    calculator = new PayrollCalculator();
  });

  // Helper to create mock company
  const createMockCompany = (overrides: Partial<MockCompany> = {}): MockCompany => ({
    id: 'company-1',
    name: 'Test Company',
    ein: '12-3456789',
    address: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    payFrequency: 'SEMIMONTHLY',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    sutaRate: null,
    retirement401kMatchRate: null,
    retirement401kMatchLimitPercent: null,
    ...overrides,
  });

  // Helper to create mock employee with company
  const createMockEmployee = (
    employeeOverrides: Partial<MockEmployee> = {},
    companyOverrides: Partial<MockCompany> = {}
  ): MockEmployee => {
    const company = createMockCompany(companyOverrides);

    return {
      id: 'emp-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      ssn: '123-45-6789',
      dateOfBirth: new Date('1990-01-01'),
      address: '456 Oak Ave',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      phone: '555-1234',
      payType: 'SALARY',
      payRate: 120000,
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: 0,
      retirement401kType: null,
      retirement401kRate: null,
      retirement401kAmount: null,
      bankName: null,
      accountType: null,
      routingNumber: null,
      accountNumber: null,
      companyId: 'company-1',
      hireDate: new Date('2023-01-15'),
      terminationDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      company,
      ...employeeOverrides,
    };
  };

  const createPayrollInput = (
    employeeOverrides: Partial<MockEmployee> = {},
    companyOverrides: Partial<MockCompany> = {},
    inputOverrides: Partial<Omit<PayrollInput, 'employee'>> = {}
  ): PayrollInput => ({
    employee: createMockEmployee(employeeOverrides, companyOverrides) as unknown as PayrollInput['employee'],
    payPeriodStart: new Date('2024-01-01'),
    payPeriodEnd: new Date('2024-01-15'),
    ytdGrossWages: 0,
    ...inputOverrides,
  });

  describe('Salaried Employee Calculations', () => {
    it('should calculate semi-monthly salary correctly', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      // $120,000 / 24 pay periods = $5,000 per period
      expect(result.earnings.grossPay).toBe(5000);
      expect(result.earnings.regularPay).toBe(5000);
    });

    it('should calculate monthly salary correctly', () => {
      const input = createPayrollInput({}, { payFrequency: 'MONTHLY' });
      const result = calculator.calculate(input);

      // $120,000 / 12 pay periods = $10,000 per period
      expect(result.earnings.grossPay).toBe(10000);
    });

    it('should calculate bi-weekly salary correctly', () => {
      const input = createPayrollInput({}, { payFrequency: 'BIWEEKLY' });
      const result = calculator.calculate(input);

      // $120,000 / 26 pay periods = $4,615.38
      expect(result.earnings.grossPay).toBeCloseTo(4615.38, 0);
    });

    it('should include overtime for salaried employees', () => {
      const input = createPayrollInput({}, {}, { overtimeHours: 10 });
      const result = calculator.calculate(input);

      // Base pay + overtime
      expect(result.earnings.overtimePay).toBeGreaterThan(0);
      expect(result.earnings.grossPay).toBeGreaterThan(5000);
    });
  });

  describe('Hourly Employee Calculations', () => {
    it('should calculate regular hourly pay', () => {
      const input = createPayrollInput(
        { payType: 'HOURLY', payRate: 50 },
        {},
        { hoursWorked: 80 }
      );
      const result = calculator.calculate(input);

      expect(result.earnings.regularPay).toBe(4000);  // 80 * 50
      expect(result.earnings.grossPay).toBe(4000);
    });

    it('should calculate overtime at 1.5x rate', () => {
      const input = createPayrollInput(
        { payType: 'HOURLY', payRate: 50 },
        {},
        { hoursWorked: 80, overtimeHours: 10 }
      );
      const result = calculator.calculate(input);

      expect(result.earnings.regularPay).toBe(4000);  // 80 * 50
      expect(result.earnings.overtimePay).toBe(750);  // 10 * 50 * 1.5
      expect(result.earnings.grossPay).toBe(4750);
    });
  });

  describe('Bonus and Commission', () => {
    it('should include bonus in gross pay', () => {
      const input = createPayrollInput({}, {}, { bonus: 1000 });
      const result = calculator.calculate(input);

      expect(result.earnings.bonus).toBe(1000);
      expect(result.earnings.grossPay).toBe(6000);  // 5000 + 1000
    });

    it('should include commission in gross pay', () => {
      const input = createPayrollInput({}, {}, { commission: 500 });
      const result = calculator.calculate(input);

      expect(result.earnings.commission).toBe(500);
      expect(result.earnings.grossPay).toBe(5500);
    });

    it('should include both bonus and commission', () => {
      const input = createPayrollInput({}, {}, { bonus: 1000, commission: 500 });
      const result = calculator.calculate(input);

      expect(result.earnings.grossPay).toBe(6500);
    });
  });

  describe('Federal Tax Calculations', () => {
    it('should calculate federal income tax', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.taxes.federal.incomeTax).toBeGreaterThan(0);
    });

    it('should calculate Social Security tax at 6.2%', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.taxes.federal.socialSecurity).toBe(310);  // 5000 * 0.062
    });

    it('should calculate Medicare tax at 1.45%', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.taxes.federal.medicare).toBe(72.50);  // 5000 * 0.0145
    });

    it('should respect Social Security wage cap', () => {
      const input = createPayrollInput({}, {}, { ytdGrossWages: 165000 });
      const result = calculator.calculate(input);

      expect(result.taxes.federal.socialSecurity).toBe(223.20);  // 3600 * 0.062
    });

    it('should apply dependent credits', () => {
      const inputNoDeps = createPayrollInput();
      const inputWithDeps = createPayrollInput({ allowances: 2 });

      const resultNoDeps = calculator.calculate(inputNoDeps);
      const resultWithDeps = calculator.calculate(inputWithDeps);

      expect(resultWithDeps.taxes.federal.incomeTax).toBeLessThan(resultNoDeps.taxes.federal.incomeTax);
    });
  });

  describe('State Tax Calculations', () => {
    it('should calculate California state tax', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.taxes.state.incomeTax).toBeGreaterThan(0);
      expect(result.taxes.state.sdi).toBeGreaterThan(0);  // CA has SDI
    });

    it('should return zero tax for no-income-tax states', () => {
      const input = createPayrollInput({ state: 'TX' });
      const result = calculator.calculate(input);

      expect(result.taxes.state.incomeTax).toBe(0);
    });

    it('should handle different states', () => {
      const caInput = createPayrollInput({ state: 'CA' });
      const nyInput = createPayrollInput({ state: 'NY' });

      const caResult = calculator.calculate(caInput);
      const nyResult = calculator.calculate(nyInput);

      // Both should have state taxes but amounts differ
      expect(caResult.taxes.state.incomeTax).toBeGreaterThan(0);
      expect(nyResult.taxes.state.incomeTax).toBeGreaterThan(0);
    });
  });

  describe('Employer Tax Calculations', () => {
    it('should calculate FUTA', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.employerTaxes.futa).toBe(30);  // 5000 * 0.006
    });

    it('should calculate SUTA', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.employerTaxes.suta).toBeGreaterThan(0);
    });

    it('should calculate employer Social Security match', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.employerTaxes.socialSecurity).toBe(310);  // 5000 * 0.062
    });

    it('should calculate employer Medicare match', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.employerTaxes.medicare).toBe(72.50);  // 5000 * 0.0145
    });

    it('should use provided SUTA rate', () => {
      const input = createPayrollInput({}, {}, { sutaRate: 0.05 });
      const result = calculator.calculate(input);

      // SUTA should use the provided rate
      expect(result.employerTaxes.details.sutaRate).toBeCloseTo(0.05, 2);
    });
  });

  describe('401(k) Deductions', () => {
    it('should calculate percent-based 401(k) contribution', () => {
      const baseResult = calculator.calculate(createPayrollInput());
      const input = createPayrollInput({
        retirement401kType: 'PERCENT',
        retirement401kRate: 5
      });
      const result = calculator.calculate(input);

      expect(result.retirement401k).toBe(250); // 5% of $5000
      expect(result.totalDeductions).toBeCloseTo(baseResult.totalDeductions + 250, 2);
      expect(result.netPay).toBeCloseTo(result.earnings.grossPay - result.totalDeductions, 2);
    });

    it('should calculate flat 401(k) contribution', () => {
      const baseResult = calculator.calculate(createPayrollInput());
      const input = createPayrollInput({
        retirement401kType: 'FIXED',
        retirement401kAmount: 150
      });
      const result = calculator.calculate(input);

      expect(result.retirement401k).toBe(150);
      expect(result.totalDeductions).toBeCloseTo(baseResult.totalDeductions + 150, 2);
      expect(result.netPay).toBeCloseTo(result.earnings.grossPay - result.totalDeductions, 2);
    });

    it('should calculate employer match based on employee contribution', () => {
      const input = createPayrollInput(
        { retirement401kType: 'PERCENT', retirement401kRate: 5 },
        { retirement401kMatchRate: 50, retirement401kMatchLimitPercent: 6 }
      );
      const result = calculator.calculate(input);

      // Employee: 5% of $5000 = $250; Match: 50% = $125
      expect(result.employer401kMatch).toBe(125);
      expect(result.totalEmployerCost).toBeCloseTo(
        result.earnings.grossPay + result.employerTaxes.total + result.employer401kMatch,
        2
      );
    });

    it('should cap employer match using the match limit percent', () => {
      const input = createPayrollInput(
        { retirement401kType: 'PERCENT', retirement401kRate: 10 },
        { retirement401kMatchRate: 50, retirement401kMatchLimitPercent: 6 }
      );
      const result = calculator.calculate(input);

      // Employee: 10% of $5000 = $500; Eligible capped at 6% = $300; Match 50% = $150
      expect(result.employer401kMatch).toBe(150);
    });
  });

  describe('Net Pay Calculation', () => {
    it('should calculate net pay correctly', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      const expectedDeductions =
        result.taxes.federal.incomeTax +
        result.taxes.federal.socialSecurity +
        result.taxes.federal.medicare +
        result.taxes.state.incomeTax +
        result.taxes.state.sdi +
        result.taxes.state.sui;

      expect(result.totalDeductions).toBeCloseTo(expectedDeductions, 2);
      expect(result.netPay).toBeCloseTo(result.earnings.grossPay - result.totalDeductions, 2);
    });

    it('should add reimbursements to total pay', () => {
      const input = createPayrollInput({}, {}, { reimbursements: 200 });
      const result = calculator.calculate(input);

      expect(result.reimbursements).toBe(200);
      expect(result.totalPay).toBe(result.netPay + 200);
    });
  });

  describe('Total Employer Cost', () => {
    it('should calculate total employer cost', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.totalEmployerCost).toBe(
        result.earnings.grossPay + result.employerTaxes.total + result.employer401kMatch
      );
    });

    it('should be higher than gross pay', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.totalEmployerCost).toBeGreaterThan(result.earnings.grossPay);
    });
  });

  describe('Pay Period Information', () => {
    it('should include correct pay period dates', () => {
      const input = createPayrollInput({}, {}, {
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-15'),
      });
      const result = calculator.calculate(input);

      expect(result.payPeriod.start).toEqual(new Date('2024-01-01'));
      expect(result.payPeriod.end).toEqual(new Date('2024-01-15'));
    });

    it('should include employee information', () => {
      const input = createPayrollInput();
      const result = calculator.calculate(input);

      expect(result.employee.id).toBe('emp-1');
      expect(result.employee.name).toBe('John Doe');
    });
  });

  describe('Filing Status Variations', () => {
    const filingStatuses = ['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD'];

    filingStatuses.forEach(status => {
      it(`should calculate taxes for ${status}`, () => {
        const input = createPayrollInput({ filingStatus: status });
        const result = calculator.calculate(input);

        expect(result.taxes.federal.incomeTax).toBeGreaterThanOrEqual(0);
      });
    });

    it('MARRIED_FILING_JOINTLY should have lower tax than SINGLE', () => {
      const singleInput = createPayrollInput({ filingStatus: 'SINGLE' });
      const marriedInput = createPayrollInput({ filingStatus: 'MARRIED_FILING_JOINTLY' });

      const singleResult = calculator.calculate(singleInput);
      const marriedResult = calculator.calculate(marriedInput);

      expect(marriedResult.taxes.federal.incomeTax).toBeLessThan(singleResult.taxes.federal.incomeTax);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero pay', () => {
      const input = createPayrollInput(
        { payType: 'HOURLY', payRate: 0 },
        {},
        { hoursWorked: 0 }
      );
      const result = calculator.calculate(input);

      expect(result.earnings.grossPay).toBe(0);
      expect(result.netPay).toBe(0);
      expect(result.totalDeductions).toBe(0);
    });

    it('should handle very high income', () => {
      const input = createPayrollInput({ payRate: 2400000 });  // $2.4M/year
      const result = calculator.calculate(input);

      // $100,000 per period
      expect(result.earnings.grossPay).toBe(100000);
      expect(result.taxes.federal.incomeTax).toBeGreaterThan(0);
    });

    it('should handle YTD wages at all caps', () => {
      const input = createPayrollInput({}, {}, { ytdGrossWages: 200000 });
      const result = calculator.calculate(input);

      expect(result.taxes.federal.socialSecurity).toBe(0);  // Past SS cap
      expect(result.taxes.state.sdi).toBe(0);  // Past CA SDI cap
      expect(result.employerTaxes.futa).toBe(0);  // Past FUTA cap
    });
  });
});
