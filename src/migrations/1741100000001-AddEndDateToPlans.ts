import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEndDateToPlans1741100000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD COLUMN "endDate" date NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" ADD COLUMN "endDate" date NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "income_plans" DROP COLUMN "endDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN "endDate"`,
    );
  }
}
