/**
 * Query PayPal bank account and transaction data
 *
 * This script analyzes the current PayPal integration to prepare for migration
 * to the Payment Account MVP architecture.
 *
 * Usage:
 *   railway run node scripts/query-paypal-data.js
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { BankAccount } = require('../dist/bank-accounts/entities/bank-account.entity');
const { Transaction } = require('../dist/transactions/transaction.entity');

async function queryPayPalData() {
  console.log('🔍 Querying PayPal Data from Railway Database');
  console.log('='.repeat(60));

  let app;
  try {
    // Bootstrap NestJS application context
    console.log('\n📦 Bootstrapping application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    console.log('✅ Application context created\n');

    // Get repositories
    const bankAccountRepo = app.get(getRepositoryToken(BankAccount));
    const transactionRepo = app.get(getRepositoryToken(Transaction));

    // =============================================================
    // QUERY 1: Find PayPal Bank Accounts
    // =============================================================
    console.log('📊 QUERY 1: PayPal Bank Accounts');
    console.log('-'.repeat(60));

    const paypalAccounts = await bankAccountRepo
      .createQueryBuilder('bank')
      .where('LOWER(bank.name) LIKE :paypal', { paypal: '%paypal%' })
      .orWhere('LOWER(bank.gocardlessAccountId) LIKE :gocardless', { gocardless: '%paypal%' })
      .getMany();

    if (paypalAccounts.length === 0) {
      console.log('⚠️  No PayPal bank accounts found\n');
    } else {
      console.log(`✅ Found ${paypalAccounts.length} PayPal bank account(s):\n`);
      paypalAccounts.forEach((account, index) => {
        console.log(`${index + 1}. Account Details:`);
        console.log(`   ID: ${account.id}`);
        console.log(`   Name: ${account.name}`);
        console.log(`   Type: ${account.type}`);
        console.log(`   Balance: ${account.balance} ${account.currency}`);
        console.log(`   GoCardless ID: ${account.gocardlessAccountId || 'N/A'}`);
        console.log();
      });
    }

    // Store PayPal account IDs for next queries
    const paypalAccountIds = paypalAccounts.map(acc => acc.id);

    if (paypalAccountIds.length === 0) {
      console.log('ℹ️  No further queries needed (no PayPal accounts)\n');
      await app.close();
      return;
    }

    // =============================================================
    // QUERY 2: Count Transactions by Source and Reconciliation Status
    // =============================================================
    console.log('📊 QUERY 2: PayPal Transaction Counts');
    console.log('-'.repeat(60));

    const transactionCounts = await transactionRepo
      .createQueryBuilder('t')
      .select('t.source', 'source')
      .addSelect('t.reconciliationStatus', 'reconciliationStatus')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MIN(t.executionDate)', 'oldestDate')
      .addSelect('MAX(t.executionDate)', 'newestDate')
      .where('t.bankAccountId IN (:...ids)', { ids: paypalAccountIds })
      .groupBy('t.source')
      .addGroupBy('t.reconciliationStatus')
      .getRawMany();

    if (transactionCounts.length === 0) {
      console.log('⚠️  No transactions found for PayPal accounts\n');
    } else {
      console.log('Transaction breakdown:\n');
      let totalTransactions = 0;
      transactionCounts.forEach(row => {
        totalTransactions += parseInt(row.count);
        console.log(`Source: ${row.source || 'NULL'}`);
        console.log(`  Status: ${row.reconciliationStatus}`);
        console.log(`  Count: ${row.count}`);
        console.log(`  Date Range: ${row.oldestDate?.toISOString().split('T')[0]} to ${row.newestDate?.toISOString().split('T')[0]}`);
        console.log();
      });
      console.log(`📊 Total PayPal Transactions: ${totalTransactions}\n`);
    }

    // =============================================================
    // QUERY 3: Sample Transactions
    // =============================================================
    console.log('📊 QUERY 3: Sample PayPal Transactions (Latest 5)');
    console.log('-'.repeat(60));

    const sampleTransactions = await transactionRepo
      .createQueryBuilder('t')
      .where('t.bankAccountId IN (:...ids)', { ids: paypalAccountIds })
      .orderBy('t.executionDate', 'DESC')
      .limit(5)
      .getMany();

    if (sampleTransactions.length === 0) {
      console.log('⚠️  No sample transactions to display\n');
    } else {
      sampleTransactions.forEach((tx, index) => {
        console.log(`${index + 1}. Transaction:`);
        console.log(`   ID: ${tx.id}`);
        console.log(`   Description: ${tx.description}`);
        console.log(`   Amount: €${tx.amount}`);
        console.log(`   Date: ${tx.executionDate?.toISOString().split('T')[0]}`);
        console.log(`   Source: ${tx.source}`);
        console.log(`   Status: ${tx.reconciliationStatus}`);
        console.log(`   Merchant: ${tx.merchantName || 'N/A'}`);
        console.log();
      });
    }

    // =============================================================
    // QUERY 4: Check Enriched Transactions
    // =============================================================
    console.log('📊 QUERY 4: Transactions Enriched by Payment Activities');
    console.log('-'.repeat(60));

    const enrichedCount = await transactionRepo
      .createQueryBuilder('t')
      .where('t.enrichedFromPaymentActivityId IS NOT NULL')
      .getCount();

    console.log(`Enriched transactions: ${enrichedCount}`);
    console.log('(Should be 0 if Payment Account MVP not yet in use)\n');

    // =============================================================
    // SUMMARY
    // =============================================================
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ PayPal bank accounts found: ${paypalAccounts.length}`);

    if (paypalAccountIds.length > 0) {
      const totalCount = transactionCounts.reduce((sum, row) => sum + parseInt(row.count), 0);
      console.log(`✅ Total PayPal transactions: ${totalCount}`);
      console.log(`✅ Transactions will be DELETED (used for categorization only)`);
      console.log(`✅ PayPal bank account(s) can be removed after deletion`);
      console.log(`✅ Ready to re-import as payment_activities\n`);

      console.log('💡 Next Steps:');
      console.log('   1. Create cleanup script with these account IDs');
      console.log('   2. Backup database before deletion');
      console.log('   3. Execute cleanup script');
      console.log('   4. Create PayPal payment account');
      console.log('   5. Import PayPal activities via GoCardless (24 months)');
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
queryPayPalData()
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error.message);
    process.exit(1);
  });
