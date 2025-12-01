const { Client } = require('pg');

async function checkSyncHistory() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('✅ Connected to Railway database\n');

  // Check if sync_reports table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'sync_reports'
    );
  `);

  if (!tableCheck.rows[0].exists) {
    console.log('⚠️  sync_reports table does not exist yet\n');
  } else {
    // Get last 10 syncs
    const result = await client.query(`
      SELECT
        id,
        "syncStartedAt",
        "syncCompletedAt",
        status,
        "totalAccounts",
        "successfulAccounts",
        "failedAccounts",
        "totalNewTransactions",
        "createdAt"
      FROM sync_reports
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);

    console.log('📊 Last 10 Sync Reports:\n');
    console.log('═══════════════════════════════════════════════════════════════');

    if (result.rows.length === 0) {
      console.log('No sync reports found in database\n');
    } else {
      result.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. Sync ID: ${row.id}`);
        console.log(`   User ID: ${row.userId}`);
        console.log(`   Start: ${new Date(row.syncStartTime).toLocaleString()}`);
        console.log(`   End: ${new Date(row.syncEndTime).toLocaleString()}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Accounts: ${row.totalAccounts}`);
        console.log(`   New Transactions: ${row.totalNewTransactions}`);
        console.log(`   Successful: ${row.successfulImports}, Failed: ${row.failedImports}`);
      });
      console.log('\n═══════════════════════════════════════════════════════════════\n');

      const lastSync = result.rows[0];
      const lastSyncDate = new Date(lastSync.syncStartTime);
      const now = new Date();
      const hoursSinceLastSync = Math.round((now - lastSyncDate) / (1000 * 60 * 60));

      console.log(`⏰ Time since last sync: ${hoursSinceLastSync} hours\n`);

      if (hoursSinceLastSync > 24) {
        console.log('⚠️  WARNING: Last sync was more than 24 hours ago!');
        console.log('   Expected: Daily sync at 9:00 AM');
        console.log('   Issue: Cron job may not be running on Railway\n');
      } else {
        console.log('✅ Sync is running on schedule\n');
      }
    }
  }

  // Check last imported transaction date
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📅 Recent Transactions:\n');

  const transactionsResult = await client.query(`
    SELECT
      source,
      MAX("executionDate") as latest_execution,
      MAX("createdAt") as latest_import,
      COUNT(*) as count
    FROM transaction
    WHERE "createdAt" >= NOW() - INTERVAL '7 days'
    GROUP BY source
    ORDER BY latest_import DESC
  `);

  if (transactionsResult.rows.length === 0) {
    console.log('⚠️  No transactions imported in the last 7 days\n');
  } else {
    transactionsResult.rows.forEach(row => {
      console.log(`   Source: ${row.source}`);
      console.log(`   Latest execution date: ${new Date(row.latest_execution).toLocaleDateString()}`);
      console.log(`   Latest import: ${new Date(row.latest_import).toLocaleString()}`);
      console.log(`   Count (last 7 days): ${row.count}`);
      console.log('');
    });
  }

  await client.end();
}

checkSyncHistory().catch(console.error);
