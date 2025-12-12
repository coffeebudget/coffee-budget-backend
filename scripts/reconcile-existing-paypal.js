/**
 * One-time script to reconcile existing PayPal transactions in the database
 *
 * This script bootstraps the NestJS application and uses the actual
 * GocardlessPaypalReconciliationService to reconcile historical PayPal
 * transactions with their corresponding bank transactions.
 *
 * Usage:
 *   railway run node scripts/reconcile-existing-paypal.js
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { GocardlessPaypalReconciliationService } = require('../dist/gocardless/gocardless-paypal-reconciliation.service');
const { User } = require('../dist/users/user.entity');

async function reconcileExistingPayPal() {
  console.log('🚀 Starting PayPal Reconciliation Script');
  console.log('=========================================\n');

  let app;
  try {
    // Bootstrap NestJS application
    console.log('📦 Bootstrapping NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    console.log('✅ Application context created\n');

    // Get required services using class references
    const reconciliationService = app.get(GocardlessPaypalReconciliationService);
    const userRepository = app.get(getRepositoryToken(User));

    // Get all users
    console.log('👥 Fetching all users...');
    const users = await userRepository.find({
      where: { isDemoUser: false },
    });
    console.log(`✅ Found ${users.length} non-demo users\n`);

    if (users.length === 0) {
      console.log('⚠️  No users found in database\n');
      await app.close();
      return;
    }

    // Statistics tracking
    const stats = {
      totalUsers: users.length,
      processedUsers: 0,
      totalReconciled: 0,
      totalUnreconciled: 0,
      errors: [],
    };

    // Process each user
    console.log('🔄 Processing users...\n');
    for (const user of users) {
      try {
        console.log(`\n📊 Processing User ${user.id} (${user.email})`);
        console.log('─'.repeat(50));

        const result = await reconciliationService.processPayPalReconciliation(user.id);

        console.log(`  ✅ Reconciled: ${result.reconciledCount}`);
        console.log(`  ⚠️  Unreconciled: ${result.unreconciledCount}`);

        if (result.unreconciledTransactions.length > 0) {
          console.log('\n  Unreconciled transactions:');
          result.unreconciledTransactions.forEach((tx, index) => {
            console.log(`    ${index + 1}. ${tx.description} - €${tx.amount} (${tx.executionDate})`);
          });
        }

        stats.processedUsers++;
        stats.totalReconciled += result.reconciledCount;
        stats.totalUnreconciled += result.unreconciledCount;
      } catch (error) {
        console.error(`  ❌ Error processing user ${user.id}: ${error.message}`);
        stats.errors.push({
          userId: user.id,
          email: user.email,
          error: error.message,
        });
      }
    }

    // Print final statistics
    console.log('\n\n📈 RECONCILIATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Users Processed: ${stats.processedUsers}/${stats.totalUsers}`);
    console.log(`Total Reconciled: ${stats.totalReconciled}`);
    console.log(`Total Unreconciled: ${stats.totalUnreconciled}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      stats.errors.forEach((err, index) => {
        console.log(`  ${index + 1}. User ${err.userId} (${err.email}): ${err.error}`);
      });
    }

    if (stats.totalReconciled > 0) {
      console.log('\n✅ Reconciliation completed successfully!');
      console.log('   Bank transactions have been enriched with PayPal merchant details.');
      console.log('   PayPal transactions marked as secondary to avoid double-counting.');
    } else {
      console.log('\n⚠️  No PayPal transactions were reconciled.');
      console.log('   This could mean:');
      console.log('   - No unreconciled PayPal transactions exist');
      console.log('   - PayPal transactions have no matching bank transactions');
      console.log('   - Transactions fall outside the ±3 day matching window');
    }

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
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
reconcileExistingPayPal()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
