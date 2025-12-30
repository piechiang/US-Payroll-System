import { Router, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import * as XLSX from 'xlsx';
import { AuthRequest, filterByAccessibleCompanies, authorizeRoles, hasCompanyAccess } from '../middleware/auth.js';
import { encrypt, decrypt, maskSSN, hashSSN, isEncrypted, encryptIfNeeded } from '../services/encryption.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../services/employeeSchema.js';
import { EMPLOYEE_IMPORT_HEADERS, parseEmployeeImportFile } from '../services/employeeImport.js';
import { MARYLAND_LOCAL_TAX_INFO } from '../tax/local/baltimore.js';
import { logEmployeeAccess, logSensitiveAccess } from '../services/auditLog.js';
import { logger } from '../services/logger.js';

// Valid Maryland counties for validation
const VALID_MD_COUNTIES = Object.keys(MARYLAND_LOCAL_TAX_INFO.rates);

/**
 * Validate Maryland county name
 * Returns normalized county name if valid, null otherwise
 */
function validateMarylandCounty(county: string | undefined | null): string | null {
  if (!county) return null;

  const normalizedCounty = county.toUpperCase().trim();

  // Check if county exists in valid list
  if (VALID_MD_COUNTIES.includes(normalizedCounty)) {
    return normalizedCounty;
  }

  // Try common variations
  const variations: Record<string, string> = {
    'PRINCE GEORGE\'S': 'PRINCE GEORGES',
    'PRINCE GEORGE': 'PRINCE GEORGES',
    'ST. MARY\'S': 'ST MARYS',
    'ST MARY\'S': 'ST MARYS',
    'QUEEN ANNE\'S': 'QUEEN ANNES',
    'QUEEN ANNE': 'QUEEN ANNES',
  };

  const mapped = variations[normalizedCounty];
  if (mapped && VALID_MD_COUNTIES.includes(mapped)) {
    return mapped;
  }

  return null;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function getExportRows(employees: any[]) {
  return employees.map((employee) => ({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    ssn: employee.ssn,
    dateOfBirth: formatDate(employee.dateOfBirth),
    hireDate: formatDate(employee.hireDate),
    department: employee.department ?? '',
    jobTitle: employee.jobTitle ?? '',
    payType: employee.payType,
    payRate: employee.payRate,
    filingStatus: employee.filingStatus,
    allowances: employee.allowances,
    additionalWithholding: employee.additionalWithholding,
    otherIncome: employee.otherIncome,
    deductions: employee.deductions,
    retirement401kType: employee.retirement401kType ?? '',
    retirement401kRate: employee.retirement401kRate ?? '',
    retirement401kAmount: employee.retirement401kAmount ?? '',
    address: employee.address,
    city: employee.city,
    county: employee.county ?? '',
    state: employee.state,
    zipCode: employee.zipCode,
    workCity: employee.workCity ?? '',
    workState: employee.workState ?? '',
    localResident: employee.localResident ?? '',
    bankRoutingNumber: employee.bankRoutingNumber ?? '',
    bankAccountNumber: employee.bankAccountNumber ?? '',
    bankAccountType: employee.bankAccountType ?? '',
    companyId: employee.companyId
  }));
}

// Helper to mask sensitive data in employee response
function maskEmployeeData(employee: any) {
  if (!employee) return employee;

  let maskedBankAccount = null;
  if (employee.bankAccountNumber) {
    try {
      // Try to decrypt if encrypted, otherwise use as-is
      const plainAccount = isEncrypted(employee.bankAccountNumber)
        ? decrypt(employee.bankAccountNumber)
        : employee.bankAccountNumber;
      maskedBankAccount = `****${plainAccount.slice(-4)}`;
    } catch {
      // If decryption fails, just show masked placeholder
      maskedBankAccount = '****';
    }
  }

  let maskedBankRouting = null;
  if (employee.bankRoutingNumber) {
    try {
      // Try to decrypt if encrypted, otherwise use as-is
      const plainRouting = isEncrypted(employee.bankRoutingNumber)
        ? decrypt(employee.bankRoutingNumber)
        : employee.bankRoutingNumber;
      // Show last 4 digits of routing number
      maskedBankRouting = `****${plainRouting.slice(-4)}`;
    } catch {
      // If decryption fails, just show masked placeholder
      maskedBankRouting = '****';
    }
  }

  return {
    ...employee,
    ssn: maskSSN(employee.ssn),
    bankAccountNumber: maskedBankAccount,
    bankRoutingNumber: maskedBankRouting,
  };
}

// Helper to mask array of employees
function maskEmployeesData(employees: any[]) {
  return employees.map(maskEmployeeData);
}

// Pay rate limits for validation
// These are reasonable upper bounds to catch data entry errors
// while still allowing legitimate high earners
const PAY_RATE_LIMITS = {
  HOURLY: {
    max: 1000,  // $1000/hour max (e.g., high-end consultants)
    errorMessage: 'Hourly rate cannot exceed $1,000/hour'
  },
  SALARY: {
    max: 10000000,  // $10M/year max (reasonable for executives)
    errorMessage: 'Annual salary cannot exceed $10,000,000'
  }
};

// GET /api/employees - List employees with pagination
// Multi-tenant: Only returns employees from accessible companies
// Query params: page (1-based), limit (default 50, max 100), companyId, search
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, search } = req.query;

    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    // Build where clause with multi-tenant filter
    const baseFilter = filterByAccessibleCompanies(req);
    let whereClause: Record<string, unknown> = companyId
      ? { ...baseFilter, companyId: String(companyId) }
      : baseFilter;

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      whereClause = {
        ...whereClause,
        OR: [
          { firstName: { contains: searchTerm } },
          { lastName: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { department: { contains: searchTerm } },
          { jobTitle: { contains: searchTerm } }
        ]
      };
    }

    // Run count and find in parallel
    const [total, employees] = await Promise.all([
      prisma.employee.count({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined
      }),
      prisma.employee.findMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        include: {
          company: {
            select: { name: true }
          }
        },
        orderBy: { lastName: 'asc' },
        skip,
        take: limit
      })
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);

    // Return paginated response
    res.json({
      data: maskEmployeesData(employees),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/export - Export employees (CSV or XLSX)
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, search, format, template } = req.query;
    const exportFormat = format === 'xlsx' ? 'xlsx' : 'csv';
    const isTemplate = template === 'true' || template === '1';

    const baseFilter = filterByAccessibleCompanies(req);
    let whereClause: Record<string, unknown> = companyId
      ? { ...baseFilter, companyId: String(companyId) }
      : baseFilter;

    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      whereClause = {
        ...whereClause,
        OR: [
          { firstName: { contains: searchTerm } },
          { lastName: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { department: { contains: searchTerm } },
          { jobTitle: { contains: searchTerm } }
        ]
      };
    }

    const employees = isTemplate
      ? []
      : await prisma.employee.findMany({
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
        orderBy: { lastName: 'asc' }
      });

    const maskedEmployees = isTemplate ? [] : maskEmployeesData(employees);
    const rows = getExportRows(maskedEmployees);

    if (exportFormat === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: EMPLOYEE_IMPORT_HEADERS as string[]
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=\"employees-${isTemplate ? 'template' : 'export'}.xlsx\"`
      );
      return res.send(buffer);
    }

    const headerLine = EMPLOYEE_IMPORT_HEADERS.join(',');
    const dataLines = rows.map((row) =>
      EMPLOYEE_IMPORT_HEADERS.map((header) => escapeCsv(row[header])).join(',')
    );
    const csvContent = [headerLine, ...dataLines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=\"employees-${isTemplate ? 'template' : 'export'}.csv\"`
    );
    return res.send(csvContent);
  } catch (error) {
    logger.error('Error exporting employees:', error);
    res.status(500).json({ error: 'Failed to export employees' });
  }
});

