import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This migration marks all historical migrations as "already run"
 * because they were applied via synchronize:true before we enabled migrations.
 *
 * This prevents TypeORM from trying to re-run migrations that already executed.
 */
export class MarkHistoricalMigrationsAsRun1700000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create migrations table if it doesn't exist
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        name VARCHAR NOT NULL
      )
    `);

    // List of all migrations that were already applied via synchronize:true
    const historicalMigrations = [
      { timestamp: 1710866600000, name: 'AddCategoryToRecurringTransaction1710866600000' },
      { timestamp: 1710892800000, name: 'AddExistingTransactionDataToPendingDuplicate1710892800000' },
      { timestamp: 1716123456789, name: 'IncreasedRecurringTransactionNameLength1716123456789' },
      { timestamp: 1717000000000, name: 'AddGocardlessAccountId1717000000000' },
      { timestamp: 1735381000000, name: 'RemoveAutoSaveAmount1735381000000' },
      { timestamp: 1735905600000, name: 'AddSaltEdgeEnrichmentFields1735905600000' },
      { timestamp: 1735906800000, name: 'AddSuggestedCategoryName1735906800000' },
      { timestamp: 1745434451000, name: 'AddSuggestedCategoryToTransaction1745434451000' },
      { timestamp: 1745434452000, name: 'CreateKeywordStatsTable1745434452000' },
      { timestamp: 1745467890000, name: 'RemoveRecurringTransactionRelationship1745467890000' },
      { timestamp: 1745468000000, name: 'AddAnalyticsFieldsToRecurringTransaction1745468000000' },
      { timestamp: 1747000000000, name: 'DropSaltEdgeFields1747000000000' },
      { timestamp: 1747100000000, name: 'AddXXXCurrency1747100000000' },
      { timestamp: 1747100000001, name: 'AddOpenBankAPIFields1747100000001' },
      { timestamp: 1747100000002, name: 'AddDemoUserFields1747100000002' },
      { timestamp: 1750000000000, name: 'CreateMerchantCategorizationTables1750000000000' },
      { timestamp: 1750000000001, name: 'AddMerchantFieldsToTransaction1750000000001' },
      { timestamp: 1750000000002, name: 'AddSyncReportRelationToImportLog1750000000002' },
    ];

    // Insert each migration record if it doesn't already exist
    for (const migration of historicalMigrations) {
      await queryRunner.query(
        `
        INSERT INTO migrations (timestamp, name)
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM migrations WHERE timestamp = $1 AND name = $2
        )
        `,
        [migration.timestamp, migration.name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove all historical migration records
    await queryRunner.query(`DELETE FROM migrations WHERE timestamp < 1750000000003`);
  }
}
