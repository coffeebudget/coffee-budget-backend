import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotApplicableReconciliationStatus1765000000001
  implements MigrationInterface
{
  name = 'AddNotApplicableReconciliationStatus1765000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old CHECK constraint
    await queryRunner.query(`
      ALTER TABLE "payment_activities"
      DROP CONSTRAINT IF EXISTS "CHK_reconciliationStatus"
    `);

    // Add new CHECK constraint with 'not_applicable' included
    await queryRunner.query(`
      ALTER TABLE "payment_activities"
      ADD CONSTRAINT "CHK_reconciliationStatus"
      CHECK ("reconciliationStatus" IN ('pending', 'reconciled', 'failed', 'manual', 'not_applicable'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // First update any 'not_applicable' records back to 'pending'
    await queryRunner.query(`
      UPDATE "payment_activities"
      SET "reconciliationStatus" = 'pending'
      WHERE "reconciliationStatus" = 'not_applicable'
    `);

    // Drop the new CHECK constraint
    await queryRunner.query(`
      ALTER TABLE "payment_activities"
      DROP CONSTRAINT IF EXISTS "CHK_reconciliationStatus"
    `);

    // Restore the old CHECK constraint without 'not_applicable'
    await queryRunner.query(`
      ALTER TABLE "payment_activities"
      ADD CONSTRAINT "CHK_reconciliationStatus"
      CHECK ("reconciliationStatus" IN ('pending', 'reconciled', 'failed', 'manual'))
    `);
  }
}