// POST /api/employees/bulk-import - Bulk import employees from CSV/XLSX
router.post(
  '/bulk-import',
  authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'),
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File is required for import' });
      }

      const extension = path.extname(req.file.originalname || '').toLowerCase();
      const format = extension === '.xlsx' ? 'xlsx' : extension === '.csv' ? 'csv' : null;
      if (!format) {
        return res.status(400).json({ error: 'Unsupported file format. Use CSV or XLSX.' });
      }

      const defaultCompanyId = typeof req.body.companyId === 'string' ? req.body.companyId : undefined;
      const { employees, errors } = parseEmployeeImportFile(
        req.file.buffer,
        format,
        defaultCompanyId
      );

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }

      if (employees.length === 0) {
        return res.status(400).json({ error: 'No valid employee rows found in file' });
      }

      const companyIds = Array.from(new Set(employees.map((employee) => employee.companyId)));
      const inaccessibleCompanyIds = companyIds.filter((id) => !hasCompanyAccess(req, id));
      if (inaccessibleCompanyIds.length > 0) {
        return res.status(403).json({
          error: 'Access denied to one or more companies',
          companyIds: inaccessibleCompanyIds
        });
      }

      const validationErrors: Array<{ row: number; message: string; field?: string }> = [];
      for (const employee of employees) {
        const payLimit = PAY_RATE_LIMITS[employee.payType];
        if (employee.payRate > payLimit.max) {
          validationErrors.push({
            row: employee.importRow,
            field: 'payRate',
            message: payLimit.errorMessage
          });
        }

        if (employee.state === 'MD') {
          if (!employee.county) {
            validationErrors.push({
              row: employee.importRow,
              field: 'county',
              message: 'Maryland local tax calculation requires a valid county'
            });
          } else {
            const validatedCounty = validateMarylandCounty(employee.county);
            if (!validatedCounty) {
              validationErrors.push({
                row: employee.importRow,
                field: 'county',
                message: `"${employee.county}" is not a valid Maryland county`
              });
            } else {
              employee.county = validatedCounty;
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Validation failed', details: validationErrors });
      }

      const seenHashes = new Set<string>();
      const duplicateRows: number[] = [];
      employees.forEach((employee) => {
        if (seenHashes.has(employee.ssnHash)) {
          duplicateRows.push(employee.importRow);
        } else {
          seenHashes.add(employee.ssnHash);
        }
      });

      if (duplicateRows.length > 0) {
        return res.status(400).json({
          error: 'Duplicate SSN detected in file',
          rows: duplicateRows
        });
      }

      const existingEmployees = await prisma.employee.findMany({
        where: { ssnHash: { in: Array.from(seenHashes) } },
        select: { ssnHash: true }
      });

      if (existingEmployees.length > 0) {
        return res.status(400).json({
          error: 'Employee with this SSN already exists',
          ssnHashes: existingEmployees.map((employee) => employee.ssnHash)
        });
      }

      const createdEmployees = await prisma.$transaction(
        employees.map((employee) => {
          const { importRow, ...data } = employee;
          return prisma.employee.create({
            data: {
              ...data,
              isActive: true
            }
          });
        })
      );

      createdEmployees.forEach((employee) => {
        logEmployeeAccess(req, 'CREATE', employee.id, employee.companyId, {
          firstName: employee.firstName,
          lastName: employee.lastName
        });
        logSensitiveAccess(req, 'EMPLOYEE_SSN', employee.id, employee.companyId, 'CREATE');
        if (employee.bankAccountNumber || employee.bankRoutingNumber) {
          logSensitiveAccess(req, 'EMPLOYEE_BANK', employee.id, employee.companyId, 'CREATE');
        }
      });

      return res.status(201).json({ data: maskEmployeesData(createdEmployees) });
    } catch (error) {
      logger.error('Error importing employees:', error);
      return res.status(500).json({ error: 'Failed to import employees' });
    }
  }
);

