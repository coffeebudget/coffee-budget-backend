/**
 * Verify PayPal cleanup was successful
 *
 * This script checks if PayPal transactions and bank account were properly deleted.
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { BankAccount } = require('../dist/bank-accounts/entities/bank-account.entity');
const { Transaction } = require('../dist/transactions/transaction.entity');

const PAYPAL_BANK_ACCOUNT_ID = 15;

async function verifyCleanup() {
  console.log('🔍 Verifying PayPal Cleanup');
  console.log('='.repeat(60));

  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });

    const bankAccountRepo = app.get(getRepositoryToken(BankAccount));
    const transactionRepo = app.get(getRepositoryToken(Transaction));

    // Check 1: Bank account should not exist
    const bankAccount = await bankAccountRepo.findOne({
      where: { id: PAYPAL_BANK_ACCOUNT_ID },
    });

    console.log('\n1️⃣ Bank Account Check:');
    if (!bankAccount) {
      console.log('   ✅ PayPal bank account (ID: 15) was deleted');
    } else {
      console.log('   ❌ PayPal bank account (ID: 15) still exists!');
      console.log(`      Name: ${bankAccount.name}`);
    }

    // Check 2: Transactions should not exist
    const transactionCount = await transactionRepo.count({
      where: { bankAccount: { id: PAYPAL_BANK_ACCOUNT_ID } },
    });

    console.log('\n2️⃣ Transactions Check:');
    if (transactionCount === 0) {
      console.log('   ✅ All PayPal transactions were deleted');
    } else {
      console.log(`   ❌ ${transactionCount} PayPal transactions still exist!`);
    }

    // Check 3: Check for orphaned references in pending_duplicates
    const pendingDupsQuery = `
      SELECT COUNT(*) as count
      FROM pending_duplicates pd
      WHERE pd."existingTransactionId" IN (
        SELECT id FROM transaction WHERE "bankAccountId" = $1
      )
    `;
    const pendingDupsResult = await transactionRepo.query(pendingDupsQuery, [
      PAYPAL_BANK_ACCOUNT_ID,
    ]);

    console.log('\n3️⃣ Pending Duplicates Check:');
    if (parseInt(pendingDupsResult[0].count) === 0) {
      console.log('   ✅ No orphaned pending_duplicates references');
    } else {
      console.log(
        `   ⚠️  ${pendingDupsResult[0].count} pending_duplicates still reference deleted transactions`,
      );
    }

    // Check 4: Check for orphaned references in prevented_duplicates
    const preventedDupsQuery = `
      SELECT COUNT(*) as count
      FROM prevented_duplicates pd
      WHERE pd."existingTransactionId" IN (
        SELECT id FROM transaction WHERE "bankAccountId" = $1
      )
    `;
    const preventedDupsResult = await transactionRepo.query(
      preventedDupsQuery,
      [PAYPAL_BANK_ACCOUNT_ID],
    );

    console.log('\n4️⃣ Prevented Duplicates Check:');
    if (parseInt(preventedDupsResult[0].count) === 0) {
      console.log('   ✅ No orphaned prevented_duplicates references');
    } else {
      console.log(
        `   ⚠️  ${preventedDupsResult[0].count} prevented_duplicates still reference deleted transactions`,
      );
    }

    // Check 5: Verify backup file exists
    const fs = require('fs');
    const path = require('path');
    const backupFiles = fs
      .readdirSync(__dirname)
      .filter((f) => f.startsWith('paypal-backup-') && f.endsWith('.json'));

    console.log('\n5️⃣ Backup File Check:');
    if (backupFiles.length > 0) {
      console.log(`   ✅ Backup file exists: ${backupFiles[0]}`);
      const backupPath = path.join(__dirname, backupFiles[0]);
      const stats = fs.statSync(backupPath);
      console.log(`      Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
      console.log('   ⚠️  No backup file found');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    const allPassed =
      !bankAccount &&
      transactionCount === 0 &&
      parseInt(pendingDupsResult[0].count) === 0 &&
      parseInt(preventedDupsResult[0].count) === 0;

    if (allPassed) {
      console.log('✅ Cleanup was successful! All checks passed.');
      console.log('\n💡 Next Steps:');
      console.log('   1. Implement PaymentAccountImportService');
      console.log('   2. Import PayPal data via GoCardless API');
      console.log('   3. Test reconciliation with bank transactions');
    } else {
      console.log('⚠️  Cleanup verification found issues - review above');
    }

    await app.close();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

verifyCleanup()
  .then(() => {
    console.log('\n✅ Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  });
