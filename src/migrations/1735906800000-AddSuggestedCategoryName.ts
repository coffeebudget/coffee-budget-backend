import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuggestedCategoryName1735906800000
  implements MigrationInterface
{
  name = 'AddSuggestedCategoryName1735906800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the column already exists
    const columnExists = await queryRunner.hasColumn(
      'transaction',
      'suggestedCategoryName',
    );

    if (!columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`transaction\` 
        ADD \`suggestedCategoryName\` varchar(255) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columnExists = await queryRunner.hasColumn(
      'transaction',
      'suggestedCategoryName',
    );

    if (columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`transaction\` 
        DROP COLUMN \`suggestedCategoryName\`
      `);
    }
  }
}
