import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import { AuthRequest, filterByAccessibleCompanies, hasCompanyAccess, authorizeRoles } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const optionalPercentNumber = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.number().min(0).max(100).optional()
);

const baseCompanySchema = z.object({
  name: z.string().min(1),
  ein: z.string().regex(/^\d{2}-\d{7}$/, 'EIN must be in format XX-XXXXXXX'),
  address: z.string(),
  city: z.string(),
  state: z.string().length(2),
  zipCode: z.string(),
  phone: z.string().optional(),
  email: z.string().email().optional(),

  // Payroll settings
  payFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']).default('BIWEEKLY'),

  // State tax registrations
  stateUnemploymentId: z.string().optional(),
  stateWithholdingId: z.string().optional(),

  // SUTA rate (experience rating)
  sutaRate: z.number().min(0).max(100).optional(),

  // Federal tax deposit schedule (Form 941)
  federalDepositSchedule: z.enum(['MONTHLY', 'SEMIWEEKLY']).default('MONTHLY'),

  // Retirement (401k) match settings
  retirement401kMatchRate: optionalPercentNumber,
  retirement401kMatchLimitPercent: optionalPercentNumber
});

const createCompanySchema = baseCompanySchema.superRefine((data, ctx) => {
  const matchRate = data.retirement401kMatchRate ?? 0;
  const matchLimit = data.retirement401kMatchLimitPercent ?? 0;

  if (matchLimit > 0 && matchRate <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['retirement401kMatchRate'],
      message: 'Match rate is required when a match limit is provided'
    });
  }
});

const updateCompanySchema = baseCompanySchema.partial();

// GET /api/companies - List all companies
// Multi-tenant: Only returns companies the user has access to
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // Build where clause with multi-tenant filter
    const whereClause = filterByAccessibleCompanies(req);
    // For company list, filter by id instead of companyId
    const companyFilter = 'companyId' in whereClause
      ? { id: { in: (whereClause as any).companyId.in } }
      : {};

    const companies = await prisma.company.findMany({
      where: Object.keys(companyFilter).length > 0 ? companyFilter : undefined,
      include: {
        _count: {
          select: { employees: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id - Get single company
// Multi-tenant: Verifies user has access to this company
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        employees: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies - Create new company
// Note: Creating a company should also create CompanyAccess for the user
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createCompanySchema.parse(req.body);

    // Check if EIN already exists
    const existingCompany = await prisma.company.findFirst({
      where: { ein: data.ein }
    });

    if (existingCompany) {
      return res.status(400).json({ error: 'Company with this EIN already exists' });
    }

    // Create company and grant access to the creating user
    const company = await prisma.company.create({
      data: {
        ...data,
        isActive: true
      }
    });

    // If user is authenticated, grant them access to the new company
    if (req.user?.userId) {
      await prisma.companyAccess.create({
        data: {
          userId: req.user.userId,
          companyId: company.id,
          role: 'ADMIN' // Creator gets admin role for this company
        }
      });
    }

    res.status(201).json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// PUT /api/companies/:id - Update company
// Multi-tenant: Verifies user has access to this company
// Role restriction: Only ADMIN, ACCOUNTANT, or MANAGER can update companies
router.put('/:id', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    const data = updateCompanySchema.parse(req.body);

    const existingCompany = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: {
        retirement401kMatchRate: true,
        retirement401kMatchLimitPercent: true
      }
    });

    if (!existingCompany) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const resultingMatchRate =
      data.retirement401kMatchRate !== undefined
        ? data.retirement401kMatchRate
        : existingCompany.retirement401kMatchRate;
    const resultingMatchLimit =
      data.retirement401kMatchLimitPercent !== undefined
        ? data.retirement401kMatchLimitPercent
        : existingCompany.retirement401kMatchLimitPercent;

    if (Number(resultingMatchLimit ?? 0) > 0 && Number(resultingMatchRate ?? 0) <= 0) {
      return res.status(400).json({
        error: 'Invalid 401(k) match configuration',
        message: 'Match rate is required when a match limit is provided'
      });
    }

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data
    });

    res.json(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id - Soft delete company
// Multi-tenant: Verifies user has access to this company
// Role restriction: Only ADMIN can deactivate companies
router.delete('/:id', authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, req.params.id)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Check if company has active employees
    const activeEmployees = await prisma.employee.count({
      where: { companyId: req.params.id, isActive: true }
    });

    if (activeEmployees > 0) {
      return res.status(400).json({
        error: 'Cannot deactivate company with active employees',
        activeEmployees
      });
    }

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    res.json({ message: 'Company deactivated', company });
  } catch (error) {
    console.error('Error deactivating company:', error);
    res.status(500).json({ error: 'Failed to deactivate company' });
  }
});

export default router;
