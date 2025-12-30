import { z } from 'zod';

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalTrimmedString = z.preprocess(normalizeOptionalString, z.string().optional());
const optionalTrimmedState = z.preprocess(
  normalizeOptionalString,
  z.string().length(2).optional()
);
const optional401kType = z.preprocess(
  (value) => value === '' ? null : value,
  z.enum(['PERCENT', 'FIXED']).nullable().optional()
);

// Base validation schema (without refinements)
export const baseEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/, 'SSN must be in format XXX-XX-XXXX'),
  dateOfBirth: z.string().transform(str => new Date(str)),
  hireDate: z.string().transform(str => new Date(str)),
  department: optionalTrimmedString,
  jobTitle: optionalTrimmedString,

  // Compensation
  payType: z.enum(['HOURLY', 'SALARY']),
  payRate: z.number().positive(),

  // W-4 Information
  filingStatus: z.enum(['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD']),
  allowances: z.number().int().min(0).default(0),
  additionalWithholding: z.number().min(0).default(0),
  otherIncome: z.number().min(0).default(0),
  deductions: z.number().min(0).default(0),

  // Retirement (401k)
  retirement401kType: optional401kType,
  retirement401kRate: z.number().min(0).max(100).nullable().optional(),
  retirement401kAmount: z.number().min(0).nullable().optional(),

  // Address
  address: z.string(),
  city: z.string(),
  county: optionalTrimmedString,
  state: z.string().length(2),
  zipCode: z.string(),

  // Work location (for local taxes)
  workCity: optionalTrimmedString,
  workState: optionalTrimmedState,
  localResident: z.boolean().optional().default(true),

  // Direct Deposit (optional)
  bankRoutingNumber: z.preprocess(
    normalizeOptionalString,
    z.string().regex(/^\d{9}$/, 'Routing number must be 9 digits').optional()
  ),
  bankAccountNumber: z.preprocess(
    normalizeOptionalString,
    z.string().min(4).max(17).optional()
  ),
  bankAccountType: z.preprocess(
    normalizeOptionalString,
    z.enum(['CHECKING', 'SAVINGS']).optional()
  ),

  companyId: z.string()
});

// Refinement function for work location and 401k validation
function employeeRefinements(data: z.infer<typeof baseEmployeeSchema>, ctx: z.RefinementCtx) {
  const hasWorkCity = Boolean(data.workCity);
  const hasWorkState = Boolean(data.workState);

  if (hasWorkCity && !hasWorkState) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['workState'],
      message: 'Work state is required when work city is provided'
    });
  }

  if (hasWorkState && !hasWorkCity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['workCity'],
      message: 'Work city is required when work state is provided'
    });
  }

  const retirement401kType = data.retirement401kType ?? undefined;
  const retirement401kRate = data.retirement401kRate ?? undefined;
  const retirement401kAmount = data.retirement401kAmount ?? undefined;

  if (!retirement401kType) {
    if ((retirement401kRate ?? 0) > 0 || (retirement401kAmount ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirement401kType'],
        message: '401(k) type is required when a contribution is provided'
      });
    }
  } else if (retirement401kType === 'PERCENT') {
    if (retirement401kRate === undefined || retirement401kRate === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirement401kRate'],
        message: '401(k) rate is required for percent-based contributions'
      });
    }
    if ((retirement401kAmount ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirement401kAmount'],
        message: 'Do not set a flat amount when using percent-based contributions'
      });
    }
  } else if (retirement401kType === 'FIXED') {
    if (retirement401kAmount === undefined || retirement401kAmount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirement401kAmount'],
        message: '401(k) amount is required for flat contributions'
      });
    }
    if ((retirement401kRate ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirement401kRate'],
        message: 'Do not set a percent rate when using flat contributions'
      });
    }
  }
}

// Create schema with refinements
export const createEmployeeSchema = baseEmployeeSchema.superRefine(employeeRefinements);

// Update schema - partial base without refinements (validation done in route handler)
export const updateEmployeeSchema = baseEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
