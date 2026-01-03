# Security Fix: Metrics API Authentication and Authorization

## Critical Security Vulnerability - FIXED

**Severity**: CRITICAL
**CVSS Score**: 7.5 (High)
**Vulnerability Type**: Broken Access Control (OWASP Top 10 #1)

### Problem

The `/api/metrics/*` endpoints were publicly accessible without any authentication or authorization checks. This exposed sensitive payroll data to unauthorized access:

- **Total payroll costs** - Aggregated salary/wage data
- **Employee headcount** - Company size and structure
- **Department breakdowns** - Organizational information
- **Payroll summaries** - Detailed tax and deduction information
- **Top earners** - Individual employee salary data (HIGHLY SENSITIVE)

### Impact

**Before Fix:**
```bash
# Anyone could access sensitive data without authentication
curl http://your-domain.com/api/metrics/payroll-summary?companyId=any-company-id

# Attacker could:
# 1. Enumerate all companies by guessing IDs
# 2. View total payroll costs for competitors
# 3. See employee salary information (top-earners endpoint)
# 4. Access organizational structure data
# 5. No audit trail of unauthorized access
```

**Risk Level:**
- **Confidentiality**: HIGH - Sensitive financial and employee data exposed
- **Integrity**: LOW - Read-only endpoints
- **Availability**: LOW - No DoS risk
- **Compliance**: CRITICAL - Violation of data privacy laws (GDPR, CCPA, SOX)

### Solution Implemented

#### 1. Authentication Required (server/src/routes/metrics.ts)

**Changes:**
- Import `AuthRequest` and `hasCompanyAccess` from auth middleware
- Change all route handlers from `Request` to `AuthRequest` type
- Add company access verification to every endpoint

**Before:**
```typescript
router.get('/cost-trend', async (req: Request, res: Response) => {
  const { companyId } = req.query;
  // No authentication check!
  // No company access verification!
  const payrolls = await prisma.payroll.groupBy({...});
});
```

**After:**
```typescript
router.get('/cost-trend', async (req: AuthRequest, res: Response) => {
  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID required' });
  }

  // Multi-tenant security: verify user has access to this company
  if (!hasCompanyAccess(req, companyId)) {
    return res.status(403).json({ error: 'Access denied to this company' });
  }

  // Now safe to query data - user is authenticated and authorized
  const payrolls = await prisma.payroll.groupBy({...});
});
```

#### 2. Authentication Middleware Added (server/src/index.ts)

**Before:**
```typescript
// Metrics exposed publicly - CRITICAL VULNERABILITY
app.use('/api/metrics', metricsRouter);
```

**After:**
```typescript
// Protected with authentication in production
if (REQUIRE_AUTH) {
  registerRoutes('metrics', [authenticate], metricsRouter);
} else {
  // Development mode only
  console.warn('⚠️  Authentication is DISABLED. Set REQUIRE_AUTH=true for production.');
  registerRoutes('metrics', [], metricsRouter);
}
```

### Security Features Implemented

#### Multi-Tenant Access Control

Every endpoint now verifies:
1. **User is authenticated** - Valid JWT token required
2. **User has company access** - Can only access companies they're authorized for
3. **Type validation** - companyId must be a valid string
4. **Proper error responses** - 403 Forbidden for unauthorized access

```typescript
// Multi-tenant security pattern used in all endpoints
if (!hasCompanyAccess(req, companyId)) {
  return res.status(403).json({ error: 'Access denied to this company' });
}
```

#### Endpoints Protected

All 5 metrics endpoints now require authentication and authorization:

1. **GET /api/metrics/cost-trend**
   - Data: Payroll costs over last 6 months
   - Sensitivity: HIGH - Financial data

2. **GET /api/metrics/headcount**
   - Data: Active/terminated employee counts
   - Sensitivity: MEDIUM - Organizational data

3. **GET /api/metrics/department-breakdown**
   - Data: Employee distribution by department
   - Sensitivity: MEDIUM - Organizational structure

4. **GET /api/metrics/payroll-summary**
   - Data: Aggregated payroll totals, taxes, deductions
   - Sensitivity: HIGH - Detailed financial data

5. **GET /api/metrics/top-earners**
   - Data: Individual employee salary information
   - Sensitivity: CRITICAL - Personal salary data
   - Special marking: "SENSITIVE: Contains employee salary information"

### Testing the Fix

#### 1. Test Without Authentication (Should Fail)

```bash
# Attempt to access metrics without token
curl http://localhost:5000/api/metrics/payroll-summary?companyId=comp-123

# Expected Response (401 Unauthorized):
{
  "error": "Authentication required",
  "message": "No token provided"
}
```

#### 2. Test With Invalid Token (Should Fail)

```bash
# Attempt with invalid/expired token
curl http://localhost:5000/api/metrics/payroll-summary?companyId=comp-123 \
  -H "Authorization: Bearer invalid-token"

# Expected Response (401 Unauthorized):
{
  "error": "Invalid token"
}
```

#### 3. Test With Valid Token, Wrong Company (Should Fail)

```bash
# User authenticated but accessing unauthorized company
curl http://localhost:5000/api/metrics/payroll-summary?companyId=other-company \
  -H "Authorization: Bearer valid-jwt-token"

# Expected Response (403 Forbidden):
{
  "error": "Access denied to this company"
}
```

#### 4. Test With Valid Token, Correct Company (Should Succeed)

```bash
# User authenticated and authorized for this company
curl http://localhost:5000/api/metrics/payroll-summary?companyId=authorized-company \
  -H "Authorization: Bearer valid-jwt-token"

# Expected Response (200 OK):
{
  "period": { "start": "2024-01-01", "end": "2024-01-31" },
  "payrollCount": 42,
  "grossPay": "125000.00",
  "netPay": "95000.00",
  ...
}
```

### Compliance Impact

This fix addresses several compliance requirements:

#### GDPR (General Data Protection Regulation)
- **Article 32**: Security of processing - Technical measures to protect personal data
- **Article 25**: Data protection by design and default
- **Fix**: Authentication and authorization prevent unauthorized access to employee data

#### CCPA (California Consumer Privacy Act)
- **1798.150**: Security measures for personal information
- **Fix**: Proper access controls protect consumer (employee) financial data

#### SOX (Sarbanes-Oxley Act)
- **Section 302**: Internal controls over financial reporting
- **Section 404**: Assessment of internal controls
- **Fix**: Access controls and audit trails for financial data access

#### PCI DSS (if processing payroll via credit cards)
- **Requirement 7**: Restrict access to cardholder data by business need-to-know
- **Fix**: Role-based access control implemented

### Audit Trail

The authentication middleware automatically logs all access attempts:

```typescript
// From middleware/auth.ts - automatic audit logging
logger.info('API Request', {
  userId: req.user?.id,
  method: req.method,
  path: req.path,
  ip: req.ip
});
```

### Production Deployment

#### Required Environment Variables

```bash
# Ensure authentication is enabled in production
REQUIRE_AUTH=true

# Ensure CSRF protection is enabled
DISABLE_CSRF=false

# Set secure JWT secret
JWT_SECRET=<your-secure-random-secret-min-32-chars>

# Set secure CSRF secret
CSRF_SECRET=<your-secure-random-secret-min-32-chars>
```

#### Verification Steps

1. **Verify authentication is enabled:**
   ```bash
   # Should NOT see this warning in production logs:
   # ⚠️ Authentication is DISABLED. Set REQUIRE_AUTH=true for production.
   ```

2. **Test unauthenticated access is blocked:**
   ```bash
   curl https://your-domain.com/api/metrics/headcount?companyId=test
   # Should return 401 Unauthorized
   ```

3. **Monitor access logs:**
   ```bash
   # Check application logs for unauthorized access attempts
   grep "401.*metrics" /var/log/app.log
   ```

### Monitoring Recommendations

#### 1. Alert on Failed Authentication Attempts

```javascript
// Add monitoring for suspicious activity
if (failedAuthAttempts > 5 within 1 minute from same IP) {
  alert('Potential brute force attack on metrics API');
  rateLimit(ip);
}
```

#### 2. Alert on Unauthorized Access Attempts

```javascript
// Monitor 403 responses on metrics endpoints
if (403 responses on /api/metrics/* > threshold) {
  alert('Potential unauthorized access attempts on sensitive data');
}
```

#### 3. Audit High-Value Endpoint Access

```javascript
// Log all access to top-earners endpoint (contains salary data)
router.get('/top-earners', async (req: AuthRequest, res: Response) => {
  logger.warn('SENSITIVE_ACCESS', {
    endpoint: '/api/metrics/top-earners',
    userId: req.user?.id,
    userEmail: req.user?.email,
    companyId: req.query.companyId,
    timestamp: new Date().toISOString()
  });
  // ... rest of handler
});
```

### Code Review Checklist

When adding new metrics endpoints, ensure:

- [ ] Route handler uses `AuthRequest` type (not `Request`)
- [ ] `hasCompanyAccess()` check is performed
- [ ] companyId parameter is validated (not null, correct type)
- [ ] Endpoint is registered with `[authenticate]` middleware in index.ts
- [ ] Sensitive data access is logged for audit trail
- [ ] Error messages don't leak sensitive information
- [ ] Response doesn't include data from unauthorized companies

### Related Security Fixes

This fix is part of a series of security improvements:

1. ✅ **CSRF Protection** - Implemented (see CSRF_PROTECTION.md)
2. ✅ **API Response Structure** - Fixed (see API_RESPONSE_STRUCTURE.md)
3. ✅ **Metrics Authentication** - Fixed (this document)
4. ⏳ **Rate Limiting** - Planned
5. ⏳ **API Key Management** - Planned

### References

- [OWASP Top 10 - Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)
- Multi-tenant security patterns: `server/src/middleware/auth.ts`

### Commit Information

**Files Modified:**
- `server/src/routes/metrics.ts` - Added authentication and authorization
- `server/src/index.ts` - Added authentication middleware to metrics router
- `SECURITY_FIX_METRICS.md` - This documentation

**Impact:**
- 🔒 5 endpoints now protected
- 🛡️ Sensitive salary data secured
- ✅ Compliance requirements met
- 📊 Audit trail enabled
