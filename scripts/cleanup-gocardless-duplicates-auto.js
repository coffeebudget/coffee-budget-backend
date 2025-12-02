const { Client } = require('pg');

async function cleanupGoCardlessDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway database\n');

    // Find all pending duplicates with GoCardless API IDs that already exist in DB
    console.log('🔍 Analyzing pending duplicates with GoCardless API IDs...\n');

    const falsePositives = await client.query(`
      SELECT
        pd.id as pending_id,
        pd."createdAt",
        pd."newTransactionData"->>'transactionIdOpenBankAPI' as api_id,
        pd."newTransactionData"->>'description' as description,
        pd."newTransactionData"->>'amount' as amount,
        t.id as actual_transaction_id,
        pd."userId" as user_id,
        pd.source as source,
        pd."sourceReference" as source_reference
      FROM pending_duplicates pd
      INNER JOIN transaction t
        ON t."transactionIdOpenBankAPI" = (pd."newTransactionData"->>'transactionIdOpenBankAPI')
        AND t.source = 'gocardless'
      WHERE pd."newTransactionData"->>'transactionIdOpenBankAPI' IS NOT NULL
        AND pd.resolved = false
      ORDER BY pd."createdAt" DESC
    `);

    console.log(`Found ${falsePositives.rows.length} false positives to clean up\n`);

    if (falsePositives.rows.length === 0) {
      console.log('✅ No cleanup needed - all pending duplicates are either resolved or legitimate\n');
      await client.end();
      return;
    }

    console.log('🔄 Starting automated cleanup...\n');

    await client.query('BEGIN');

    let resolvedCount = 0;
    let preventedCount = 0;
    let errorCount = 0;

    for (const row of falsePositives.rows) {
      try {
        // Mark pending duplicate as resolved
        await client.query(
          `UPDATE pending_duplicates
           SET resolved = true
           WHERE id = $1`,
          [row.pending_id]
        );
        resolvedCount++;

        // Create prevented_duplicate record for audit trail
        await client.query(
          `INSERT INTO prevented_duplicates
           (
             "existingTransactionId",
             "blockedTransactionData",
             source,
             "sourceReference",
             "similarityScore",
             reason,
             "userId",
             "createdAt"
           )
           SELECT
             $1,
             pd."newTransactionData",
             pd.source,
             pd."sourceReference",
             100.0,
             'Exact match by transactionIdOpenBankAPI - retroactive cleanup',
             pd."userId",
             NOW()
           FROM pending_duplicates pd
           WHERE pd.id = $2`,
          [row.actual_transaction_id, row.pending_id]
        );
        preventedCount++;

        if (resolvedCount % 50 === 0) {
          console.log(`  ✅ Processed ${resolvedCount} of ${falsePositives.rows.length}...`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing pending duplicate ${row.pending_id}:`, error.message);
        errorCount++;
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ CLEANUP COMPLETE:`);
    console.log(`   - Resolved: ${resolvedCount} pending duplicates`);
    console.log(`   - Created: ${preventedCount} prevented_duplicate records`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Audit trail preserved in prevented_duplicates table\n`);

    // Verification
    console.log('🔍 VERIFICATION:');
    console.log('================\n');

    const remainingPending = await client.query(`
      SELECT COUNT(*) as count
      FROM pending_duplicates pd
      INNER JOIN transaction t
        ON t."transactionIdOpenBankAPI" = (pd."newTransactionData"->>'transactionIdOpenBankAPI')
        AND t.source = 'gocardless'
      WHERE pd."newTransactionData"->>'transactionIdOpenBankAPI' IS NOT NULL
        AND pd.resolved = false
    `);

    const todayPrevented = await client.query(`
      SELECT COUNT(*) as count
      FROM prevented_duplicates
      WHERE "createdAt" >= CURRENT_DATE
        AND reason LIKE '%transactionIdOpenBankAPI%'
    `);

    console.log(`Remaining unresolved false positives: ${remainingPending.rows[0].count}`);
    console.log(`Prevented duplicates created today (API ID match): ${todayPrevented.rows[0].count}\n`);

    console.log('✅ Cleanup completed successfully!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

cleanupGoCardlessDuplicates();
