// Shared types between frontend and backend

export type PayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY'

export type PayType = 'HOURLY' | 'SALARY'

export type FilingStatus =
  | 'SINGLE'
  | 'MARRIED_FILING_JOINTLY'
  | 'MARRIED_FILING_SEPARATELY'
  | 'HEAD_OF_HOUSEHOLD'

export type PayrollStatus = 'DRAFT' | 'PENDING' | 'PROCESSED' | 'PAID' | 'VOID'

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'

export interface Company {
  id: string
  name: string
  ein: string
  address: string
  city: string
  state: string
  zipCode: string
  phone?: string
  email?: string
  payFrequency: PayFrequency
  isActive: boolean
  retirement401kMatchRate?: number | null
  retirement401kMatchLimitPercent?: number | null
}

export interface Employee {
  id: string
  companyId: string
  firstName: string
  lastName: string
  email: string
  ssn: string
  dateOfBirth: Date
  hireDate: Date
  terminationDate?: Date
  department?: string
  jobTitle?: string
  isActive: boolean
  payType: PayType
  payRate: number
  filingStatus: FilingStatus
  allowances: number
  additionalWithholding: number
  otherIncome?: number
  deductions?: number
  retirement401kType?: 'PERCENT' | 'FIXED' | null
  retirement401kRate?: number | null
  retirement401kAmount?: number | null
  address: string
  city: string
  county?: string
  state: string
  zipCode: string
  workState?: string
  workCity?: string
  localResident?: boolean
}

export interface PayrollResult {
  employeeId: string
  employeeName: string
  payPeriodStart: Date
  payPeriodEnd: Date

  // Earnings
  regularHours: number
  overtimeHours: number
  regularPay: number
  overtimePay: number
  bonus: number
  commission: number
  grossPay: number

  // Federal Taxes
  federalWithholding: number
  socialSecurity: number
  medicare: number

  // State Taxes
  stateWithholding: number
  stateDisability: number

  // Totals
  totalDeductions: number
  netPay: number
  reimbursements: number
}

// Tax calculation types
export interface TaxBracket {
  min: number
  max: number
  rate: number
  base: number
}

export interface FederalTaxTables {
  SINGLE: TaxBracket[]
  MARRIED_FILING_JOINTLY: TaxBracket[]
  MARRIED_FILING_SEPARATELY: TaxBracket[]
  HEAD_OF_HOUSEHOLD: TaxBracket[]
}

// US States
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
] as const

// States with no income tax
export const NO_INCOME_TAX_STATES = ['AK', 'FL', 'NV', 'SD', 'TX', 'WA', 'WY', 'NH', 'TN'] as const
