import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAutoSaveAmount1735381000000 implements MigrationInterface {
  name = 'RemoveAutoSaveAmount1735381000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if autoSaveAmount column exists before dropping
    const table = await queryRunner.getTable('category');
    const hasColumn = table?.columns.some(
      (column) => column.name === 'autoSaveAmount',
    );

    if (hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "category" DROP COLUMN "autoSaveAmount"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if autoSaveAmount column exists before adding
    const table = await queryRunner.getTable('category');
    const hasColumn = table?.columns.some(
      (column) => column.name === 'autoSaveAmount',
    );

    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "category" ADD "autoSaveAmount" numeric(10,2)`,
      );
    }
  }
}
