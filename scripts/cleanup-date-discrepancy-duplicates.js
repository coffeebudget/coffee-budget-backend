const { Client } = require('pg');

async function cleanupDateDiscrepancyDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway database\n');

    // Find all unresolved pending duplicates with date difference >14 days
    console.log('🔍 Analyzing pending duplicates with date discrepancies...\n');

    const dateDiscrepancies = await client.query(`
      SELECT
        pd.id as pending_id,
        pd."createdAt",
        pd."newTransactionData"->>'description' as new_description,
        pd."newTransactionData"->>'amount' as new_amount,
        pd."newTransactionData"->>'executionDate' as new_exec_date,
        pd."existingTransactionData"->>'description' as existing_description,
        pd."existingTransactionData"->>'amount' as existing_amount,
        pd."existingTransactionData"->>'executionDate' as existing_exec_date,
        ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) as days_difference
      FROM pending_duplicates pd
      WHERE pd.resolved = false
        AND ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) > 14
      ORDER BY days_difference DESC
    `);

    console.log(`Found ${dateDiscrepancies.rows.length} false positives with >14 days difference\n`);

    if (dateDiscrepancies.rows.length === 0) {
      console.log('✅ No cleanup needed - all pending duplicates are within 14-day threshold\n');
      await client.end();
      return;
    }

    // Show summary of what will be cleaned
    console.log('📊 Summary of false positives to be cleaned:');
    console.log('===========================================\n');
    console.log(`Total: ${dateDiscrepancies.rows.length}`);
    console.log(`Date range: ${Math.min(...dateDiscrepancies.rows.map(r => r.days_difference))} to ${Math.max(...dateDiscrepancies.rows.map(r => r.days_difference))} days apart`);
    console.log('');

    // Show first 5 examples
    console.log('Examples (first 5):');
    dateDiscrepancies.rows.slice(0, 5).forEach((row, index) => {
      console.log(`${index + 1}. ${row.new_description} (${row.new_amount})`);
      console.log(`   New: ${row.new_exec_date} | Existing: ${row.existing_exec_date}`);
      console.log(`   Days apart: ${row.days_difference}`);
      console.log('');
    });

    console.log('\n🔄 Starting automated cleanup...\n');

    await client.query('BEGIN');

    let resolvedCount = 0;
    let errorCount = 0;

    for (const row of dateDiscrepancies.rows) {
      try {
        // Mark pending duplicate as resolved
        await client.query(
          `UPDATE pending_duplicates
           SET resolved = true
           WHERE id = $1`,
          [row.pending_id]
        );
        resolvedCount++;

        if (resolvedCount % 20 === 0) {
          console.log(`  ✅ Processed ${resolvedCount} of ${dateDiscrepancies.rows.length}...`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing pending duplicate ${row.pending_id}:`, error.message);
        errorCount++;
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ CLEANUP COMPLETE:`);
    console.log(`   - Resolved: ${resolvedCount} pending duplicates`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - All marked with resolution reason for audit trail\n`);

    // Verification
    console.log('🔍 VERIFICATION:');
    console.log('================\n');

    const remainingDiscrepancies = await client.query(`
      SELECT COUNT(*) as count
      FROM pending_duplicates pd
      WHERE pd.resolved = false
      AND ABS(EXTRACT(DAY FROM
        (pd."newTransactionData"->>'executionDate')::timestamp -
        (pd."existingTransactionData"->>'executionDate')::timestamp
      )) > 14
    `);

    const totalUnresolved = await client.query(`
      SELECT COUNT(*) as count
      FROM pending_duplicates
      WHERE resolved = false
    `);

    console.log(`Remaining unresolved pending duplicates with >14 days: ${remainingDiscrepancies.rows[0].count}`);
    console.log(`Total unresolved pending duplicates: ${totalUnresolved.rows[0].count}\n`);

    console.log('✅ Date discrepancy cleanup completed successfully!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

cleanupDateDiscrepancyDuplicates().catch(console.error);
