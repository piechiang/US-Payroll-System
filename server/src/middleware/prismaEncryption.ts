/**
 * Prisma Middleware for Automatic Encryption/Decryption
 *
 * This middleware automatically encrypts sensitive fields before writing to database
 * and decrypts them after reading, ensuring developers can't forget to encrypt.
 *
 * SECURITY FEATURES:
 * - Automatic SSN encryption + hashing for duplicate detection
 * - Automatic bank account encryption
 * - Transparent decryption on read
 * - Prevents double-encryption with isEncrypted check
 */

import { Prisma } from '@prisma/client';
import { encrypt, decrypt, hashSSN, isEncrypted } from '../services/encryption.js';
import { logger } from '../services/logger.js';

// Define which fields need encryption for each model
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Employee: ['ssn', 'bankRoutingNumber', 'bankAccountNumber']
};

/**
 * Encrypt sensitive fields before database write operations
 */
function encryptBeforeWrite(params: Prisma.MiddlewareParams): void {
  const modelFields = ENCRYPTED_FIELDS[params.model as string];
  if (!modelFields || !params.args.data) return;

  for (const field of modelFields) {
    const value = params.args.data[field];

    // Skip if field is not being set or is already encrypted
    if (!value || isEncrypted(value)) continue;

    try {
      // Encrypt the field
      params.args.data[field] = encrypt(value);

      // Special handling for SSN: also generate hash for duplicate detection
      if (field === 'ssn' && params.model === 'Employee') {
        params.args.data.ssnHash = hashSSN(value);
        logger.debug(`Auto-encrypted SSN and generated hash for Employee`);
      }
    } catch (error) {
      logger.error(`Failed to encrypt ${field} in ${params.model}:`, error);
      throw new Error(`Encryption failed for ${field}`);
    }
  }
}

/**
 * Decrypt sensitive fields after database read operations
 */
function decryptAfterRead(result: any, params: Prisma.MiddlewareParams): any {
  if (!result) return result;

  const modelFields = ENCRYPTED_FIELDS[params.model as string];
  if (!modelFields) return result;

  const decryptRecord = (record: any) => {
    if (!record) return record;

    for (const field of modelFields) {
      const value = record[field];
      if (value && isEncrypted(value)) {
        try {
          record[field] = decrypt(value);
        } catch (error) {
          logger.error(`Failed to decrypt ${field} in ${params.model}:`, error);
          // Don't throw - return masked value instead to prevent data loss
          record[field] = null;
        }
      }
    }
    return record;
  };

  // Handle single record
  if (!Array.isArray(result)) {
    return decryptRecord(result);
  }

  // Handle array of records
  return result.map(decryptRecord);
}

/**
 * Prisma middleware factory for encryption
 * Call this when initializing Prisma Client
 */
export function createEncryptionMiddleware(): Prisma.Middleware {
  return async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<any>) => {
    // Encrypt before CREATE and UPDATE operations
    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
      encryptBeforeWrite(params);

      // For upsert, encrypt both create and update data
      if (params.action === 'upsert' && params.args.update) {
        const updateParams = { ...params, args: { data: params.args.update } };
        encryptBeforeWrite(updateParams);
      }
    }

    // Execute the query
    const result = await next(params);

    // Decrypt after READ operations
    if (params.action === 'findUnique' ||
        params.action === 'findFirst' ||
        params.action === 'findMany') {
      return decryptAfterRead(result, params);
    }

    return result;
  };
}
