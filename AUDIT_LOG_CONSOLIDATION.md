# Audit Log System Consolidation

## Problem: Duplicate Audit Logging Systems

**Severity**: HIGH
**Issue Type**: Code Duplication / Data Consistency / Resource Leak
**Impact**: Inconsistent audit trails, connection pool exhaustion, maintenance burden

---

## Current State: Two Parallel Systems

### System 1: `auditLog.ts` (Modern, Feature-Rich)

**Location**: `server/src/services/auditLog.ts`

**Features**:
- Uses shared Prisma client from `index.js`
- Rich field set: `userEmail`, `userRole`, `ipAddress`, `userAgent`, `success`, `errorMessage`
- Uses `resource/resourceId` terminology
- Supports authentication events (LOGIN, LOGOUT)
- Supports sensitive data access (SSN, bank accounts)
- Takes `AuthRequest` for automatic context extraction

**Field Mapping**:
```typescript
{
  userId: req?.user?.userId || null,
  userEmail: req?.user?.email || null,       // ✅ Rich
  userRole: req?.user?.role || null,         // ✅ Rich
  action: entry.action,
  resource: entry.resource,                   // ✅ Modern terminology
  resourceId: entry.resourceId || null,
  companyId: entry.companyId || null,
  description: entry.description || null,     // ✅ Rich
  metadata: JSON.stringify(entry.metadata),
  ipAddress: getClientIP(req) || null,        // ✅ Security
  userAgent: req?.headers?.['user-agent'],    // ✅ Security
  success: entry.success ?? true,             // ✅ Outcome tracking
  errorMessage: entry.errorMessage || null    // ✅ Error details
}
```

**Used By**:
- `routes/auth.ts` - Authentication events
- `routes/employee.ts` - Employee access, SSN/bank access
- `routes/payroll.ts` - Payroll operations

### System 2: `auditLogger.ts` (Legacy, Limited)

**Location**: `server/src/services/auditLogger.ts`

**Problems**:
- ❌ **Creates own PrismaClient** (line 4: `const prisma = new PrismaClient()`)
- ❌ Connection pool leak (bypasses global singleton)
- ❌ Uses old `entity/entityId` terminology
- ❌ Limited field set (no IP, user agent, success tracking)
- ❌ No support for auth events
- ❌ Requires manual `userId` extraction

**Field Mapping**:
```typescript
{
  userId: data.userId,                        // ❌ Manual
  companyId: data.companyId,                  // ❌ Manual
  action: data.action,
  entity: data.entity,                        // ❌ Old terminology
  entityId: data.entityId,                    // ❌ Old terminology
  changes: JSON.stringify(data.changes),
  metadata: JSON.stringify(data.metadata),
  requestId: storage.getStore()?.get('requestId')  // ✅ Request tracking
}
```

**Used By**:
- `routes/glExport.ts` - GL export auditing

**Enums**:
```typescript
enum AuditAction {
  CREATE, UPDATE, DELETE, VIEW, EXPORT, APPROVE, REJECT
  // ❌ Missing: LOGIN, LOGOUT, PASSWORD_CHANGE, etc.
}

enum AuditEntity {
  EMPLOYEE, PAYROLL, COMPANY, TAX_INFO, W2_FORM, GARNISHMENT, CONTRACTOR
  // ❌ Missing: AUTH, EMPLOYEE_SSN, EMPLOYEE_BANK
}
```

---

## Issues

### 1. Connection Pool Exhaustion

**auditLogger.ts line 4**:
```typescript
const prisma = new PrismaClient();
```

**Problem**:
- Creates duplicate Prisma client instance
- Bypasses global connection pool
- Same issue as metrics/ACH routes (already fixed)
- Wastes database connections

**Impact**:
- Connection pool exhaustion
- Memory overhead
- Slower queries (no connection reuse)

### 2. Inconsistent Terminology

**Field Names**:
- System 1: `resource/resourceId`
- System 2: `entity/entityId`

**After Schema Fix**:
- Database has: `resource/resourceId`
- System 2 writes to wrong fields!

### 3. Missing Security Context

System 2 doesn't capture:
- IP address (security forensics)
- User agent (client identification)
- Success/failure (outcome tracking)
- User email/role (cached for audit trail)

### 4. Maintenance Burden

