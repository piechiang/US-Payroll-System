/**
 * ACH (Automated Clearing House) File Generator
 *
 * Generates NACHA-compliant ACH files for direct deposit payroll.
 * Format follows the 2024 NACHA Operating Rules.
 *
 * File Structure:
 * - File Header Record (1 per file)
 * - Batch Header Record (1 per batch)
 * - Entry Detail Records (1 per employee)
 * - Addenda Records (optional, for additional info)
 * - Batch Control Record (1 per batch)
 * - File Control Record (1 per file)
 *
 * Each record is exactly 94 characters.
 */

import { decrypt, isEncrypted } from './encryption.js';

// ACH Record Types
const RECORD_TYPE = {
  FILE_HEADER: '1',
  BATCH_HEADER: '5',
  ENTRY_DETAIL: '6',
  ADDENDA: '7',
  BATCH_CONTROL: '8',
  FILE_CONTROL: '9'
};

// Transaction codes for direct deposit
const TRANSACTION_CODE = {
  CHECKING_CREDIT: '22',  // Credit to checking account
  CHECKING_DEBIT: '27',   // Debit from checking account
  SAVINGS_CREDIT: '32',   // Credit to savings account
  SAVINGS_DEBIT: '37'     // Debit from savings account
};

// Service Class Codes
const SERVICE_CLASS = {
  MIXED: '200',           // Mixed debits and credits
  CREDITS_ONLY: '220',    // Credits only (payroll)
  DEBITS_ONLY: '225'      // Debits only
};

export interface ACHCompanyInfo {
  companyName: string;
  companyId: string;           // Usually EIN without dashes
  routingNumber: string;       // Company's bank routing number
  accountNumber: string;       // Company's bank account number
  accountType: 'CHECKING' | 'SAVINGS';
}

export interface ACHOriginatorInfo {
  originatorId: string;        // Usually same as company ID
  originatorName: string;
  originatingDFI: string;      // 8-digit routing number (without check digit)
  immediateDestination: string; // Bank's routing number
  immediateDestinationName: string;
  immediateOrigin: string;     // Company's routing number
  immediateOriginName: string;
}

export interface ACHEntry {
  employeeId: string;
  employeeName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS';
  amount: number;              // In dollars (will be converted to cents)
  individualId?: string;       // Employee ID or SSN (last 4)
}

export interface ACHBatch {
  entries: ACHEntry[];
  effectiveDate: Date;         // Date funds should be available
  companyEntryDescription: string;  // e.g., "PAYROLL", "DIRECT PAY"
}

/**
 * Generate a NACHA-compliant ACH file for direct deposit
 */
export function generateACHFile(
  originator: ACHOriginatorInfo,
  company: ACHCompanyInfo,
  batch: ACHBatch
): string {
  const lines: string[] = [];
  const fileCreationDate = new Date();

  // File Header Record
  lines.push(generateFileHeader(originator, fileCreationDate));

  // Batch Header Record
  const batchNumber = 1;
  lines.push(generateBatchHeader(company, batch, batchNumber));

  // Entry Detail Records
  let entrySequence = 0;
  let totalDebits = 0;
  let totalCredits = 0;
  let entryHash = 0;

  for (const entry of batch.entries) {
    entrySequence++;
    const entryLine = generateEntryDetail(entry, originator.originatingDFI, entrySequence);
    lines.push(entryLine);

    // Accumulate totals
    totalCredits += Math.round(entry.amount * 100);

    // Entry hash is sum of first 8 digits of routing numbers
    const routingPrefix = parseInt(entry.routingNumber.substring(0, 8), 10);
    entryHash += routingPrefix;
  }

  // Entry hash is last 10 digits only
  entryHash = entryHash % 10000000000;

  // Batch Control Record
  lines.push(generateBatchControl(
    company,
    batchNumber,
    batch.entries.length,
    entryHash,
    totalDebits,
    totalCredits
  ));

  // File Control Record
  lines.push(generateFileControl(
    1,  // batch count
    (lines.length + 1),  // block count will be calculated
    batch.entries.length,
    entryHash,
    totalDebits,
    totalCredits
  ));

  // Pad file to complete block (10 records per block)
  const recordCount = lines.length;
  const blockCount = Math.ceil(recordCount / 10);
  const paddingNeeded = (blockCount * 10) - recordCount;

  for (let i = 0; i < paddingNeeded; i++) {
    lines.push('9'.repeat(94));
  }

  return lines.join('\n');
}

