import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCategoryBudgetFields1770300000001
  implements MigrationInterface
{
  name = 'RemoveCategoryBudgetFields1770300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove budget-related columns from category table
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "warningThreshold"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "maxThreshold"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "yearlyBudget"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "monthlyBudget"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP COLUMN IF EXISTS "budgetLevel"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add budget-related columns if rolling back
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "budgetLevel" varchar(20) DEFAULT 'optional'`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "monthlyBudget" decimal(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "yearlyBudget" decimal(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "maxThreshold" decimal(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "warningThreshold" decimal(10,2)`,
    );
  }
}
