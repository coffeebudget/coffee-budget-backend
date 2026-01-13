import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAccountToExpensePlan1767400000001
  implements MigrationInterface
{
  name = 'AddPaymentAccountToExpensePlan1767400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (idempotent)
    const table = await queryRunner.getTable('expense_plans');
    const hasPaymentAccountType = table?.columns.some(
      (c) => c.name === 'paymentAccountType',
    );
    const hasPaymentAccountId = table?.columns.some(
      (c) => c.name === 'paymentAccountId',
    );

    // Add payment account type column (for future credit card support)
    if (!hasPaymentAccountType) {
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "paymentAccountType" varchar(20) DEFAULT NULL
      `);
    }

    // Add payment account ID column
    if (!hasPaymentAccountId) {
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "paymentAccountId" integer DEFAULT NULL
      `);

      // Add foreign key constraint to bank_account table
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD CONSTRAINT FK_expense_plans_payment_account
        FOREIGN KEY ("paymentAccountId")
        REFERENCES bank_account(id)
        ON DELETE SET NULL
      `);

      // Add index for faster lookups by payment account
      await queryRunner.query(`
        CREATE INDEX IDX_expense_plans_payment_account
        ON expense_plans("paymentAccountId")
        WHERE "paymentAccountId" IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS IDX_expense_plans_payment_account
    `);

    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP CONSTRAINT IF EXISTS FK_expense_plans_payment_account
    `);

    // Drop columns
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