/**
 * Generate File Header Record (Record Type 1)
 */
function generateFileHeader(originator: ACHOriginatorInfo, creationDate: Date): string {
  const record = [
    RECORD_TYPE.FILE_HEADER,                           // 1: Record Type Code
    '01',                                              // 2-3: Priority Code
    padLeft(originator.immediateDestination, 10),     // 4-13: Immediate Destination (with leading space)
    padLeft(originator.immediateOrigin, 10),          // 14-23: Immediate Origin
    formatDate(creationDate),                          // 24-29: File Creation Date (YYMMDD)
    formatTime(creationDate),                          // 30-33: File Creation Time (HHMM)
    'A',                                               // 34: File ID Modifier
    '094',                                             // 35-37: Record Size
    '10',                                              // 38-39: Blocking Factor
    '1',                                               // 40: Format Code
    padRight(originator.immediateDestinationName, 23), // 41-63: Immediate Destination Name
    padRight(originator.immediateOriginName, 23),     // 64-86: Immediate Origin Name
    padRight('', 8)                                   // 87-94: Reference Code
  ].join('');

  return record;
}

/**
 * Generate Batch Header Record (Record Type 5)
 */
function generateBatchHeader(
  company: ACHCompanyInfo,
  batch: ACHBatch,
  batchNumber: number
): string {
  const record = [
    RECORD_TYPE.BATCH_HEADER,                          // 1: Record Type Code
    SERVICE_CLASS.CREDITS_ONLY,                        // 2-4: Service Class Code
    padRight(company.companyName, 16),                 // 5-20: Company Name
    padRight('', 20),                                  // 21-40: Company Discretionary Data
    padRight(company.companyId, 10),                   // 41-50: Company Identification
    'PPD',                                             // 51-53: Standard Entry Class (PPD = Payroll)
    padRight(batch.companyEntryDescription, 10),      // 54-63: Company Entry Description
    formatDate(new Date()),                            // 64-69: Company Descriptive Date
    formatDate(batch.effectiveDate),                   // 70-75: Effective Entry Date
    '   ',                                             // 76-78: Settlement Date (blank, filled by bank)
    '1',                                               // 79: Originator Status Code
    padRight(company.routingNumber.substring(0, 8), 8), // 80-87: Originating DFI Identification
    padLeft(batchNumber.toString(), 7, '0')           // 88-94: Batch Number
  ].join('');

  return record;
}

/**
 * Generate Entry Detail Record (Record Type 6)
 */
function generateEntryDetail(
  entry: ACHEntry,
  originatingDFI: string,
  sequenceNumber: number
): string {
  // Decrypt account number if encrypted
  let accountNumber = entry.accountNumber;
  if (isEncrypted(accountNumber)) {
    accountNumber = decrypt(accountNumber);
  }

  // Decrypt routing number if encrypted
  let routingNumber = entry.routingNumber;
  if (isEncrypted(routingNumber)) {
    routingNumber = decrypt(routingNumber);
  }

  const transactionCode = entry.accountType === 'CHECKING'
    ? TRANSACTION_CODE.CHECKING_CREDIT
    : TRANSACTION_CODE.SAVINGS_CREDIT;

  // Amount in cents, 10 digits
  const amountCents = Math.round(entry.amount * 100);

  const record = [
    RECORD_TYPE.ENTRY_DETAIL,                          // 1: Record Type Code
    transactionCode,                                   // 2-3: Transaction Code
    padRight(routingNumber.substring(0, 8), 8),       // 4-11: Receiving DFI Identification
    routingNumber.charAt(8) || ' ',                   // 12: Check Digit
    padRight(accountNumber, 17),                      // 13-29: DFI Account Number
    padLeft(amountCents.toString(), 10, '0'),         // 30-39: Amount
    padRight(entry.individualId || entry.employeeId, 15), // 40-54: Individual Identification
    padRight(entry.employeeName.substring(0, 22), 22), // 55-76: Individual Name
    '  ',                                              // 77-78: Discretionary Data
    '0',                                               // 79: Addenda Record Indicator
    padRight(originatingDFI, 8),                      // 80-87: Trace Number (ODFI routing)
    padLeft(sequenceNumber.toString(), 7, '0')        // 88-94: Trace Number (sequence)
  ].join('');

  return record;
}

