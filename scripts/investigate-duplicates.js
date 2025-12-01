const { Client } = require('pg');

async function investigateDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('✅ Connected to Railway database\n');

  // Get prevented_duplicates schema
  console.log('📋 PREVENTED_DUPLICATES TABLE SCHEMA:');
  console.log('====================================\n');

  const schema = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'prevented_duplicates'
    ORDER BY ordinal_position
  `);

  schema.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
  });

  // Check if these API IDs are actually in the database
  console.log('\n\n🔍 CHECKING IF PENDING DUPLICATE API IDs EXIST IN TRANSACTIONS:');
  console.log('=============================================================\n');

  const checkApiIds = await client.query(`
    SELECT
      pd.id as pd_id,
      pd."newTransactionData"->>'transactionIdOpenBankAPI' as api_id,
      pd."newTransactionData"->>'description' as pd_description,
      t.id as transaction_id,
      t.description as t_description,
      t."createdAt" as t_created
    FROM pending_duplicates pd
    LEFT JOIN transaction t ON t."transactionIdOpenBankAPI" = (pd."newTransactionData"->>'transactionIdOpenBankAPI')
    WHERE pd."createdAt" >= CURRENT_DATE
    AND pd."newTransactionData"->>'transactionIdOpenBankAPI' IS NOT NULL
    ORDER BY pd.id DESC
    LIMIT 10
  `);

  console.log(`Found ${checkApiIds.rows.length} pending duplicates with API IDs:\n`);
  checkApiIds.rows.forEach(row => {
    console.log(`Pending Duplicate ID: ${row.pd_id}`);
    console.log(`  API ID: ${row.api_id}`);
    console.log(`  PD Description: ${row.pd_description}`);
    if (row.transaction_id) {
      console.log(`  ✅ FOUND in transactions table:`);
      console.log(`     Transaction ID: ${row.transaction_id}`);
      console.log(`     Description: ${row.t_description}`);
      console.log(`     Created: ${row.t_created}`);
    } else {
      console.log(`  ❌ NOT FOUND in transactions table`);
    }
    console.log('');
  });

  // Check the import path used
  console.log('\n📚 CHECKING WHICH IMPORT PATH WAS USED:');
  console.log('=====================================\n');

  // Check Railway logs for the import
  console.log('Looking at recent GoCardless imports...\n');

  const recentTransactions = await client.query(`
    SELECT
      id,
      description,
      amount,
      "executionDate",
      "transactionIdOpenBankAPI",
      source,
      "createdAt",
      CASE
        WHEN "bankAccountId" IS NOT NULL THEN 'via bank account'
        WHEN "creditCardId" IS NOT NULL THEN 'via credit card'
        ELSE 'direct'
      END as import_path
    FROM transaction
    WHERE "createdAt" >= CURRENT_DATE
    AND source = 'gocardless'
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);

  console.log(`Transactions imported today from GoCardless:\n`);
  recentTransactions.rows.forEach(row => {
    console.log(`ID: ${row.id}`);
    console.log(`  Description: ${row.description}`);
    console.log(`  Amount: ${row.amount}`);
    console.log(`  API ID: ${row.transactionIdOpenBankAPI}`);
    console.log(`  Import Path: ${row.import_path}`);
    console.log(`  Created: ${row.createdAt}`);
    console.log('');
  });

  await client.end();
}

investigateDuplicates().catch(console.error);
