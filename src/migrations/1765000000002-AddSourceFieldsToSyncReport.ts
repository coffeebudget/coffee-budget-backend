import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceFieldsToSyncReport1765000000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create source enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE sync_reports_source_enum AS ENUM (
          'gocardless',
          'paypal',
          'stripe',
          'plaid',
          'manual'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create sourceType enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE sync_reports_sourcetype_enum AS ENUM (
          'bank_account',
          'payment_account'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add source column if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sync_reports
        ADD COLUMN source sync_reports_source_enum DEFAULT 'gocardless' NOT NULL;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Add sourceType column if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sync_reports
        ADD COLUMN "sourceType" sync_reports_sourcetype_enum DEFAULT 'bank_account' NOT NULL;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Add sourceId column if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sync_reports
        ADD COLUMN "sourceId" INTEGER NULL;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Add sourceName column if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE sync_reports
        ADD COLUMN "sourceName" VARCHAR(255) NULL;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Set sourceName for existing records
    await queryRunner.query(`
      UPDATE sync_reports
      SET "sourceName" = 'GoCardless Bank Sync'
      WHERE "sourceName" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns
    await queryRunner.query(`
      ALTER TABLE sync_reports
      DROP COLUMN IF EXISTS "sourceName";
    `);

    await queryRunner.query(`
      ALTER TABLE sync_reports
      DROP COLUMN IF EXISTS "sourceId";
    `);

    await queryRunner.query(`
      ALTER TABLE sync_reports
      DROP COLUMN IF EXISTS "sourceType";
    `);

    await queryRunner.query(`
      ALTER TABLE sync_reports
      DROP COLUMN IF EXISTS source;
    `);

    // Drop enum types
    await queryRunner.query(`
      DROP TYPE IF EXISTS sync_reports_sourcetype_enum;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS sync_reports_source_enum;
    `);
  }
}
