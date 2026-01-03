import { describe, it, expect, beforeEach } from '@jest/globals';
import { PayrollCalculator } from '../payrollCalculator.js';
import { Employee, Company, Garnishment } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('PayrollCalculator - Integration Tests', () => {
  let calculator: PayrollCalculator;
  let mockCompany: Company;
  let mockEmployee: Employee;

  beforeEach(() => {
    calculator = new PayrollCalculator();

    mockCompany = {
      id: 'company-1',
      name: 'Test Company',
      ein: '12-3456789',
      address: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      phone: '555-0100',
      email: 'test@company.com',
      payFrequency: 'BIWEEKLY',
      retirement401kMatchRate: new Decimal(50), // 50% match
      retirement401kMatchLimitPercent: new Decimal(6), // Match up to 6% of salary
      createdAt: new Date(),
      updatedAt: new Date()
    } as Company;

    mockEmployee = {
      id: 'emp-1',
      companyId: 'company-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      ssn: 'encrypted-ssn',
      ssnHash: 'hash',
      dateOfBirth: new Date('1990-01-15'),
      hireDate: new Date('2020-01-01'),
      terminationDate: null,
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      isActive: true,
      payType: 'SALARY',
      payRate: new Decimal(104000), // $104k annual
      filingStatus: 'SINGLE',
      allowances: 0,
      additionalWithholding: new Decimal(0),
      otherIncome: new Decimal(0),
      deductions: new Decimal(0),
      retirement401kType: 'PERCENT',
      retirement401kRate: new Decimal(5), // 5% contribution
      retirement401kAmount: null,
      address: '456 Oak Ave',
      city: 'San Francisco',
      county: null,
      state: 'CA',
      zipCode: '94102',
      workState: null,
      workCity: null,
      localResident: true,
      bankName: 'Test Bank',
      accountNumber: 'encrypted',
      routingNumber: 'encrypted',
      createdAt: new Date(),
      updatedAt: new Date()
    } as Employee;
  });

  describe('Proration Integration', () => {
    it('should prorate salary for mid-period hire', async () => {
      const payPeriodStart = new Date('2024-01-01'); // Monday
      const payPeriodEnd = new Date('2024-01-14');   // Sunday (2 weeks)

      // Employee hired on Jan 8 (second week)
      const employeeWithLateHire = {
        ...mockEmployee,
        hireDate: new Date('2024-01-08')
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithLateHire, company: mockCompany },
        payPeriodStart,
        payPeriodEnd
      });

      // Biweekly salary: $104,000 / 26 = $4,000
      // Employee started mid-period, should be prorated
      expect(result.earnings.prorationFactor).toBeDefined();
      expect(result.earnings.prorationFactor!).toBeLessThan(1.0);
      expect(result.earnings.prorationFactor!).toBeGreaterThan(0.0);

      // Regular pay should be less than full period
      const fullPeriodPay = 104000 / 26; // $4,000
      expect(result.earnings.regularPay).toBeLessThan(fullPeriodPay);

      // Prorated amount should be reported
      expect(result.earnings.proratedAmount).toBeGreaterThan(0);
    });

    it('should prorate salary for mid-period termination', async () => {
      const payPeriodStart = new Date('2024-01-01');
      const payPeriodEnd = new Date('2024-01-14');

      // Employee terminated on Jan 7
      const employeeWithTermination = {
        ...mockEmployee,
        terminationDate: new Date('2024-01-07')
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithTermination, company: mockCompany },
        payPeriodStart,
        payPeriodEnd
      });

      // Should be prorated
      expect(result.earnings.prorationFactor).toBeDefined();
      expect(result.earnings.prorationFactor!).toBeLessThan(1.0);
      expect(result.earnings.regularPay).toBeLessThan(104000 / 26);
    });

    it('should NOT prorate for full pay period', async () => {
      const payPeriodStart = new Date('2024-06-01');
      const payPeriodEnd = new Date('2024-06-14');

      // Employee hired long before this period
      const result = await calculator.calculate({
        employee: { ...mockEmployee, company: mockCompany },
        payPeriodStart,
        payPeriodEnd
      });

      // No proration needed
      expect(result.earnings.prorationFactor).toBeUndefined();
      expect(result.earnings.proratedAmount).toBeUndefined();

      // Full biweekly pay
      expect(result.earnings.regularPay).toBe(4000); // $104,000 / 26
    });

    it('should NOT prorate hourly employees', async () => {
      const hourlyEmployee = {
        ...mockEmployee,
        payType: 'HOURLY' as const,
        payRate: new Decimal(50), // $50/hour
        hireDate: new Date('2024-01-08') // Mid-period hire
      };

      const result = await calculator.calculate({
        employee: { ...hourlyEmployee, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14'),
        hoursWorked: 80
      });

      // Hourly employees are paid for actual hours, no proration
      expect(result.earnings.prorationFactor).toBeUndefined();
      expect(result.earnings.regularPay).toBe(4000); // 80 hours * $50
    });
  });

  describe('Garnishment Integration', () => {
    it('should calculate garnishment deductions correctly', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Child Support',
          type: 'CHILD_SUPPORT',
          amount: new Decimal(500),
          percent: null,
          totalOwed: new Decimal(10000),
          totalPaid: new Decimal(5000),
          active: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithGarnishments = {
        ...mockEmployee,
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithGarnishments, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      // Garnishments should be deducted
      expect(result.garnishments).toBeGreaterThan(0);
      expect(result.garnishmentDetails).toBeDefined();
      expect(result.garnishmentDetails!.length).toBe(1);
      expect(result.garnishmentDetails![0].description).toBe('Child Support');

      // Net pay should be reduced by garnishments
      expect(result.netPay).toBeLessThan(result.earnings.grossPay - result.totalEmployeeTaxes - result.retirement401k);
    });

    it('should enforce federal 25% garnishment limit', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Creditor Garnishment',
          type: 'CREDITOR_GARNISHMENT',
          amount: new Decimal(2000), // Requesting $2000 (much more than 25% limit)
          percent: null,
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithGarnishments = {
        ...mockEmployee,
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithGarnishments, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      // Biweekly gross: $4000
      // After taxes (estimate ~25%): ~$3000 disposable
      // Federal limit: 25% of $3000 = $750 max

      expect(result.garnishments).toBeLessThanOrEqual(1000); // Well under requested $2000
      expect(result.garnishmentDetails![0].amount).toBeLessThan(2000);
    });

    it('should handle multiple garnishments with priority', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Child Support',
          type: 'CHILD_SUPPORT',
          amount: new Decimal(400),
          percent: null,
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: true,
          priority: 1, // Higher priority
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'garn-2',
          employeeId: 'emp-1',
          description: 'Tax Levy',
          type: 'TAX_LEVY',
          amount: new Decimal(300),
          percent: null,
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: true,
          priority: 2, // Lower priority
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithGarnishments = {
        ...mockEmployee,
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithGarnishments, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      // Should have both garnishments
      expect(result.garnishmentDetails!.length).toBe(2);

      // Priority 1 should be first
      expect(result.garnishmentDetails![0].description).toBe('Child Support');
      expect(result.garnishmentDetails![1].description).toBe('Tax Levy');
    });

    it('should skip inactive garnishments', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Inactive Garnishment',
          type: 'CREDITOR_GARNISHMENT',
          amount: new Decimal(500),
          percent: null,
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: false, // Inactive
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithGarnishments = {
        ...mockEmployee,
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithGarnishments, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      // No garnishments should be applied
      expect(result.garnishments).toBe(0);
      expect(result.garnishmentDetails).toBeUndefined();
    });
  });

  describe('Combined Proration and Garnishment', () => {
    it('should apply both proration and garnishments correctly', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Child Support',
          type: 'CHILD_SUPPORT',
          amount: new Decimal(300),
          percent: null,
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithBoth = {
        ...mockEmployee,
        hireDate: new Date('2024-01-08'), // Mid-period hire
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithBoth, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      // Should have proration
      expect(result.earnings.prorationFactor).toBeDefined();
      expect(result.earnings.prorationFactor!).toBeLessThan(1.0);

      // Should also have garnishments (calculated on prorated earnings)
      expect(result.garnishments).toBeGreaterThan(0);
      expect(result.garnishmentDetails).toBeDefined();

      // Net pay should reflect both proration and garnishments
      const expectedDeductions = result.totalEmployeeTaxes + result.retirement401k + result.garnishments;
      expect(result.totalDeductions).toBe(expectedDeductions);
    });
  });

  describe('Edge Cases', () => {
    it('should handle employee with no garnishments', async () => {
      const result = await calculator.calculate({
        employee: { ...mockEmployee, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      expect(result.garnishments).toBe(0);
      expect(result.garnishmentDetails).toBeUndefined();
    });

    it('should handle employee hired exactly on pay period start', async () => {
      const payPeriodStart = new Date('2024-01-01');

      const employeeHiredOnStart = {
        ...mockEmployee,
        hireDate: payPeriodStart
      };

      const result = await calculator.calculate({
        employee: { ...employeeHiredOnStart, company: mockCompany },
        payPeriodStart,
        payPeriodEnd: new Date('2024-01-14')
      });

      // Should work full period (factor = 1.0)
      expect(result.earnings.prorationFactor).toBeUndefined();
      expect(result.earnings.regularPay).toBe(4000);
    });

    it('should handle percentage-based garnishment', async () => {
      const garnishments: Garnishment[] = [
        {
          id: 'garn-1',
          employeeId: 'emp-1',
          description: 'Garnishment 10%',
          type: 'CREDITOR_GARNISHMENT',
          amount: new Decimal(0),
          percent: new Decimal(10), // 10% of disposable income
          totalOwed: null,
          totalPaid: new Decimal(0),
          active: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const employeeWithPercentGarnishment = {
        ...mockEmployee,
        garnishments
      };

      const result = await calculator.calculate({
        employee: { ...employeeWithPercentGarnishment, company: mockCompany },
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-14')
      });

      expect(result.garnishments).toBeGreaterThan(0);
      expect(result.garnishmentDetails![0].amount).toBeGreaterThan(0);
    });
  });
});