**Two systems means**:
- Duplicate code
- Inconsistent behavior
- Two places to update
- Developer confusion

---

## Solution: Consolidate to `auditLog.ts`

### Step 1: Migrate `glExport.ts` to Use `auditLog.ts`

**Current (glExport.ts)**:
```typescript
import { AuditLogger, AuditAction, AuditEntity } from '../services/auditLogger.js';

// Usage
await AuditLogger.log({
  userId: req.user!.userId,
  companyId,
  action: AuditAction.EXPORT,
  entity: AuditEntity.COMPANY,
  entityId: companyId,
  metadata: {
    format: 'CSV',
    startDate,
    endDate,
    entriesCount: glEntries.length
  }
});
```

**After Migration**:
```typescript
import { logAudit } from '../services/auditLog.js';

// Usage
await logAudit(req, {
  action: 'EXPORT',
  resource: 'COMPANY',
  resourceId: companyId,
  companyId,
  description: `Exported GL data (${glEntries.length} entries)`,
  metadata: {
    format: 'CSV',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    entriesCount: glEntries.length
  }
});
```

**Benefits**:
- Automatic context extraction from `req` (IP, user agent, user email/role)
- Consistent field names (`resource` not `entity`)
- Success/failure tracking
- No manual userId extraction

### Step 2: Delete `auditLogger.ts`

**After migrating glExport.ts**:
```bash
rm server/src/services/auditLogger.ts
```

**Verification**:
```bash
# Ensure no imports remain
grep -r "auditLogger" server/src --include="*.ts"
# Should return no results
```

### Step 3: Add Missing Action/Resource Types to `auditLog.ts`

**Update enums/types**:
```typescript
// Add to AuditAction type
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
  | 'PAYROLL_RUN'
  | 'APPROVE'    // NEW from auditLogger
  | 'REJECT';    // NEW from auditLogger

// Add to AuditResource type
export type AuditResource =
  | 'EMPLOYEE'
  | 'EMPLOYEE_SSN'
  | 'EMPLOYEE_BANK'
  | 'PAYROLL'
  | 'COMPANY'
  | 'USER'
  | 'AUTH'
  | 'TAX_INFO'      // NEW from auditLogger
  | 'W2_FORM'       // NEW from auditLogger
  | 'GARNISHMENT'   // NEW from auditLogger
  | 'CONTRACTOR';   // NEW from auditLogger
```

---

## Implementation

### File: `server/src/routes/glExport.ts`

**Before**:
```typescript
import { AuditLogger, AuditAction, AuditEntity } from '../services/auditLogger.js';

router.post('/csv', authenticate, async (req: AuthRequest, res: Response) => {
  // ... CSV generation

  // Audit log
  await AuditLogger.log({
    userId: req.user!.userId,
    companyId,
    action: AuditAction.EXPORT,
    entity: AuditEntity.COMPANY,
    entityId: companyId,
    metadata: {
      format: 'CSV',
      startDate,
      endDate,
      entriesCount: glEntries.length
    }
  });

  res.json({ data: csv });
});
```

**After**:
```typescript
import { logAudit } from '../services/auditLog.js';

router.post('/csv', authenticate, async (req: AuthRequest, res: Response) => {
  // ... CSV generation

  // Audit log
  await logAudit(req, {
    action: 'EXPORT',
    resource: 'COMPANY',
    resourceId: companyId,
    companyId,
    description: `GL export (CSV, ${glEntries.length} entries)`,
    metadata: {
      format: 'CSV',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      entriesCount: glEntries.length
    }
  });

  res.json({ data: csv });
});
```

### File: `server/src/services/auditLog.ts`

**Add Missing Types**:
```typescript
// Current
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

// Updated
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
  | 'PAYROLL_RUN'
  | 'APPROVE'    // From auditLogger
  | 'REJECT';    // From auditLogger

// Current
export type AuditResource =
  | 'EMPLOYEE'
  | 'EMPLOYEE_SSN'
  | 'EMPLOYEE_BANK'
  | 'PAYROLL'
  | 'COMPANY'
  | 'USER'
  | 'AUTH';

// Updated
export type AuditResource =
  | 'EMPLOYEE'
  | 'EMPLOYEE_SSN'
  | 'EMPLOYEE_BANK'
  | 'PAYROLL'
  | 'COMPANY'
  | 'USER'
  | 'AUTH'
  | 'TAX_INFO'      // From auditLogger
  | 'W2_FORM'       // From auditLogger
  | 'GARNISHMENT'   // From auditLogger
  | 'CONTRACTOR';   // From auditLogger
```

