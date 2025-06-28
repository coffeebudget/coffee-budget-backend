import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveAutoSaveAmount1735381000000 implements MigrationInterface {
  name = 'RemoveAutoSaveAmount1735381000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "autoSaveAmount"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "category" ADD "autoSaveAmount" numeric(10,2)`);
  }
} 