// GET /api/employees/:id - Get single employee
// Multi-tenant: Verifies user has access to the employee's company
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        company: true,
        payrolls: {
          take: 10,
          orderBy: { payDate: 'desc' }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Multi-tenant check: verify access to this employee's company
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, employee.companyId)) {
      return res.status(403).json({ error: 'Access denied to this employee' });
    }

    // Audit log: record access to employee record (contains SSN and bank info)
    logEmployeeAccess(req, 'VIEW', employee.id, employee.companyId);
    if (employee.ssn) {
      logSensitiveAccess(req, 'EMPLOYEE_SSN', employee.id, employee.companyId);
    }
    if (employee.bankAccountNumber) {
      logSensitiveAccess(req, 'EMPLOYEE_BANK', employee.id, employee.companyId);
    }

    // Mask sensitive data before sending
    res.json(maskEmployeeData(employee));
  } catch (error) {
    logger.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees - Create new employee
// Multi-tenant: Verifies user has access to the target company
// Role restriction: Only ADMIN, ACCOUNTANT, or MANAGER can create employees
router.post('/', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = createEmployeeSchema.parse(req.body);

    // Multi-tenant check: verify access to target company
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied to this company' });
    }

    // Validate pay rate limits based on pay type
    const payLimit = PAY_RATE_LIMITS[data.payType];
    if (data.payRate > payLimit.max) {
      return res.status(400).json({
        error: 'Invalid pay rate',
        message: payLimit.errorMessage,
        maxAllowed: payLimit.max,
        payType: data.payType
      });
    }

    // Validate Maryland county requirement
    // MD employees must have a valid county for local tax calculation
    if (data.state === 'MD') {
      if (!data.county) {
        return res.status(400).json({
          error: 'County required for Maryland employees',
          message: 'Maryland local tax calculation requires a valid county',
          validCounties: VALID_MD_COUNTIES
        });
      }

      const validatedCounty = validateMarylandCounty(data.county);
      if (!validatedCounty) {
        return res.status(400).json({
          error: 'Invalid Maryland county',
          message: `"${data.county}" is not a valid Maryland county`,
          validCounties: VALID_MD_COUNTIES
        });
      }

      // Use normalized county name
      data.county = validatedCounty;
    }

    // Generate SSN hash for uniqueness check (efficient O(1) lookup via unique index)
    const ssnHashValue = hashSSN(data.ssn);

    // Check if SSN already exists using the hash (unique index makes this efficient)
    const existingEmployee = await prisma.employee.findUnique({
      where: { ssnHash: ssnHashValue },
      select: { id: true }
    });

    if (existingEmployee) {
      return res.status(400).json({ error: 'Employee with this SSN already exists' });
    }

    // Encrypt SSN before storing
    const encryptedSSN = encrypt(data.ssn);

    // Encrypt bank details if provided
    const encryptedBankAccount = data.bankAccountNumber
      ? encrypt(data.bankAccountNumber)
      : undefined;
    const encryptedBankRouting = data.bankRoutingNumber
      ? encrypt(data.bankRoutingNumber)
      : undefined;

    const employee = await prisma.employee.create({
      data: {
        ...data,
        ssn: encryptedSSN,                        // Store encrypted SSN
        ssnHash: ssnHashValue,                    // Store hash for duplicate detection
        bankAccountNumber: encryptedBankAccount,  // Store encrypted bank account
        bankRoutingNumber: encryptedBankRouting,  // Store encrypted routing number
        isActive: true
      }
    });

    // Audit log: record employee creation
    logEmployeeAccess(req, 'CREATE', employee.id, employee.companyId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });

    // Return masked data
    res.status(201).json(maskEmployeeData(employee));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PUT /api/employees/:id - Update employee
