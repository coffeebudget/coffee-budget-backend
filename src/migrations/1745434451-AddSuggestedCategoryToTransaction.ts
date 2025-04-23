import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuggestedCategoryToTransaction1745434451 implements MigrationInterface {
  name = 'AddSuggestedCategoryToTransaction1745434451';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add suggestedCategoryName column
    await queryRunner.query(`ALTER TABLE "transaction" ADD "suggestedCategoryName" character varying`);
    
    // Add suggestedCategoryId column and its foreign key
    await queryRunner.query(`ALTER TABLE "transaction" ADD "suggestedCategoryId" integer`);
    await queryRunner.query(`ALTER TABLE "transaction" ADD CONSTRAINT "FK_transaction_suggested_category" FOREIGN KEY ("suggestedCategoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint
    await queryRunner.query(`ALTER TABLE "transaction" DROP CONSTRAINT "FK_transaction_suggested_category"`);
    
    // Remove the columns
    await queryRunner.query(`ALTER TABLE "transaction" DROP COLUMN "suggestedCategoryId"`);
    await queryRunner.query(`ALTER TABLE "transaction" DROP COLUMN "suggestedCategoryName"`);
  }
} 