import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotApplicableReconciliationStatus1765000000001
  implements MigrationInterface
{
  name = 'AddNotApplicableReconciliationStatus1765000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the column is using an enum type or varchar with CHECK constraint
    const result = await queryRunner.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'payment_activities'
      AND column_name = 'reconciliationStatus'
    `);

    if (result && result.length > 0) {
      const columnType = result[0].data_type;

      if (columnType === 'USER-DEFINED') {
        // Column is using a PostgreSQL ENUM type
        // First check if 'not_applicable' already exists in the enum
        const enumValues = await queryRunner.query(`
          SELECT enumlabel
          FROM pg_enum
          WHERE enumtypid = (
            SELECT oid
            FROM pg_type
            WHERE typname = 'payment_activities_reconciliationstatus_enum'
          )
        `);

        const hasNotApplicable = enumValues.some(
          (row: any) => row.enumlabel === 'not_applicable',
        );

        if (!hasNotApplicable) {
          // Add 'not_applicable' to the enum type
          await queryRunner.query(`
            ALTER TYPE payment_activities_reconciliationstatus_enum
            ADD VALUE 'not_applicable'
          `);
        }
      } else {
        // Column is using VARCHAR with CHECK constraint
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
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // First update any 'not_applicable' records back to 'pending'
    await queryRunner.query(`
      UPDATE "payment_activities"
      SET "reconciliationStatus" = 'pending'
      WHERE "reconciliationStatus" = 'not_applicable'
    `);

    // Check if the column is using an enum type or varchar with CHECK constraint
    const result = await queryRunner.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'payment_activities'
      AND column_name = 'reconciliationStatus'
    `);

    if (result && result.length > 0) {
      const columnType = result[0].data_type;

      if (columnType === 'USER-DEFINED') {
        // Column is using a PostgreSQL ENUM type
        // Note: PostgreSQL doesn't support removing enum values directly
        // You would need to recreate the enum type, which is complex
        // For this migration, we'll just leave the enum value in place
        // since we've already migrated the data
        console.warn(
          'Cannot remove enum value from payment_activities_reconciliationstatus_enum. ' +
            'The value "not_applicable" will remain in the enum type.',
        );
      } else {
        // Column is using VARCHAR with CHECK constraint
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
  }
}
