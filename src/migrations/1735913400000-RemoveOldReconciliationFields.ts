import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOldReconciliationFields1735913400000
  implements MigrationInterface
{
  name = 'RemoveOldReconciliationFields1735913400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_transaction_reconciliation_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_transaction_reconciled_with"`,
    );

    // Drop foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "FK_ae90492758427317d331d42d5e6"`,
    );

    // Drop columns
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP COLUMN IF EXISTS "reconciledWithTransactionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP COLUMN IF EXISTS "reconciliationStatus"`,
    );

    // Drop enum type (only if not used elsewhere)
    await queryRunner.query(
      `DROP TYPE IF EXISTS "transaction_reconciliationstatus_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate enum type
    await queryRunner.query(
      `CREATE TYPE "transaction_reconciliationstatus_enum" AS ENUM('not_reconciled', 'reconciled_as_primary', 'reconciled_as_secondary')`,
    );

    // Recreate columns
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD "reconciliationStatus" "transaction_reconciliationstatus_enum" NOT NULL DEFAULT 'not_reconciled'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD "reconciledWithTransactionId" integer`,
    );

    // Recreate foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD CONSTRAINT "FK_ae90492758427317d331d42d5e6" FOREIGN KEY ("reconciledWithTransactionId") REFERENCES "transaction"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Recreate indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_transaction_reconciled_with" ON "transaction" ("reconciledWithTransactionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transaction_reconciliation_status" ON "transaction" ("reconciliationStatus", "source")`,
    );
  }
}
