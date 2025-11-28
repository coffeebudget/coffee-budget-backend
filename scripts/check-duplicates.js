const { Client } = require('pg');

async function checkDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✓ Connected to Railway PostgreSQL\n');

    // Query 1: Count missing amounts
    console.log('=== Query 1: Count Missing Amounts ===');
    const countResult = await client.query(`
      SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE ("newTransactionData"->>'amount' IS NULL OR "newTransactionData"->>'amount' = '')) as missing_new_amount,
          COUNT(*) FILTER (WHERE ("existingTransactionData"->>'amount' IS NULL OR "existingTransactionData"->>'amount' = '')) as missing_existing_amount
      FROM pending_duplicates
      WHERE resolved = false;
    `);
    console.log(countResult.rows[0]);
    console.log('');

    // Query 2: Check what existingTransactionData looks like
    console.log('=== Query 2: Sample existingTransactionData Structure ===');
    const sampleResult = await client.query(`
      SELECT
          id,
          source,
          "sourceReference",
          "newTransactionData"->>'amount' as new_amount,
          "newTransactionData"->>'description' as new_desc,
          "existingTransactionData"->>'amount' as existing_amount,
          "existingTransactionData"->>'id' as existing_id,
          "createdAt"
      FROM pending_duplicates
      WHERE resolved = false
      LIMIT 5;
    `);

    console.table(sampleResult.rows);
    console.log('');

    // Query 3: Check full structure of a few records
    console.log('=== Query 3: Sample Full JSON Structure ===');
    const structureResult = await client.query(`
      SELECT
          id,
          source,
          "newTransactionData",
          "existingTransactionData"
      FROM pending_duplicates
      WHERE resolved = false
      LIMIT 2;
    `);

    structureResult.rows.forEach((row, index) => {
      console.log(`\nRecord ${index + 1} (ID: ${row.id}):`);
      console.log('Source:', row.source);
      console.log('New Transaction Data:', JSON.stringify(row.newTransactionData, null, 2));
      if (row.existingTransactionData) {
        console.log('Existing Transaction Data:', JSON.stringify(row.existingTransactionData, null, 2));
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkDuplicates();
