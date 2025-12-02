const { Client } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function cleanupGoCardlessDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway database\n');

    // Step 1: Find all pending duplicates with GoCardless API IDs
    console.log('🔍 STEP 1: Analyzing pending duplicates with GoCardless API IDs');
    console.log('=================================================================\n');

    const pendingWithApiId = await client.query(`
      SELECT
        pd.id as pending_id,
        pd."createdAt",
        pd.source,
        pd.resolved,
        pd."newTransactionData"->>'transactionIdOpenBankAPI' as api_id,
        pd."newTransactionData"->>'description' as description,
        pd."newTransactionData"->>'amount' as amount,
        pd."newTransactionData"->>'executionDate' as execution_date,
        pd."existingTransactionId" as existing_transaction_id,
        t.id as actual_transaction_id,
        t.description as actual_description,
        t."createdAt" as actual_created_at
      FROM pending_duplicates pd
      LEFT JOIN transaction t
        ON t."transactionIdOpenBankAPI" = (pd."newTransactionData"->>'transactionIdOpenBankAPI')
        AND t.source = 'gocardless'
      WHERE pd."newTransactionData"->>'transactionIdOpenBankAPI' IS NOT NULL
        AND pd.resolved = false
      ORDER BY pd."createdAt" DESC
    `);

    console.log(`Found ${pendingWithApiId.rows.length} unresolved pending duplicates with API IDs\n`);

    if (pendingWithApiId.rows.length === 0) {
      console.log('✅ No cleanup needed - all pending duplicates are either resolved or without API IDs\n');
      await client.end();
      rl.close();
      return;
    }

    // Separate into two categories
    const falsePositives = pendingWithApiId.rows.filter(row => row.actual_transaction_id !== null);
    const legitimateDuplicates = pendingWithApiId.rows.filter(row => row.actual_transaction_id === null);

    console.log(`📊 Analysis Results:`);
    console.log(`   - False Positives (API ID exists in DB): ${falsePositives.length}`);
    console.log(`   - Legitimate Duplicates (API ID NOT in DB): ${legitimateDuplicates.length}\n`);

    // Step 2: Show false positives in detail
    if (falsePositives.length > 0) {
      console.log('❌ FALSE POSITIVES TO BE CLEANED:');
      console.log('==================================\n');

      falsePositives.forEach((row, index) => {
        console.log(`${index + 1}. Pending Duplicate ID: ${row.pending_id}`);
        console.log(`   Created: ${row.createdAt}`);
        console.log(`   Description: ${row.description}`);
        console.log(`   Amount: ${row.amount}`);
        console.log(`   API ID: ${row.api_id}`);
        console.log(`   ✅ Transaction EXISTS in DB:`);
        console.log(`      - Transaction ID: ${row.actual_transaction_id}`);
        console.log(`      - Created: ${row.actual_created_at}`);
        console.log(`      - Description: ${row.actual_description}`);
        console.log('');
      });

      console.log(`\n🎯 CLEANUP PLAN:`);
      console.log(`   1. Mark ${falsePositives.length} pending duplicates as resolved`);
      console.log(`   2. Create ${falsePositives.length} prevented_duplicate records for audit trail`);
      console.log(`   3. Link to existing transactions for reference\n`);

      // Step 3: Ask for confirmation
      const answer = await question('Do you want to proceed with the cleanup? (yes/no): ');

      if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Cleanup cancelled by user\n');
        await client.end();
        rl.close();
        return;
      }

      // Step 4: Execute cleanup in a transaction
      console.log('\n🔄 Executing cleanup...\n');

      await client.query('BEGIN');

      let resolvedCount = 0;
      let preventedCount = 0;

      for (const row of falsePositives) {
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

          console.log(`✅ Resolved pending duplicate ${row.pending_id} (API ID: ${row.api_id})`);
        } catch (error) {
          console.error(`❌ Error processing pending duplicate ${row.pending_id}:`, error.message);
        }
      }

      await client.query('COMMIT');

      console.log(`\n✅ CLEANUP COMPLETE:`);
      console.log(`   - Resolved: ${resolvedCount} pending duplicates`);
      console.log(`   - Created: ${preventedCount} prevented_duplicate records`);
      console.log(`   - Audit trail preserved in prevented_duplicates table\n`);

      // Step 5: Verify cleanup
      console.log('🔍 VERIFICATION:');
      console.log('================\n');

      const remainingPending = await client.query(`
        SELECT COUNT(*) as count
        FROM pending_duplicates
        WHERE "newTransactionData"->>'transactionIdOpenBankAPI' IS NOT NULL
          AND resolved = false
      `);

      const todayPrevented = await client.query(`
        SELECT COUNT(*) as count
        FROM prevented_duplicates
        WHERE "createdAt" >= CURRENT_DATE
          AND reason LIKE '%transactionIdOpenBankAPI%'
      `);

      console.log(`Remaining unresolved pending duplicates with API IDs: ${remainingPending.rows[0].count}`);
      console.log(`Prevented duplicates created today (API ID match): ${todayPrevented.rows[0].count}\n`);
    }

    // Step 6: Show legitimate duplicates (if any)
    if (legitimateDuplicates.length > 0) {
      console.log('\n⚠️  LEGITIMATE DUPLICATES (Require Manual Review):');
      console.log('==================================================\n');

      legitimateDuplicates.forEach((row, index) => {
        console.log(`${index + 1}. Pending Duplicate ID: ${row.pending_id}`);
        console.log(`   Description: ${row.description}`);
        console.log(`   Amount: ${row.amount}`);
        console.log(`   API ID: ${row.api_id}`);
        console.log(`   ❌ Transaction NOT FOUND in database`);
        console.log(`   ⚠️  This may be a genuinely new transaction that needs review\n`);
      });

      console.log('These duplicates should be reviewed manually in the application.\n');
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
  } finally {
    await client.end();
    rl.close();
  }
}

cleanupGoCardlessDuplicates();
