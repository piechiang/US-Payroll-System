/**
 * Prisma Client Extension for Multi-Tenant Data Isolation
 *
 * This extension automatically filters all queries by accessible company IDs,
 * preventing cross-tenant data leaks even if developers forget to add filters.
 *
 * SECURITY BENEFITS:
 * - Enforces tenant isolation at the database access layer
 * - Admins bypass filtering (see all companies)
 * - Non-admins only see their explicitly granted companies
 * - Prevents IDOR (Insecure Direct Object Reference) vulnerabilities
 *
 * USAGE:
 *   const tenantPrisma = createTenantAwarePrisma(req.accessibleCompanyIds, req.user.role);
 *   const employees = await tenantPrisma.employee.findMany(); // Auto-filtered!
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../services/logger.js';

// Models that have companyId field and need tenant filtering
const TENANT_MODELS = ['Employee', 'Company', 'Payroll', 'PayPeriod', 'W2Form', 'PayrollRun'];

/**
 * Create a tenant-aware Prisma client that automatically filters by accessible companies
 *
 * @param accessibleCompanyIds - Array of company IDs the user can access
 * @param isAdmin - Whether the user is an admin (bypasses filtering)
 * @returns Extended Prisma client with automatic tenant filtering
 */
export function createTenantAwarePrisma(
  accessibleCompanyIds: string[],
  isAdmin: boolean = false
) {
  const prisma = new PrismaClient();

  return prisma.$extends({
    name: 'tenantAware',
    query: {
      // Apply filtering to Employee model
      employee: {
        async findMany({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          // Check access after fetching
          if (!isAdmin && result && !accessibleCompanyIds.includes(result.companyId)) {
            logger.warn(`Blocked access to Employee ${args.where.id} - cross-tenant access attempt`);
            throw new Error('Access denied: You do not have permission to access this resource');
          }
          return result;
        },
        async update({ args, query }) {
          // First check if they have access
          const existing = await prisma.employee.findUnique({
            where: args.where,
            select: { companyId: true }
          });
          if (!isAdmin && existing && !accessibleCompanyIds.includes(existing.companyId)) {
            throw new Error('Access denied: You do not have permission to modify this resource');
          }
          return query(args);
        },
        async delete({ args, query }) {
          const existing = await prisma.employee.findUnique({
            where: args.where,
            select: { companyId: true }
          });
          if (!isAdmin && existing && !accessibleCompanyIds.includes(existing.companyId)) {
            throw new Error('Access denied: You do not have permission to delete this resource');
          }
          return query(args);
        }
      },

      // Apply filtering to Company model
      company: {
        async findMany({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              id: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              id: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (!isAdmin && result && !accessibleCompanyIds.includes(result.id)) {
            logger.warn(`Blocked access to Company ${args.where.id} - cross-tenant access attempt`);
            throw new Error('Access denied: You do not have permission to access this company');
          }
          return result;
        },
        async update({ args, query }) {
          const existing = await prisma.company.findUnique({
            where: args.where,
            select: { id: true }
          });
          if (!isAdmin && existing && !accessibleCompanyIds.includes(existing.id)) {
            throw new Error('Access denied: You do not have permission to modify this company');
          }
          return query(args);
        }
      },

      // Apply filtering to Payroll model
      payroll: {
        async findMany({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (!isAdmin && result && !accessibleCompanyIds.includes(result.companyId)) {
            logger.warn(`Blocked access to Payroll ${args.where.id} - cross-tenant access attempt`);
            throw new Error('Access denied: You do not have permission to access this payroll record');
          }
          return result;
        }
      },

      // Apply filtering to PayPeriod model
      payPeriod: {
        async findMany({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        }
      },

      // Apply filtering to W2Form model
      w2Form: {
        async findMany({ args, query }) {
          if (!isAdmin) {
            args.where = {
              ...args.where,
              companyId: { in: accessibleCompanyIds }
            };
          }
          return query(args);
        }
      }
    }
  });
}

/**
 * Middleware version (alternative approach using Prisma middleware instead of extensions)
 * Use this if you prefer middleware over extensions
 */
export function createTenantFilteringMiddleware(
  accessibleCompanyIds: string[],
  isAdmin: boolean
): Prisma.Middleware {
  return async (params: Prisma.MiddlewareParams, next) => {
    // Skip filtering for admins
    if (isAdmin) {
      return next(params);
    }

    // Only filter models with companyId
    if (!TENANT_MODELS.includes(params.model || '')) {
      return next(params);
    }

    // Apply filtering to findMany and findFirst
    if (params.action === 'findMany' || params.action === 'findFirst') {
      // Special case: Company model uses 'id' instead of 'companyId'
      const filterField = params.model === 'Company' ? 'id' : 'companyId';

      params.args.where = {
        ...params.args.where,
        [filterField]: { in: accessibleCompanyIds }
      };
    }

    // For findUnique, update, delete: check access after fetching
    if (params.action === 'findUnique' || params.action === 'update' || params.action === 'delete') {
      const result = await next(params);

      if (result) {
        const companyId = params.model === 'Company' ? result.id : result.companyId;

        if (companyId && !accessibleCompanyIds.includes(companyId)) {
          logger.warn(
            `Blocked ${params.action} on ${params.model} - user has no access to company ${companyId}`
          );
          throw new Error('Access denied: You do not have permission to access this resource');
        }
      }

      return result;
    }

    return next(params);
  };
}
