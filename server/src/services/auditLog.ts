import { prisma } from '../index.js';
import { AuthRequest } from '../middleware/auth.js';
import { logger } from './logger.js';

/**
 * Audit Log Service
 *
 * Records all access to sensitive data for compliance and security monitoring.
 * Tracks: SSN access, bank account access, payroll operations, user management
 */

// Action types
export type AuditAction =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_CHANGE_FAILED'
  | 'PAYROLL_RUN';

// Resource types
export type AuditResource =
  | 'EMPLOYEE'
  | 'EMPLOYEE_SSN'
  | 'EMPLOYEE_BANK'
  | 'PAYROLL'
  | 'COMPANY'
  | 'USER'
  | 'AUTH';

export interface AuditLogEntry {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  companyId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log an audit event
 */
export async function logAudit(
  req: AuthRequest | null,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        // Who
        userId: req?.user?.userId || null,
        userEmail: req?.user?.email || null,
        userRole: req?.user?.role || null,

        // What
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId || null,
        companyId: entry.companyId || null,

        // Details
        description: entry.description || null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,

        // Where
        ipAddress: getClientIP(req) || null,
        userAgent: req?.headers?.['user-agent'] || null,

        // Outcome
        success: entry.success ?? true,
        errorMessage: entry.errorMessage || null,
      }
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main operation
    logger.error('Failed to write audit log:', error);
  }
}

/**
 * Log sensitive data access (SSN, bank account)
 */
export async function logSensitiveAccess(
  req: AuthRequest,
  resource: 'EMPLOYEE_SSN' | 'EMPLOYEE_BANK',
  employeeId: string,
  companyId: string,
  action: 'VIEW' | 'UPDATE' = 'VIEW'
): Promise<void> {
  await logAudit(req, {
    action,
    resource,
    resourceId: employeeId,
    companyId,
    description: `${action === 'VIEW' ? 'Accessed' : 'Modified'} ${resource === 'EMPLOYEE_SSN' ? 'SSN' : 'bank account'} for employee ${employeeId}`,
  });
}

/**
 * Log employee record access
 */
export async function logEmployeeAccess(
  req: AuthRequest,
  action: AuditAction,
  employeeId: string,
  companyId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAudit(req, {
    action,
    resource: 'EMPLOYEE',
    resourceId: employeeId,
    companyId,
    description: `${action} employee record`,
    metadata,
  });
}

/**
 * Log payroll operations
 */
export async function logPayrollOperation(
  req: AuthRequest,
  action: AuditAction,
  companyId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAudit(req, {
    action,
    resource: 'PAYROLL',
    companyId,
    description: action === 'PAYROLL_RUN' ? 'Executed payroll run' : `${action} payroll record`,
    metadata,
  });
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  req: AuthRequest | null,
  action: 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'PASSWORD_CHANGE_FAILED',
  email: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await logAudit(req, {
    action,
    resource: 'AUTH',
    description: `User ${action.toLowerCase().replace(/_/g, ' ')}: ${email}`,
    metadata: { email },
    success,
    errorMessage,
  });
}

/**
 * Get client IP address from request
 */
function getClientIP(req: AuthRequest | null): string | null {
  if (!req) return null;

  // Check for forwarded IP (behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }

  // Direct connection
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  companyId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.resource) where.resource = filters.resource;
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.companyId) where.companyId = filters.companyId;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) (where.createdAt as Record<string, Date>).gte = filters.startDate;
    if (filters.endDate) (where.createdAt as Record<string, Date>).lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
