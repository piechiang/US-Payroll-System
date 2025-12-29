/**
 * Migration script to encrypt existing SSN data
 * Run with: npx tsx scripts/encryptExistingSSN.ts
 */

import { PrismaClient } from '@prisma/client';
import { encrypt, isEncrypted } from '../src/services/encryption.js';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function migrateSSN() {
  console.log('Starting SSN encryption migration...');

  const employees = await prisma.employee.findMany({
    select: { id: true, ssn: true }
  });

  console.log(`Found ${employees.length} employees to check`);

  let encrypted = 0;
  let skipped = 0;

  for (const employee of employees) {
    if (isEncrypted(employee.ssn)) {
      console.log(`  Skipping ${employee.id} - already encrypted`);
      skipped++;
      continue;
    }

    const encryptedSSN = encrypt(employee.ssn);

    await prisma.employee.update({
      where: { id: employee.id },
      data: { ssn: encryptedSSN }
    });

    console.log(`  Encrypted SSN for employee ${employee.id}`);
    encrypted++;
  }

  console.log('\nMigration complete!');
  console.log(`  Encrypted: ${encrypted}`);
  console.log(`  Skipped (already encrypted): ${skipped}`);
}

migrateSSN()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
