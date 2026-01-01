# Quick Start Guide - Refactored US Payroll System

## 🚀 Get Started in 5 Minutes

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis (for async queue)

---

## Step 1: Install Dependencies

```bash
cd server
npm install
```

**New dependencies already added**:
- ✅ decimal.js (precision)
- ✅ bullmq (queue)
- ✅ ioredis (Redis client)

---

## Step 2: Set Up Redis

**Option A: Docker (Recommended)**
```bash
docker run -d --name payroll-redis -p 6379:6379 redis:7-alpine
```

**Option B: Local Install**
- Windows: Download from [Redis releases](https://github.com/microsoftarchive/redis/releases)
- macOS: `brew install redis && brew services start redis`
- Linux: `sudo apt install redis-server`

---

## Step 3: Environment Variables

Update `.env`:
```env
# Existing
DATABASE_URL=postgresql://user:pass@localhost:5432/payroll
ENCRYPTION_KEY=<your-64-char-hex-key>
JWT_SECRET=<your-32+-char-secret>

# New (add these)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
PAYROLL_WORKER_CONCURRENCY=2
```

---

## Step 4: Run Migration

```bash
npx prisma migrate dev --name add_tax_config_and_payroll_run
npx prisma generate
```

This adds:
- ✅ `TaxConfiguration` model
- ✅ `PayrollRun` model
- ✅ `payrollRuns` relation to Company

---

## Step 5: Apply Middleware

Edit `server/src/index.ts`:

```typescript
import { prisma } from './db';
import { createEncryptionMiddleware } from './middleware/prismaEncryption';

// Apply auto-encryption middleware
prisma.$use(createEncryptionMiddleware());

// ... rest of your code
```

---

## Step 6: Start Worker (New Terminal)

```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Queue Worker
npm run worker
```

Add to `package.json`:
```json
{
  "scripts": {
    "worker": "tsx src/queue/worker.ts"
  }
}
```

Create `server/src/queue/worker.ts`:
```typescript
import { createPayrollWorker } from './payrollQueue';
import { logger } from '../services/logger';

const worker = createPayrollWorker();
logger.info('Payroll worker started');

process.on('SIGTERM', async () => {
  await worker.close();
});
```

---

## Step 7: Run Tests

```bash
# All tests
npm test

# Specific suites
npm test -- decimal.test.ts
npm test -- federalDecimal.test.ts
npm test -- security.test.ts

# Watch mode
npm test -- --watch
```

---

## ✅ Verification Checklist

- [ ] Redis running on port 6379
- [ ] Database migration applied
- [ ] Environment variables set
- [ ] API server starts without errors
- [ ] Worker process starts without errors
- [ ] Tests pass (70+ tests)

---

## 📝 Usage Examples

### 1. Use Decimal.js for Calculations

```typescript
import { add, multiply, percentOf, toNumber } from './utils/decimal';

// Calculate gross pay
const grossPay = add(regularPay, overtimePay, bonus); // Exact

// Calculate Social Security tax (6.2%)
const ssTax = percentOf(grossPay, 6.2); // Exact

// Convert to number for database
const netPayNumber = toNumber(netPay);
```

### 2. Use Tenant-Aware Prisma

```typescript
import { createTenantAwarePrisma } from './middleware/prismaTenantAware';

// In route handler
router.get('/employees', async (req: AuthRequest, res) => {
  const tenantPrisma = createTenantAwarePrisma(
    req.accessibleCompanyIds,
    req.user?.role === 'ADMIN'
  );

  // Auto-filtered to accessible companies!
  const employees = await tenantPrisma.employee.findMany();
  res.json(employees);
});
```

### 3. Run Async Payroll

```typescript
import { payrollQueue } from './queue/payrollQueue';

// Enqueue payroll run
const payrollRun = await prisma.payrollRun.create({
  data: { companyId, status: 'QUEUED', totalCount: employees.length }
});

await payrollQueue.add('process-payroll', {
  payrollRunId: payrollRun.id,
  employeePayData: [...]
});

// Return immediately (202 Accepted)
res.status(202).json({
  payrollRunId: payrollRun.id,
  statusUrl: `/api/payroll/run/${payrollRun.id}/status`
});
```

### 4. Check Payroll Status

```typescript
router.get('/run/:id/status', async (req, res) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: req.params.id }
  });

  res.json({
    status: run.status,        // QUEUED, PROCESSING, COMPLETED, FAILED
    progress: run.progress,    // 0-100
    processedCount: run.processedCount,
    totalCount: run.totalCount
  });
});
```

---

## 🐛 Troubleshooting

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**: Start Redis
```bash
docker start payroll-redis
# or
redis-server
```

### Migration Error

```
Error: Database URL not found
```

**Solution**: Check `DATABASE_URL` in `.env`

### Worker Not Processing Jobs

**Solution**:
1. Check worker is running: `ps aux | grep worker`
2. Check Redis connection: `redis-cli ping` (should return `PONG`)
3. Check logs for errors

### Tests Failing

**Solution**:
1. Ensure dependencies installed: `npm install`
2. Check test database setup
3. Run tests individually to isolate issue

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `server/src/utils/decimal.ts` | Decimal arithmetic utilities |
| `server/src/tax/federalDecimal.ts` | Federal tax calculator (Decimal) |
| `server/src/middleware/prismaEncryption.ts` | Auto-encryption |
| `server/src/middleware/prismaTenantAware.ts` | Multi-tenant security |
| `server/src/queue/payrollQueue.ts` | Async payroll processing |
| `server/prisma/schema.prisma` | Database models |

---

## 🎯 What's Different

| Feature | Before | After |
|---------|--------|-------|
| Precision | `Math.round()` | `decimal.js` |
| Encryption | Manual | Automatic |
| Multi-tenant | Manual checks | Auto-enforced |
| Payroll | Synchronous | Async queue |
| Tax config | Hardcoded | Database |
| Tests | Minimal | Comprehensive |

---

## 📖 Full Documentation

- **Implementation Guide**: See `IMPLEMENTATION_GUIDE.md`
- **Summary**: See `REFACTORING_SUMMARY.md`
- **Tests**: See `__tests__` directories

---

## ✨ Quick Commands

```bash
# Development
npm run dev              # Start API
npm run worker          # Start queue worker
npm test                # Run tests

# Production
npm run build           # Build TypeScript
npm start               # Start production server
npm run worker:prod     # Start production worker

# Database
npx prisma migrate dev  # Create migration
npx prisma studio       # Open Prisma Studio
npx prisma generate     # Generate Prisma Client

# Redis
redis-cli               # Connect to Redis CLI
redis-cli FLUSHALL      # Clear all Redis data (⚠️ dev only)
```

---

**You're all set! 🎉**

For detailed information, see:
- `IMPLEMENTATION_GUIDE.md` - Full implementation details
- `REFACTORING_SUMMARY.md` - Summary of all changes
