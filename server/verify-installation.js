#!/usr/bin/env node

/**
 * Installation Verification Script
 * Verifies all enterprise features dependencies are correctly installed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('================================');
console.log('Installation Verification');
console.log('================================\n');

const checks = [];

// Check 1: Required packages
console.log('✓ Checking required packages...');
const requiredPackages = [
  'csv-stringify',
  'date-fns',
  'uuid',
  'decimal.js',
  '@prisma/client'
];

let allPackagesInstalled = true;
requiredPackages.forEach(pkg => {
  try {
    require.resolve(pkg);
    console.log(`  ✓ ${pkg}`);
  } catch (e) {
    console.log(`  ✗ ${pkg} - NOT INSTALLED`);
    allPackagesInstalled = false;
  }
});

checks.push({ name: 'Required packages', passed: allPackagesInstalled });
console.log('');

// Check 2: Prisma Client generated
console.log('✓ Checking Prisma Client...');
const prismaClientPath = path.join(__dirname, '../node_modules/@prisma/client');
const prismaClientExists = fs.existsSync(prismaClientPath);

if (prismaClientExists) {
  console.log('  ✓ Prisma Client generated');
  checks.push({ name: 'Prisma Client', passed: true });
} else {
  console.log('  ✗ Prisma Client NOT generated');
  console.log('  → Run: npx prisma generate');
  checks.push({ name: 'Prisma Client', passed: false });
}
console.log('');

// Check 3: New service files exist
console.log('✓ Checking service files...');
const serviceFiles = [
  'src/utils/AppError.ts',
  'src/services/auditLogger.ts',
  'src/services/prorationCalculator.ts',
  'src/services/garnishmentCalculator.ts',
  'src/services/glExportService.ts',
  'src/routes/metrics.ts',
  'src/routes/glExport.ts'
];

let allFilesExist = true;
serviceFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - NOT FOUND`);
    allFilesExist = false;
  }
});

checks.push({ name: 'Service files', passed: allFilesExist });
console.log('');

// Check 4: Test files exist
console.log('✓ Checking test files...');
const testFiles = [
  'src/services/__tests__/prorationCalculator.test.ts',
  'src/services/__tests__/garnishmentCalculator.test.ts'
];

let allTestsExist = true;
testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - NOT FOUND`);
    allTestsExist = false;
  }
});

checks.push({ name: 'Test files', passed: allTestsExist });
console.log('');

// Check 5: Migration scripts exist
console.log('✓ Checking migration scripts...');
const migrationScripts = [
  'migrate-enterprise-features.sh',
  'migrate-enterprise-features.bat'
];

let allScriptsExist = true;
migrationScripts.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - NOT FOUND`);
    allScriptsExist = false;
  }
});

checks.push({ name: 'Migration scripts', passed: allScriptsExist });
console.log('');

// Summary
console.log('================================');
console.log('Summary');
console.log('================================\n');

const allPassed = checks.every(check => check.passed);

checks.forEach(check => {
  const status = check.passed ? '✓' : '✗';
  console.log(`${status} ${check.name}`);
});

console.log('');

if (allPassed) {
  console.log('🎉 All checks passed!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set DATABASE_URL in .env file');
  console.log('  2. Run migration: npm run db:migrate');
  console.log('  3. Run tests: npm test');
  console.log('  4. Start server: npm run dev');
  console.log('');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please fix the issues above.');
  console.log('');
  process.exit(1);
}
