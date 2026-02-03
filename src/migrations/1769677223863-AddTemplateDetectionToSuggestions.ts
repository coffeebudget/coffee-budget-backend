import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemplateDetectionToSuggestions1769677223863
  implements MigrationInterface
{
  name = 'AddTemplateDetectionToSuggestions1769677223863';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD "suggested_template" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD "template_confidence" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD "template_reasons" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD "suggested_config" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP COLUMN "suggested_config"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP COLUMN "template_reasons"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP COLUMN "template_confidence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP COLUMN "suggested_template"`,
    );
  }
}