/**
 * Generate Batch Control Record (Record Type 8)
 */
function generateBatchControl(
  company: ACHCompanyInfo,
  batchNumber: number,
  entryCount: number,
  entryHash: number,
  totalDebits: number,
  totalCredits: number
): string {
  const record = [
    RECORD_TYPE.BATCH_CONTROL,                         // 1: Record Type Code
    SERVICE_CLASS.CREDITS_ONLY,                        // 2-4: Service Class Code
    padLeft(entryCount.toString(), 6, '0'),           // 5-10: Entry/Addenda Count
    padLeft(entryHash.toString(), 10, '0'),           // 11-20: Entry Hash
    padLeft(totalDebits.toString(), 12, '0'),         // 21-32: Total Debit Entry Dollar Amount
    padLeft(totalCredits.toString(), 12, '0'),        // 33-44: Total Credit Entry Dollar Amount
    padRight(company.companyId, 10),                   // 45-54: Company Identification
    padRight('', 19),                                  // 55-73: Message Authentication Code
    padRight('', 6),                                   // 74-79: Reserved
    padRight(company.routingNumber.substring(0, 8), 8), // 80-87: Originating DFI Identification
    padLeft(batchNumber.toString(), 7, '0')           // 88-94: Batch Number
  ].join('');

  return record;
}

/**
 * Generate File Control Record (Record Type 9)
 */
function generateFileControl(
  batchCount: number,
  blockCount: number,
  entryCount: number,
  entryHash: number,
  totalDebits: number,
  totalCredits: number
): string {
  const actualBlockCount = Math.ceil((blockCount + 1) / 10);

  const record = [
    RECORD_TYPE.FILE_CONTROL,                          // 1: Record Type Code
    padLeft(batchCount.toString(), 6, '0'),           // 2-7: Batch Count
    padLeft(actualBlockCount.toString(), 6, '0'),     // 8-13: Block Count
    padLeft(entryCount.toString(), 8, '0'),           // 14-21: Entry/Addenda Count
    padLeft(entryHash.toString(), 10, '0'),           // 22-31: Entry Hash
    padLeft(totalDebits.toString(), 12, '0'),         // 32-43: Total Debit Entry Dollar Amount
    padLeft(totalCredits.toString(), 12, '0'),        // 44-55: Total Credit Entry Dollar Amount
    padRight('', 39)                                   // 56-94: Reserved
  ].join('');

  return record;
}

// Helper functions
function padLeft(str: string, length: number, char: string = ' '): string {
  return str.padStart(length, char).substring(0, length);
}

function padRight(str: string, length: number, char: string = ' '): string {
  return str.padEnd(length, char).substring(0, length);
}

function formatDate(date: Date): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function formatTime(date: Date): string {
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}${mm}`;
}

/**
 * Validate ACH file content
 */
export function validateACHFile(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split('\n');

  if (lines.length === 0) {
    errors.push('File is empty');
    return { valid: false, errors };
  }

  // Check record length
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length !== 94) {
      errors.push(`Line ${i + 1}: Invalid length (${lines[i].length}, expected 94)`);
    }
  }

  // Check file structure
  if (lines[0]?.charAt(0) !== '1') {
    errors.push('Missing File Header Record (Type 1)');
  }

  // Find file control record
  const controlIndex = lines.findIndex(l => l.charAt(0) === '9' && l.charAt(1) !== '9');
  if (controlIndex === -1) {
    errors.push('Missing File Control Record (Type 9)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate check digit for routing number (Modulus 10)
 */
export function calculateRoutingCheckDigit(routing: string): string {
  if (routing.length < 8) {
    throw new Error('Routing number must be at least 8 digits');
  }

  const digits = routing.substring(0, 8).split('').map(Number);
  const sum = (3 * (digits[0] + digits[3] + digits[6])) +
              (7 * (digits[1] + digits[4] + digits[7])) +
              (1 * (digits[2] + digits[5]));

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

/**
 * Validate routing number format and check digit
 */
export function validateRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) {
    return false;
  }

  const expectedCheckDigit = calculateRoutingCheckDigit(routing);
  return routing.charAt(8) === expectedCheckDigit;
}
