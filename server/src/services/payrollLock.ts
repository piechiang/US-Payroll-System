import { prisma } from '../index.js';
import crypto from 'crypto';

/**
 * Payroll Lock Service
 *
 * Implements distributed locking to prevent concurrent payroll runs
 * for the same company and pay period.
 *
 * Features:
 * - Pessimistic locking: Only one payroll run can process at a time per company/period
 * - Idempotency: Duplicate requests with same key are rejected
 * - Auto-expiration: Stale locks expire after 10 minutes
 * - Transaction-safe: Works within Prisma transactions
 */

// Lock expires after 10 minutes (covers long payroll runs)
const LOCK_EXPIRATION_MS = 10 * 60 * 1000;

export interface PayrollLockParams {
  companyId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  userId: string;
  idempotencyKey?: string; // Optional client-provided key
}

export interface PayrollLockResult {
  success: boolean;
  lockId?: string;
  error?: 'ALREADY_RUNNING' | 'ALREADY_PROCESSED' | 'DUPLICATE_REQUEST';
  message?: string;
  existingLock?: {
    lockedBy: string;
    lockedAt: Date;
    status: string;
  };
}

/**
 * Generate idempotency key from payroll parameters
 * Used when client doesn't provide one
 */
export function generateIdempotencyKey(params: {
  companyId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  payDate: Date;
}): string {
  const data = `${params.companyId}:${params.payPeriodStart.toISOString()}:${params.payPeriodEnd.toISOString()}:${params.payDate.toISOString()}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Acquire a lock for payroll processing
 * Returns success if lock was acquired, error if already locked or processed
 */
export async function acquirePayrollLock(params: PayrollLockParams): Promise<PayrollLockResult> {
  const { companyId, payPeriodStart, payPeriodEnd, userId, idempotencyKey } = params;

  // Use provided key or generate one
  const key = idempotencyKey || generateIdempotencyKey({
    companyId,
    payPeriodStart,
    payPeriodEnd,
    payDate: new Date() // Include current time if no key provided
  });

  try {
    // First, check for duplicate idempotency key
    const existingByKey = await prisma.payrollLock.findUnique({
      where: { idempotencyKey: key }
    });

    if (existingByKey) {
      // Same request already processed or in progress
      if (existingByKey.status === 'COMPLETED') {
        return {
          success: false,
          error: 'DUPLICATE_REQUEST',
          message: 'This payroll run has already been processed',
          existingLock: {
            lockedBy: existingByKey.lockedBy,
            lockedAt: existingByKey.lockedAt,
            status: existingByKey.status
          }
        };
      }
      if (existingByKey.status === 'ACTIVE') {
        // Check if lock expired
        if (existingByKey.expiresAt < new Date()) {
          // Lock expired, update to EXPIRED and allow retry
          await prisma.payrollLock.update({
            where: { id: existingByKey.id },
            data: { status: 'EXPIRED' }
          });
        } else {
          return {
            success: false,
            error: 'ALREADY_RUNNING',
            message: 'A payroll run for this period is already in progress',
            existingLock: {
              lockedBy: existingByKey.lockedBy,
              lockedAt: existingByKey.lockedAt,
              status: existingByKey.status
            }
          };
        }
      }
    }

    // Check for any active lock on this company/period
    const activeLock = await prisma.payrollLock.findFirst({
      where: {
        companyId,
        payPeriodStart,
        payPeriodEnd,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() } // Not expired
      }
    });

    if (activeLock) {
      return {
        success: false,
        error: 'ALREADY_RUNNING',
        message: 'A payroll run for this period is already in progress',
        existingLock: {
          lockedBy: activeLock.lockedBy,
          lockedAt: activeLock.lockedAt,
          status: activeLock.status
        }
      };
    }

    // Check if this period was already successfully processed
    const completedLock = await prisma.payrollLock.findFirst({
      where: {
        companyId,
        payPeriodStart,
        payPeriodEnd,
        status: 'COMPLETED'
      }
    });

    if (completedLock) {
      return {
        success: false,
        error: 'ALREADY_PROCESSED',
        message: 'Payroll for this period has already been processed',
        existingLock: {
          lockedBy: completedLock.lockedBy,
          lockedAt: completedLock.lockedAt,
          status: completedLock.status
        }
      };
    }

    // Create new lock
    const expiresAt = new Date(Date.now() + LOCK_EXPIRATION_MS);
    const lock = await prisma.payrollLock.create({
      data: {
        companyId,
        payPeriodStart,
        payPeriodEnd,
        lockedBy: userId,
        expiresAt,
        idempotencyKey: key,
        status: 'ACTIVE'
      }
    });

    return {
      success: true,
      lockId: lock.id
    };
  } catch (error: unknown) {
    // Handle unique constraint violation (race condition)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return {
        success: false,
        error: 'ALREADY_RUNNING',
        message: 'A concurrent payroll run request was detected'
      };
    }
    throw error;
  }
}

/**
 * Release a lock after successful processing
 */
export async function releasePayrollLock(lockId: string, success: boolean = true): Promise<void> {
  await prisma.payrollLock.update({
    where: { id: lockId },
    data: {
      status: success ? 'COMPLETED' : 'FAILED'
    }
  });
}

/**
 * Clean up expired locks (can be run periodically)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await prisma.payrollLock.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() }
    },
    data: {
      status: 'EXPIRED'
    }
  });
  return result.count;
}

/**
 * Get lock status for a company/period
 */
export async function getPayrollLockStatus(
  companyId: string,
  payPeriodStart: Date,
  payPeriodEnd: Date
): Promise<{
  isLocked: boolean;
  isProcessed: boolean;
  lock?: {
    id: string;
    lockedBy: string;
    lockedAt: Date;
    status: string;
    expiresAt: Date;
  };
}> {
  const lock = await prisma.payrollLock.findFirst({
    where: {
      companyId,
      payPeriodStart,
      payPeriodEnd,
      status: { in: ['ACTIVE', 'COMPLETED'] }
    },
    orderBy: { lockedAt: 'desc' }
  });

  if (!lock) {
    return { isLocked: false, isProcessed: false };
  }

  const isExpired = lock.status === 'ACTIVE' && lock.expiresAt < new Date();

  return {
    isLocked: lock.status === 'ACTIVE' && !isExpired,
    isProcessed: lock.status === 'COMPLETED',
    lock: {
      id: lock.id,
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt,
      status: isExpired ? 'EXPIRED' : lock.status,
      expiresAt: lock.expiresAt
    }
  };
}
