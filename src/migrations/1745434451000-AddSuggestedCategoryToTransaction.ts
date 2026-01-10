import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuggestedCategoryToTransaction1745434451000
  implements MigrationInterface
{
  name = 'AddSuggestedCategoryToTransaction1745434451000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Add suggestedCategoryName column if it doesn't exist
    const hasNameColumn = table?.columns.some(
      (c) => c.name === 'suggestedCategoryName',
    );
    if (!hasNameColumn) {
      await queryRunner.query(
        `ALTER TABLE "transaction" ADD "suggestedCategoryName" character varying`,
      );
    }

    // Add suggestedCategoryId column if it doesn't exist
    const hasIdColumn = table?.columns.some(
      (c) => c.name === 'suggestedCategoryId',
    );
    if (!hasIdColumn) {
      await queryRunner.query(
        `ALTER TABLE "transaction" ADD "suggestedCategoryId" integer`,
      );
    }

    // Add foreign key constraint if it doesn't exist
    const hasForeignKey = table?.foreignKeys.some(
      (fk) => fk.name === 'FK_transaction_suggested_category',
    );
    if (!hasForeignKey) {
      await queryRunner.query(
        `ALTER TABLE "transaction" ADD CONSTRAINT "FK_transaction_suggested_category" FOREIGN KEY ("suggestedCategoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Drop the foreign key constraint if it exists
    const hasForeignKey = table?.foreignKeys.some(
      (fk) => fk.name === 'FK_transaction_suggested_category',
    );
    if (hasForeignKey) {
      await queryRunner.query(
        `ALTER TABLE "transaction" DROP CONSTRAINT "FK_transaction_suggested_category"`,
      );
    }

    // Remove the columns if they exist
    const hasIdColumn = table?.columns.some(
      (c) => c.name === 'suggestedCategoryId',
    );
    if (hasIdColumn) {
      await queryRunner.query(
        `ALTER TABLE "transaction" DROP COLUMN "suggestedCategoryId"`,
      );
    }

    const hasNameColumn = table?.columns.some(
      (c) => c.name === 'suggestedCategoryName',
    );
    if (hasNameColumn) {
      await queryRunner.query(
        `ALTER TABLE "transaction" DROP COLUMN "suggestedCategoryName"`,
      );
    }
  }
}
