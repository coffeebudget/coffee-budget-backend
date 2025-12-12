/**
 * Cleanup PayPal bank account and transactions
 *
 * This script safely deletes old PayPal data from the transactions table
 * to prepare for migration to the Payment Account MVP architecture.
 *
 * What this script does:
 * 1. Backs up PayPal transaction data to a JSON file
 * 2. Automatically finds ALL foreign key dependencies
 * 3. Deletes/nullifies foreign key references
 * 4. Deletes transactions for PayPal bank account (ID: 15)
 * 5. Optionally deletes the PayPal bank account itself
 *
 * Usage:
 *   railway run node scripts/cleanup-paypal-transactions.js
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { BankAccount } = require('../dist/bank-accounts/entities/bank-account.entity');
const { Transaction } = require('../dist/transactions/transaction.entity');
const fs = require('fs');
const path = require('path');

const PAYPAL_BANK_ACCOUNT_ID = 15;
const BACKUP_FILE = path.join(__dirname, `paypal-backup-${Date.now()}.json`);
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set DRY_RUN=true to test without deleting

async function cleanupPayPalData() {
  console.log('🧹 PayPal Data Cleanup Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE (will delete data)'}`);
  console.log('');

  let app;
  try {
    // Bootstrap NestJS application context
    console.log('📦 Bootstrapping application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    console.log('✅ Application context created\n');

    // Get repositories
    const bankAccountRepo = app.get(getRepositoryToken(BankAccount));
    const transactionRepo = app.get(getRepositoryToken(Transaction));

    // =============================================================
    // STEP 1: Verify PayPal bank account exists
    // =============================================================
    console.log('📊 STEP 1: Verifying PayPal bank account');
    console.log('-'.repeat(60));

    const paypalAccount = await bankAccountRepo.findOne({
      where: { id: PAYPAL_BANK_ACCOUNT_ID },
    });

    if (!paypalAccount) {
      console.log(`❌ PayPal bank account with ID ${PAYPAL_BANK_ACCOUNT_ID} not found`);
      console.log('Nothing to clean up. Exiting.\n');
      await app.close();
      return;
    }

    console.log('✅ Found PayPal bank account:');
    console.log(`   ID: ${paypalAccount.id}`);
    console.log(`   Name: ${paypalAccount.name}`);
    console.log(`   GoCardless ID: ${paypalAccount.gocardlessAccountId}`);
    console.log('');

    // =============================================================
    // STEP 2: Find all transactions to delete
    // =============================================================
    console.log('📊 STEP 2: Finding PayPal transactions');
    console.log('-'.repeat(60));

    const transactions = await transactionRepo.find({
      where: { bankAccount: { id: PAYPAL_BANK_ACCOUNT_ID } },
      order: { executionDate: 'DESC' },
    });

    console.log(`Found ${transactions.length} transactions to delete`);

    if (transactions.length === 0) {
      console.log('⚠️  No transactions found. Nothing to clean up.\n');
      await app.close();
      return;
    }

    // Show summary
    const dateRange = {
      oldest: transactions[transactions.length - 1].executionDate,
      newest: transactions[0].executionDate,
    };
    const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    console.log(`   Date range: ${dateRange.oldest.toISOString().split('T')[0]} to ${dateRange.newest.toISOString().split('T')[0]}`);
    console.log(`   Total amount: €${totalAmount.toFixed(2)}`);
    console.log('');

    // =============================================================
    // STEP 3: Find ALL foreign key dependencies automatically
    // =============================================================
    console.log('📊 STEP 3: Discovering foreign key dependencies');
    console.log('-'.repeat(60));

    const transactionIds = transactions.map(t => t.id);

    // Query PostgreSQL information_schema to find all foreign keys referencing transaction table
    const foreignKeyQuery = `
      SELECT
        tc.table_name,
        kcu.column_name,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'transaction'
        AND tc.table_schema = 'public'
    `;

    const foreignKeys = await transactionRepo.query(foreignKeyQuery);
    console.log(`Found ${foreignKeys.length} foreign key constraints referencing transaction table:`);

    const referencingTables = {};
    for (const fk of foreignKeys) {
      console.log(`   - ${fk.table_name}.${fk.column_name}`);

      // Count how many rows in each table reference our PayPal transactions
      const countQuery = `
        SELECT COUNT(*) as count
        FROM "${fk.table_name}"
        WHERE "${fk.column_name}" = ANY($1)
      `;
      const result = await transactionRepo.query(countQuery, [transactionIds]);
      referencingTables[fk.table_name] = {
        column: fk.column_name,
        count: parseInt(result[0].count),
      };

      if (result[0].count > 0) {
        console.log(`     └─ ${result[0].count} rows found`);
      }
    }
    console.log('');

    // =============================================================
    // STEP 4: Backup data
    // =============================================================
    console.log('📊 STEP 4: Backing up data');
    console.log('-'.repeat(60));

    const backup = {
      timestamp: new Date().toISOString(),
      bankAccount: paypalAccount,
      transactions: transactions,
      foreignKeyReferences: referencingTables,
      summary: {
        totalTransactions: transactions.length,
        dateRange,
        totalAmount,
      },
    };

    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
    console.log(`✅ Backup saved to: ${BACKUP_FILE}`);
    console.log('');

    // =============================================================
    // STEP 5: Delete/nullify foreign key references
    // =============================================================
    console.log('📊 STEP 5: Handling foreign key references');
    console.log('-'.repeat(60));

    if (DRY_RUN) {
      console.log('🔍 DRY RUN: Skipping deletion');
      for (const [tableName, info] of Object.entries(referencingTables)) {
        if (info.count > 0) {
          console.log(`   Would delete/nullify ${info.count} rows in ${tableName}.${info.column}`);
        }
      }
    } else {
      // Delete or nullify references in each referencing table
      for (const [tableName, info] of Object.entries(referencingTables)) {
        if (info.count > 0) {
          console.log(`🔧 Handling ${tableName}.${info.column}...`);

          // For most tables, we delete the referencing rows
          // Only for self-references in transaction table, we nullify
          if (tableName === 'transaction') {
            // Nullify self-references
            const updateQuery = `
              UPDATE "${tableName}"
              SET "${info.column}" = NULL
              WHERE "${info.column}" = ANY($1)
            `;
            await transactionRepo.query(updateQuery, [transactionIds]);
            console.log(`   ✅ Nullified ${info.count} self-references`);
          } else {
            // Delete referencing rows from other tables
            const deleteQuery = `
              DELETE FROM "${tableName}"
              WHERE "${info.column}" = ANY($1)
            `;
            await transactionRepo.query(deleteQuery, [transactionIds]);
            console.log(`   ✅ Deleted ${info.count} rows from ${tableName}`);
          }
        }
      }
    }
    console.log('');

    // =============================================================
    // STEP 6: Delete transactions
    // =============================================================
    console.log('📊 STEP 6: Deleting transactions');
    console.log('-'.repeat(60));

    if (DRY_RUN) {
      console.log('🔍 DRY RUN: Would delete transactions');
      console.log(`   Would delete ${transactions.length} transactions`);
    } else {
      console.log('🗑️  Deleting transactions...');
      const deleteResult = await transactionRepo.remove(transactions);
      console.log(`   ✅ Deleted ${deleteResult.length} transactions`);
    }
    console.log('');

    // =============================================================
    // STEP 7: Optionally delete bank account
    // =============================================================
    console.log('📊 STEP 7: Bank account cleanup');
    console.log('-'.repeat(60));

    // Check if bank account has any remaining transactions
    const remainingTransactions = await transactionRepo.count({
      where: { bankAccount: { id: PAYPAL_BANK_ACCOUNT_ID } },
    });

    if (remainingTransactions === 0) {
      if (DRY_RUN) {
        console.log('🔍 DRY RUN: Would delete bank account');
        console.log(`   Bank account ID: ${PAYPAL_BANK_ACCOUNT_ID}`);
        console.log(`   Name: ${paypalAccount.name}`);
      } else {
        console.log('🗑️  Deleting bank account...');
        await bankAccountRepo.remove(paypalAccount);
        console.log(`   ✅ Deleted bank account: ${paypalAccount.name}`);
      }
    } else {
      console.log(`⚠️  Skipping bank account deletion (${remainingTransactions} transactions still exist)`);
    }
    console.log('');

    // =============================================================
    // SUMMARY
    // =============================================================
    console.log('📋 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    if (DRY_RUN) {
      console.log('🔍 DRY RUN - No changes made');
      console.log('');
      console.log('Would have:');
      console.log(`   ✅ Backed up ${transactions.length} transactions to ${BACKUP_FILE}`);
      console.log(`   ✅ Handled foreign key references in ${Object.keys(referencingTables).length} tables`);
      console.log(`   ✅ Deleted ${transactions.length} PayPal transactions`);
      console.log(`   ✅ Deleted PayPal bank account`);
      console.log('');
      console.log('💡 To execute for real, run:');
      console.log('   railway run node scripts/cleanup-paypal-transactions.js');
    } else {
      console.log('✅ Cleanup completed successfully');
      console.log('');
      console.log('Actions taken:');
      console.log(`   ✅ Backed up ${transactions.length} transactions to ${BACKUP_FILE}`);
      console.log(`   ✅ Handled foreign key references automatically`);
      console.log(`   ✅ Deleted ${transactions.length} PayPal transactions`);
      if (remainingTransactions === 0) {
        console.log(`   ✅ Deleted PayPal bank account`);
      }
      console.log('');
      console.log('💡 Next steps:');
      console.log('   1. Verify cleanup with query script');
      console.log('   2. Create PayPal payment account');
      console.log('   3. Import PayPal activities via GoCardless');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
      console.log('\n👋 Application context closed');
    }
  }
}

// Run the script
cleanupPayPalData()
  .then(() => {
    console.log('\n✅ Cleanup script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup script failed:', error.message);
    process.exit(1);
  });
