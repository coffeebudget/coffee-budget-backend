import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAccountToExpensePlan1767400000001
  implements MigrationInterface
{
  name = 'AddPaymentAccountToExpensePlan1767400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payment account type column (for future credit card support)
    await queryRunner.query(`
      ALTER TABLE expense_plans
      ADD COLUMN payment_account_type varchar(20) DEFAULT NULL
    `);

    // Add payment account ID column
    await queryRunner.query(`
      ALTER TABLE expense_plans
      ADD COLUMN payment_account_id integer DEFAULT NULL
    `);

    // Add foreign key constraint to bank_account table
    await queryRunner.query(`
      ALTER TABLE expense_plans
      ADD CONSTRAINT FK_expense_plans_payment_account
      FOREIGN KEY (payment_account_id)
      REFERENCES bank_account(id)
      ON DELETE SET NULL
    `);

    // Add index for faster lookups by payment account
    await queryRunner.query(`
      CREATE INDEX IDX_expense_plans_payment_account
      ON expense_plans(payment_account_id)
      WHERE payment_account_id IS NOT NULL
    `);
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
      DROP COLUMN IF EXISTS payment_account_id
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS payment_account_type
    `);
  }
}
