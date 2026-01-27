import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExpensePlanEnvelopeTracking1770100000001
  implements MigrationInterface
{
  name = 'RemoveExpensePlanEnvelopeTracking1770100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the expense_plan_transactions table
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_plan_transactions"`);

    // Remove envelope-related columns from expense_plans table
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "currentBalance"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "lastFundedDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "initialBalanceSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "initialBalanceCustom"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add columns to expense_plans table
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "currentBalance" decimal(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "lastFundedDate" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "initialBalanceSource" varchar(20) NOT NULL DEFAULT 'zero'`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "initialBalanceCustom" decimal(12,2)`,
    );

    // Re-create the expense_plan_transactions table
    await queryRunner.query(`
      CREATE TABLE "expense_plan_transactions" (
        "id" SERIAL PRIMARY KEY,
        "expensePlanId" integer NOT NULL,
        "type" varchar(20) NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "date" date NOT NULL,
        "balanceAfter" decimal(12,2) NOT NULL,
        "transactionId" integer,
        "note" varchar(255),
        "isAutomatic" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_expense_plan_transactions_plan" FOREIGN KEY ("expensePlanId") REFERENCES "expense_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_plan_transactions_transaction" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plan_transactions_plan_date" ON "expense_plan_transactions" ("expensePlanId", "date")`,
    );
  }
}