// Multi-tenant: Verifies user has access to the employee's company
// Role restriction: Only ADMIN, ACCOUNTANT, or MANAGER can update employees
router.put('/:id', authorizeRoles('ADMIN', 'ACCOUNTANT', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const data = updateEmployeeSchema.parse(req.body);

    // First fetch the employee to check company access and current state
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      select: {
        companyId: true,
        state: true,
        county: true,
        workCity: true,
        workState: true,
        retirement401kType: true,
        retirement401kRate: true,
        retirement401kAmount: true
      }
    });

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, existingEmployee.companyId)) {
      return res.status(403).json({ error: 'Access denied to this employee' });
    }
    // Also check target company if changing
    if (data.companyId && !hasCompanyAccess(req, data.companyId)) {
      return res.status(403).json({ error: 'Access denied to target company' });
    }

    // Validate pay rate limits if pay rate or pay type is being updated
    if (data.payRate !== undefined || data.payType !== undefined) {
      // Need to get current employee data to check combined values
      const currentEmployee = await prisma.employee.findUnique({
        where: { id: req.params.id },
        select: { payType: true, payRate: true }
      });

      if (currentEmployee) {
        const effectivePayType = data.payType || currentEmployee.payType;
        const effectivePayRate = data.payRate !== undefined ? data.payRate : Number(currentEmployee.payRate);
        const payLimit = PAY_RATE_LIMITS[effectivePayType as keyof typeof PAY_RATE_LIMITS];

        if (effectivePayRate > payLimit.max) {
          return res.status(400).json({
            error: 'Invalid pay rate',
            message: payLimit.errorMessage,
            maxAllowed: payLimit.max,
            payType: effectivePayType
          });
        }
      }
    }

    // Validate Maryland county requirement
    // Check if the resulting state will be MD (either updating to MD or already MD)
    const resultingState = data.state || existingEmployee.state;
    const resultingCounty = data.county !== undefined ? data.county : existingEmployee.county;

    if (resultingState === 'MD') {
      if (!resultingCounty) {
        return res.status(400).json({
          error: 'County required for Maryland employees',
          message: 'Maryland local tax calculation requires a valid county',
          validCounties: VALID_MD_COUNTIES
        });
      }

      const validatedCounty = validateMarylandCounty(resultingCounty);
      if (!validatedCounty) {
        return res.status(400).json({
          error: 'Invalid Maryland county',
          message: `"${resultingCounty}" is not a valid Maryland county`,
          validCounties: VALID_MD_COUNTIES
        });
      }

      // If county is being updated, use normalized name
      if (data.county !== undefined) {
        data.county = validatedCounty;
      }
    }

    const resultingWorkCity = data.workCity !== undefined ? data.workCity : existingEmployee.workCity;
    const resultingWorkState = data.workState !== undefined ? data.workState : existingEmployee.workState;
    const hasWorkCity = Boolean(resultingWorkCity);
    const hasWorkState = Boolean(resultingWorkState);
    if (hasWorkCity && !hasWorkState) {
      return res.status(400).json({
        error: 'Missing work state',
        message: 'Work state is required when work city is provided'
      });
    }
    if (hasWorkState && !hasWorkCity) {
      return res.status(400).json({
        error: 'Missing work city',
        message: 'Work city is required when work state is provided'
      });
    }

    if (data.retirement401kType === null) {
      data.retirement401kRate = null;
      data.retirement401kAmount = null;
    }

    const resulting401kType =
      data.retirement401kType !== undefined
        ? data.retirement401kType
        : existingEmployee.retirement401kType;
    const resulting401kRate =
      data.retirement401kRate !== undefined
        ? data.retirement401kRate
        : existingEmployee.retirement401kRate;
    const resulting401kAmount =
      data.retirement401kAmount !== undefined
        ? data.retirement401kAmount
        : existingEmployee.retirement401kAmount;

    const normalized401kType = resulting401kType ?? undefined;
    const normalized401kRate = Number(resulting401kRate ?? 0);
    const normalized401kAmount = Number(resulting401kAmount ?? 0);

    if (!normalized401kType) {
      if (normalized401kRate > 0 || normalized401kAmount > 0) {
        return res.status(400).json({
          error: 'Missing 401(k) type',
          message: '401(k) type is required when a contribution is provided'
        });
      }
    } else if (normalized401kType === 'PERCENT') {
      if (resulting401kRate === undefined || resulting401kRate === null) {
        return res.status(400).json({
          error: 'Missing 401(k) rate',
          message: '401(k) rate is required for percent-based contributions'
        });
      }
      if (normalized401kAmount > 0) {
        return res.status(400).json({
          error: 'Invalid 401(k) amount',
          message: 'Do not set a flat amount when using percent-based contributions'
        });
      }
    } else if (normalized401kType === 'FIXED') {
      if (resulting401kAmount === undefined || resulting401kAmount === null) {
        return res.status(400).json({
          error: 'Missing 401(k) amount',
          message: '401(k) amount is required for flat contributions'
        });
      }
      if (normalized401kRate > 0) {
        return res.status(400).json({
          error: 'Invalid 401(k) rate',
          message: 'Do not set a percent rate when using flat contributions'
        });
      }
    }

    // Prepare update data with encryption for sensitive fields
    const updateData: any = { ...data };

    // Encrypt SSN if being updated, and update the hash
    // Note: SSN updates should always be new plain values, not re-encrypted
    if (updateData.ssn && data.ssn) {
      // Validate SSN format before encrypting
      if (!isEncrypted(data.ssn)) {
        updateData.ssn = encrypt(data.ssn);
        updateData.ssnHash = hashSSN(data.ssn);
      } else {
        // Already encrypted - this shouldn't happen with proper API usage
        // Remove from update to prevent double encryption
        delete updateData.ssn;
      }
    }

    // Encrypt bank details if being updated
    // Use encryptIfNeeded to handle both plain and already-encrypted values
    if (updateData.bankAccountNumber) {
      updateData.bankAccountNumber = encryptIfNeeded(updateData.bankAccountNumber);
    }
    if (updateData.bankRoutingNumber) {
      updateData.bankRoutingNumber = encryptIfNeeded(updateData.bankRoutingNumber);
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Audit log: record employee update
    const updatedFields = Object.keys(data).filter(k => k !== 'ssn' && k !== 'bankAccountNumber' && k !== 'bankRoutingNumber');
    logEmployeeAccess(req, 'UPDATE', employee.id, employee.companyId, {
      updatedFields,
    });
    // Log sensitive field updates separately
    if (data.ssn) {
      logSensitiveAccess(req, 'EMPLOYEE_SSN', employee.id, employee.companyId, 'UPDATE');
    }
    if (data.bankAccountNumber || data.bankRoutingNumber) {
      logSensitiveAccess(req, 'EMPLOYEE_BANK', employee.id, employee.companyId, 'UPDATE');
    }

    // Return masked data
    res.json(maskEmployeeData(employee));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// DELETE /api/employees/:id - Soft delete (deactivate) employee
// Multi-tenant: Verifies user has access to the employee's company
// Role restriction: Only ADMIN or MANAGER can deactivate employees
router.delete('/:id', authorizeRoles('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    // First fetch the employee to check company access
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Multi-tenant check
    // SECURITY: Uses hasCompanyAccess which properly handles empty accessibleCompanyIds
    if (!hasCompanyAccess(req, existingEmployee.companyId)) {
      return res.status(403).json({ error: 'Access denied to this employee' });
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        isActive: false,
        terminationDate: new Date()
      }
    });

    // Audit log: record employee deactivation
    logEmployeeAccess(req, 'DELETE', employee.id, employee.companyId, {
      terminationDate: new Date().toISOString(),
    });

    // Return masked data (employee may contain sensitive info)
    res.json({ message: 'Employee deactivated', employee: maskEmployeeData(employee) });
  } catch (error) {
    logger.error('Error deactivating employee:', error);
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

export default router;