---

## Migration Checklist

- [ ] Update `auditLog.ts` with missing action/resource types
- [ ] Migrate `glExport.ts` to use `logAudit()` instead of `AuditLogger`
- [ ] Test GL export audit logging
- [ ] Verify audit logs written correctly
- [ ] Delete `auditLogger.ts`
- [ ] Search codebase for any remaining references
- [ ] Update documentation
- [ ] Commit changes

---

## Benefits After Consolidation

### Code Quality
- ✅ Single source of truth
- ✅ Consistent terminology
- ✅ Easier maintenance
- ✅ Less code duplication

### Performance
- ✅ Uses shared Prisma client
- ✅ No connection pool exhaustion
- ✅ Better connection reuse

### Security & Compliance
- ✅ IP address logging for all events
- ✅ User agent logging for all events
- ✅ Success/failure tracking for all events
- ✅ Cached user email/role for audit trail

### Data Consistency
- ✅ All logs use same field names
- ✅ All logs have rich context
- ✅ Easier to query and analyze

---

## Backward Compatibility

### Breaking Changes: None

**Why**:
- Only one file uses `auditLogger.ts` (glExport.ts)
- Migration is straightforward
- No API changes
- No database changes (schema already supports both)

### Database Compatibility

**After schema migration** (from AUDIT_LOG_SCHEMA_FIX.md):
- Database has `resource/resourceId` fields
- Both old and new audit logs work

**auditLogger.ts writes**:
- `entity` → Will fail after migration (field renamed to `resource`)
- `entityId` → Will fail after migration (field renamed to `resourceId`)

**This is why consolidation is URGENT**: After schema migration, `auditLogger.ts` will break!

---

## Testing

### Test GL Export Auditing

```typescript
// Before migration
import { AuditLogger, AuditAction, AuditEntity } from '../services/auditLogger.js';

// 1. Trigger GL export
const response = await request(app)
  .post('/api/gl-export/csv')
  .set('Authorization', `Bearer ${token}`)
  .send({
    companyId: 'comp-123',
    startDate: '2024-01-01',
    endDate: '2024-12-31'
  });

// 2. Verify audit log created
const logs = await prisma.auditLog.findMany({
  where: {
    resource: 'COMPANY',
    action: 'EXPORT'
  },
  take: 1,
  orderBy: { createdAt: 'desc' }
});

expect(logs[0]).toMatchObject({
  userId: expect.any(String),
  userEmail: expect.any(String),
  userRole: expect.any(String),
  action: 'EXPORT',
  resource: 'COMPANY',
  resourceId: 'comp-123',
  companyId: 'comp-123',
  ipAddress: expect.any(String),
  userAgent: expect.any(String),
  success: true,
  metadata: expect.stringContaining('entriesCount')
});
```

---

## Timeline

### Immediate (This Session)
1. Update `auditLog.ts` types
2. Migrate `glExport.ts`
3. Delete `auditLogger.ts`
4. Test

### Before Schema Migration
- **MUST complete before running Prisma migration**
- After migration, `auditLogger.ts` will break (entity→resource rename)

---

## Files to Modify

1. `server/src/services/auditLog.ts` - Add APPROVE, REJECT, TAX_INFO, W2_FORM, GARNISHMENT, CONTRACTOR
2. `server/src/routes/glExport.ts` - Switch from AuditLogger to logAudit
3. `server/src/services/auditLogger.ts` - DELETE

## Files to Verify

- Ensure no other imports of `auditLogger.ts` exist

---

## Summary

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| **Audit Systems** | 2 parallel | 1 unified | ✅ Simplified |
| **Prisma Clients** | 2 instances | 1 shared | ✅ Resource efficient |
| **Field Names** | Inconsistent | Consistent | ✅ Data quality |
| **Security Context** | Partial | Complete | ✅ Compliance |
| **Maintenance** | 2x effort | 1x effort | ✅ Efficiency |
| **Connection Pool** | At risk | Protected | ✅ Stability |

**Recommendation**: Consolidate immediately before running schema migration.
