import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRecurringTransactionsTable1768000000001
  implements MigrationInterface
{
  name = 'DropRecurringTransactionsTable1768000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "recurring_transaction"
      DROP CONSTRAINT IF EXISTS "FK_recurring_transaction_user"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "recurring_transaction"
      DROP CONSTRAINT IF EXISTS "FK_recurring_transaction_category"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "recurring_transaction"
      DROP CONSTRAINT IF EXISTS "FK_recurring_transaction_bank_account"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "recurring_transaction"
      DROP CONSTRAINT IF EXISTS "FK_recurring_transaction_credit_card"
    `);

    // Drop the join table for recurring_transaction_tags_tag (many-to-many)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "recurring_transaction_tags_tag" CASCADE
    `);

    // Drop the main recurring_transaction table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "recurring_transaction" CASCADE
    `);

    // Clean up any orphaned enum types from the recurring_transaction table
    // These may exist if TypeORM created them during schema sync
    await queryRunner.query(`
      DROP TYPE IF EXISTS "recurring_transaction_frequencytype_enum" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "recurring_transaction_status_enum" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "recurring_transaction_type_enum" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "recurring_transaction_source_enum" CASCADE
    `);
    // Also clean up any _old suffixed enums from previous migrations
    await queryRunner.query(`
      DROP TYPE IF EXISTS "frequency_type_enum_old" CASCADE
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "recurring_transaction_frequencytype_enum_old" CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the recurring_transaction table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recurring_transaction" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL DEFAULT 'Untitled Transaction',
        "description" varchar(255),
        "amount" decimal(10,2) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'SCHEDULED',
        "type" varchar NOT NULL,
        "frequencyEveryN" int NOT NULL,
        "frequencyType" varchar NOT NULL,
        "occurrences" int,
        "startDate" timestamp NOT NULL,
        "endDate" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "nextOccurrence" timestamp,
        "dayOfMonth" int,
        "dayOfWeek" int,
        "month" int,
        "userConfirmed" boolean NOT NULL DEFAULT false,
        "source" varchar(50) NOT NULL DEFAULT 'MANUAL',
        "userId" int,
        "categoryId" int,
        "bankAccountId" int,
        "creditCardId" int
      )
    `);

    // Recreate the join table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recurring_transaction_tags_tag" (
        "recurringTransactionId" int NOT NULL,
        "tagId" int NOT NULL,
        PRIMARY KEY ("recurringTransactionId", "tagId")
      )
    `);

    // Note: Foreign key constraints would need to be added manually if needed
  }
}
