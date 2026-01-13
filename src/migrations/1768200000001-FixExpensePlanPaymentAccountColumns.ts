import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixExpensePlanPaymentAccountColumns1768200000001
  implements MigrationInterface
{
  name = 'FixExpensePlanPaymentAccountColumns1768200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check what columns exist
    const table = await queryRunner.getTable('expense_plans');
    const hasSnakeCaseType = table?.columns.some(
      (c) => c.name === 'payment_account_type',
    );
    const hasSnakeCaseId = table?.columns.some(
      (c) => c.name === 'payment_account_id',
    );
    const hasCamelCaseType = table?.columns.some(
      (c) => c.name === 'paymentAccountType',
    );
    const hasCamelCaseId = table?.columns.some(
      (c) => c.name === 'paymentAccountId',
    );

    // If snake_case columns exist but camelCase don't, rename them
    if (hasSnakeCaseType && !hasCamelCaseType) {
      await queryRunner.query(`
        ALTER TABLE expense_plans
        RENAME COLUMN payment_account_type TO "paymentAccountType"
      `);
    }

    if (hasSnakeCaseId && !hasCamelCaseId) {
      // Drop the old constraint and index first
      await queryRunner.query(`
        DROP INDEX IF EXISTS IDX_expense_plans_payment_account
      `);
      await queryRunner.query(`
        ALTER TABLE expense_plans
        DROP CONSTRAINT IF EXISTS FK_expense_plans_payment_account
      `);

      // Rename the column
      await queryRunner.query(`
        ALTER TABLE expense_plans
        RENAME COLUMN payment_account_id TO "paymentAccountId"
      `);

      // Re-add foreign key constraint with camelCase column
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD CONSTRAINT FK_expense_plans_payment_account
        FOREIGN KEY ("paymentAccountId")
        REFERENCES bank_account(id)
        ON DELETE SET NULL
      `);

      // Re-add index with camelCase column
      await queryRunner.query(`
        CREATE INDEX IDX_expense_plans_payment_account
        ON expense_plans("paymentAccountId")
        WHERE "paymentAccountId" IS NOT NULL
      `);
    }

    // If neither exist, create the camelCase columns
    if (!hasSnakeCaseType && !hasCamelCaseType) {
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "paymentAccountType" varchar(20) DEFAULT NULL
      `);
    }

    if (!hasSnakeCaseId && !hasCamelCaseId) {
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "paymentAccountId" integer DEFAULT NULL
      `);

      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD CONSTRAINT FK_expense_plans_payment_account
        FOREIGN KEY ("paymentAccountId")
        REFERENCES bank_account(id)
        ON DELETE SET NULL
      `);

      await queryRunner.query(`
        CREATE INDEX IDX_expense_plans_payment_account
        ON expense_plans("paymentAccountId")
        WHERE "paymentAccountId" IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This is a repair migration, down just drops the columns
    await queryRunner.query(`
      DROP INDEX IF EXISTS IDX_expense_plans_payment_account
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP CONSTRAINT IF EXISTS FK_expense_plans_payment_account
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "paymentAccountId"
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "paymentAccountType"
    `);
  }
}
