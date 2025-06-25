import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSaltEdgeFields1747000000000 implements MigrationInterface {
  name = 'DropSaltEdgeFields1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop Salt Edge enrichment columns from transaction table
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP COLUMN IF EXISTS "saltEdgeCategory"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP COLUMN IF EXISTS "saltEdgeMerchantId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP COLUMN IF EXISTS "saltEdgeMerchantName"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add Salt Edge enrichment columns if needed for rollback
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD "saltEdgeCategory" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD "saltEdgeMerchantId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD "saltEdgeMerchantName" character varying`,
    );
  }
}
