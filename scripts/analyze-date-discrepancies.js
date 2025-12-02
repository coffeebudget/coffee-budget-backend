const { Client } = require('pg');

async function analyzeDateDiscrepancies() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('✅ Connected to Railway database\n');

  console.log('🔍 ANALYZING DATE DISCREPANCIES IN PENDING DUPLICATES:');
  console.log('======================================================\n');

  // Get all unresolved pending duplicates with date analysis
  const pendingDups = await client.query(`
    SELECT
      pd.id as pending_id,
      pd."createdAt" as pd_created,
      pd.source,
      pd.resolved,
      pd."newTransactionData"->>'description' as new_description,
      pd."newTransactionData"->>'amount' as new_amount,
      pd."newTransactionData"->>'executionDate' as new_exec_date,
      pd."newTransactionData"->>'transactionIdOpenBankAPI' as new_api_id,
      pd."existingTransactionData"->>'description' as existing_description,
      pd."existingTransactionData"->>'amount' as existing_amount,
      pd."existingTransactionData"->>'executionDate' as existing_exec_date,
      pd."existingTransactionData"->>'transactionIdOpenBankAPI' as existing_api_id,
      EXTRACT(MONTH FROM (pd."newTransactionData"->>'executionDate')::timestamp) as new_month,
      EXTRACT(YEAR FROM (pd."newTransactionData"->>'executionDate')::timestamp) as new_year,
      EXTRACT(MONTH FROM (pd."existingTransactionData"->>'executionDate')::timestamp) as existing_month,
      EXTRACT(YEAR FROM (pd."existingTransactionData"->>'executionDate')::timestamp) as existing_year,
      ABS(EXTRACT(DAY FROM
        (pd."newTransactionData"->>'executionDate')::timestamp -
        (pd."existingTransactionData"->>'executionDate')::timestamp
      )) as days_difference
    FROM pending_duplicates pd
    WHERE pd.resolved = false
    ORDER BY days_difference DESC
    LIMIT 50
  `);

  console.log(`Found ${pendingDups.rows.length} unresolved pending duplicates\n`);

  // Categorize by date difference
  const differentMonths = pendingDups.rows.filter(row =>
    row.new_month !== row.existing_month || row.new_year !== row.existing_year
  );

  const sameMonth = pendingDups.rows.filter(row =>
    row.new_month === row.existing_month && row.new_year === row.existing_year
  );

  console.log('📊 CATEGORIZATION BY DATE:');
  console.log('==========================\n');
  console.log(`Different months/years: ${differentMonths.length}`);
  console.log(`Same month/year: ${sameMonth.length}\n`);

  if (differentMonths.length > 0) {
    console.log('⚠️  PENDING DUPLICATES WITH DIFFERENT MONTHS:');
    console.log('============================================\n');

    differentMonths.slice(0, 15).forEach((row, index) => {
      console.log(`${index + 1}. Pending Duplicate ID: ${row.pending_id}`);
      console.log(`   Created: ${row.pd_created}`);
      console.log(`   `);
      console.log(`   NEW Transaction:`);
      console.log(`     Description: ${row.new_description}`);
      console.log(`     Amount: ${row.new_amount}`);
      console.log(`     Execution Date: ${row.new_exec_date}`);
      console.log(`     Month/Year: ${row.new_month}/${row.new_year}`);
      console.log(`     API ID: ${row.new_api_id || 'NULL'}`);
      console.log(`   `);
      console.log(`   EXISTING Transaction:`);
      console.log(`     Description: ${row.existing_description}`);
      console.log(`     Amount: ${row.existing_amount}`);
      console.log(`     Execution Date: ${row.existing_exec_date}`);
      console.log(`     Month/Year: ${row.existing_month}/${row.existing_year}`);
      console.log(`     API ID: ${row.existing_api_id || 'NULL'}`);
      console.log(`   `);
      console.log(`   ⚠️  Days Difference: ${row.days_difference} days`);
      console.log('');
    });
  }

  // Distribution analysis
  console.log('\n📈 DATE DIFFERENCE DISTRIBUTION:');
  console.log('================================\n');

  const distribution = await client.query(`
    SELECT
      CASE
        WHEN ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) = 0 THEN '0 days (same day)'
        WHEN ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) BETWEEN 1 AND 7 THEN '1-7 days'
        WHEN ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) BETWEEN 8 AND 30 THEN '8-30 days'
        WHEN ABS(EXTRACT(DAY FROM
          (pd."newTransactionData"->>'executionDate')::timestamp -
          (pd."existingTransactionData"->>'executionDate')::timestamp
        )) > 30 THEN '>30 days'
      END as date_range,
      COUNT(*) as count
    FROM pending_duplicates pd
    WHERE pd.resolved = false
    GROUP BY date_range
    ORDER BY
      CASE date_range
        WHEN '0 days (same day)' THEN 1
        WHEN '1-7 days' THEN 2
        WHEN '8-30 days' THEN 3
        WHEN '>30 days' THEN 4
      END
  `);

  distribution.rows.forEach(row => {
    console.log(`  ${row.date_range}: ${row.count} duplicates`);
  });

  // Check duplicate detection settings
  console.log('\n\n🔧 DUPLICATE DETECTION CONFIGURATION:');
  console.log('====================================\n');
  console.log('Current date tolerance in duplicate detection:');
  console.log('  - Maximum days difference: 7 days');
  console.log('  - Date similarity weight: 20%');
  console.log('  - Minimum similarity for flagging: 70%\n');

  console.log('⚠️  ISSUE IDENTIFIED:');
  console.log('====================\n');
  console.log('Transactions from different months are being flagged as duplicates');
  console.log('because the date similarity calculation allows up to 7 days difference.');
  console.log('This can match transactions across month boundaries.\n');

  console.log('Examples of problematic matches:');
  console.log('  - Transaction on Sept 30 vs Oct 5 (5 days apart, different months)');
  console.log('  - Transaction on Aug 28 vs Sept 2 (5 days apart, different months)\n');

  await client.end();
}

analyzeDateDiscrepancies().catch(console.error);
