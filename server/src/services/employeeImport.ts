import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { createEmployeeSchema, CreateEmployeeInput } from './employeeSchema.js';
import { encryptIfNeeded, hashSSN } from './encryption.js';

const HEADER_ALIASES: Record<string, keyof CreateEmployeeInput> = {
  firstname: 'firstName',
  lastname: 'lastName',
  email: 'email',
  ssn: 'ssn',
  dateofbirth: 'dateOfBirth',
  hiredate: 'hireDate',
  department: 'department',
  jobtitle: 'jobTitle',
  paytype: 'payType',
  payrate: 'payRate',
  filingstatus: 'filingStatus',
  allowances: 'allowances',
  additionalwithholding: 'additionalWithholding',
  otherincome: 'otherIncome',
  deductions: 'deductions',
  retirement401ktype: 'retirement401kType',
  retirement401krate: 'retirement401kRate',
  retirement401kamount: 'retirement401kAmount',
  address: 'address',
  city: 'city',
  county: 'county',
  state: 'state',
  zipcode: 'zipCode',
  workcity: 'workCity',
  workstate: 'workState',
  localresident: 'localResident',
  bankroutingnumber: 'bankRoutingNumber',
  bankaccountnumber: 'bankAccountNumber',
  bankaccounttype: 'bankAccountType',
  companyid: 'companyId'
};

export const EMPLOYEE_IMPORT_HEADERS: Array<keyof CreateEmployeeInput> = [
  'firstName',
  'lastName',
  'email',
  'ssn',
  'dateOfBirth',
  'hireDate',
  'department',
  'jobTitle',
  'payType',
  'payRate',
  'filingStatus',
  'allowances',
  'additionalWithholding',
  'otherIncome',
  'deductions',
  'retirement401kType',
  'retirement401kRate',
  'retirement401kAmount',
  'address',
  'city',
  'county',
  'state',
  'zipCode',
  'workCity',
  'workState',
  'localResident',
  'bankRoutingNumber',
  'bankAccountNumber',
  'bankAccountType',
  'companyId'
];

export interface ImportRowError {
  row: number;
  message: string;
  field?: string;
}

export interface PreparedEmployeeImport extends Omit<CreateEmployeeInput, 'ssn'> {
  ssn: string;
  ssnHash: string;
  importRow: number;
}

function normalizeHeader(header: string): keyof CreateEmployeeInput | null {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  return HEADER_ALIASES[normalized] ?? null;
}

function normalizeSSN(value: string): string {
  const trimmed = value.trim();
  if (/^\d{9}$/.test(trimmed)) {
    return `${trimmed.slice(0, 3)}-${trimmed.slice(3, 5)}-${trimmed.slice(5)}`;
  }
  return trimmed;
}

function normalizeString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return String(value);
}

function parseNumber(value: unknown, field: string): number | undefined {
  const normalized = normalizeString(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${field}`);
  }
  return parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
  const normalized = normalizeString(value);
  if (normalized === undefined) return undefined;
  const lowered = normalized.toLowerCase();
  if (['true', 'yes', '1'].includes(lowered)) return true;
  if (['false', 'no', '0'].includes(lowered)) return false;
  return undefined;
}

function toUpperOptional(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : undefined;
}

function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeHeader(key);
    if (!normalized) continue;
    mapped[normalized] = value;
  }
  return mapped;
}

function isRowEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every(value => normalizeString(value) === undefined);
}

function parseRowsFromCsv(buffer: Buffer): Record<string, unknown>[] {
  return parseCsv(buffer.toString('utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, unknown>[];
}

function parseRowsFromXlsx(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
}

export function parseEmployeeImportFile(
  buffer: Buffer,
  format: 'csv' | 'xlsx',
  defaultCompanyId?: string
): { employees: PreparedEmployeeImport[]; errors: ImportRowError[] } {
  const rows = format === 'xlsx' ? parseRowsFromXlsx(buffer) : parseRowsFromCsv(buffer);
  const employees: PreparedEmployeeImport[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // account for header row
    const mapped = mapRow(rawRow);
    if (isRowEmpty(mapped)) {
      return;
    }

    try {
      const ssnValue = normalizeString(mapped.ssn);
      const normalizedSSN = ssnValue ? normalizeSSN(ssnValue) : undefined;

      const candidate: Record<string, unknown> = {
        firstName: normalizeString(mapped.firstName),
        lastName: normalizeString(mapped.lastName),
        email: normalizeString(mapped.email),
        ssn: normalizedSSN,
        dateOfBirth: normalizeString(mapped.dateOfBirth),
        hireDate: normalizeString(mapped.hireDate),
        department: normalizeString(mapped.department),
        jobTitle: normalizeString(mapped.jobTitle),
        payType: toUpperOptional(mapped.payType),
        payRate: parseNumber(mapped.payRate, 'payRate'),
        filingStatus: toUpperOptional(mapped.filingStatus),
        allowances: parseNumber(mapped.allowances, 'allowances'),
        additionalWithholding: parseNumber(mapped.additionalWithholding, 'additionalWithholding'),
        otherIncome: parseNumber(mapped.otherIncome, 'otherIncome'),
        deductions: parseNumber(mapped.deductions, 'deductions'),
        retirement401kType: toUpperOptional(mapped.retirement401kType),
        retirement401kRate: parseNumber(mapped.retirement401kRate, 'retirement401kRate'),
        retirement401kAmount: parseNumber(mapped.retirement401kAmount, 'retirement401kAmount'),
        address: normalizeString(mapped.address),
        city: normalizeString(mapped.city),
        county: normalizeString(mapped.county),
        state: toUpperOptional(mapped.state),
        zipCode: normalizeString(mapped.zipCode),
        workCity: normalizeString(mapped.workCity),
        workState: toUpperOptional(mapped.workState),
        localResident: parseBoolean(mapped.localResident),
        bankRoutingNumber: normalizeString(mapped.bankRoutingNumber),
        bankAccountNumber: normalizeString(mapped.bankAccountNumber),
        bankAccountType: toUpperOptional(mapped.bankAccountType),
        companyId: normalizeString(mapped.companyId) ?? defaultCompanyId
      };

      const validated = createEmployeeSchema.parse(candidate);
      const ssnHash = hashSSN(validated.ssn);

      employees.push({
        ...validated,
        ssn: encryptIfNeeded(validated.ssn),
        ssnHash,
        bankAccountNumber: validated.bankAccountNumber
          ? encryptIfNeeded(validated.bankAccountNumber)
          : undefined,
        bankRoutingNumber: validated.bankRoutingNumber
          ? encryptIfNeeded(validated.bankRoutingNumber)
          : undefined,
        importRow: rowNumber
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push({
          row: rowNumber,
          message: error.errors[0]?.message ?? 'Invalid data',
          field: error.errors[0]?.path.join('.')
        });
      } else {
        errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Invalid data'
        });
      }
    }
  });

  return { employees, errors };
}
