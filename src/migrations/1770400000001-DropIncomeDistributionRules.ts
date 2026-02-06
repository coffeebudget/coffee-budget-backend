import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropIncomeDistributionRules1770400000001
  implements MigrationInterface
{
  name = 'DropIncomeDistributionRules1770400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "income_distribution_rules"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "income_distribution_rules" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "name" varchar(100) NOT NULL,
        "expectedAmount" decimal(12,2),
        "amountTolerance" decimal(5,2) NOT NULL DEFAULT 10,
        "descriptionPattern" varchar(255),
        "categoryId" integer,
        "bankAccountId" integer,
        "autoDistribute" boolean NOT NULL DEFAULT false,
        "distributionStrategy" varchar(20) NOT NULL DEFAULT 'priority',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_income_dist_rules_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_income_dist_rules_category" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_income_dist_rules_bank_account" FOREIGN KEY ("bankAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL
      )
    `);
  }
}
