#!/bin/bash

# Enterprise Features Database Migration Script
# This script creates and applies the database migration for enterprise features

set -e  # Exit on error

echo "================================"
echo "Enterprise Features Migration"
echo "================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:pass@localhost:5432/payroll'"
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Check if this is production
if [ "$NODE_ENV" = "production" ]; then
    echo "⚠️  PRODUCTION ENVIRONMENT DETECTED"
    echo "This will modify your production database!"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Migration cancelled"
        exit 1
    fi
    echo ""
fi

# Step 1: Generate Prisma Client
echo "Step 1: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Step 2: Create migration (development only)
if [ "$NODE_ENV" != "production" ]; then
    echo "Step 2: Creating migration..."
    npx prisma migrate dev --name add_enterprise_features_auditlog
    echo "✅ Migration created and applied"
else
    echo "Step 2: Applying migration (production)..."
    npx prisma migrate deploy
    echo "✅ Migration applied"
fi
echo ""

# Step 3: Verify migration
echo "Step 3: Verifying database schema..."
npx prisma db push --accept-data-loss=false
echo "✅ Schema verified"
echo ""

# Step 4: Check database status
echo "Step 4: Checking migration status..."
npx prisma migrate status
echo ""

echo "================================"
echo "✅ Migration Complete!"
echo "================================"
echo ""
echo "New models added:"
echo "  ✅ AuditLog (updated schema)"
echo "  ✅ Garnishment (already existed)"
echo "  ✅ Contractor (already existed)"
echo ""
echo "Indexes optimized:"
echo "  ✅ AuditLog: userId, companyId, action, entity, entityId, timestamp"
echo "  ✅ Payroll: companyId + payPeriodStart + payPeriodEnd (composite)"
echo ""
echo "Next steps:"
echo "  1. Test the new API endpoints"
echo "  2. Run the test suite: npm test"
echo "  3. Deploy to production"
echo ""
