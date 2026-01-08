import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRepresentativeDescriptionColumnType1767300000001
  implements MigrationInterface
{
  name = 'FixRepresentativeDescriptionColumnType1767300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change representative_description from varchar(255) to text
    // to accommodate long bank transaction descriptions
    await queryRunner.query(`
      ALTER TABLE expense_plan_suggestions
      ALTER COLUMN representative_description TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to varchar(255) - this may truncate data
    await queryRunner.query(`
      ALTER TABLE expense_plan_suggestions
      ALTER COLUMN representative_description TYPE varchar(255)
    `);
  }
}
