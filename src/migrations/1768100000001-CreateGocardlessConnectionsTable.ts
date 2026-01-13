import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGocardlessConnectionsTable1768100000001
  implements MigrationInterface
{
  name = 'CreateGocardlessConnectionsTable1768100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      CREATE TYPE "gocardless_connection_status_enum" AS ENUM (
        'active',
        'expiring_soon',
        'expired',
        'disconnected',
        'error'
      )
    `);

    // Create the table
    await queryRunner.query(`
      CREATE TABLE "gocardless_connections" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "requisitionId" varchar(255) NOT NULL,
        "euaId" varchar(255),
        "institutionId" varchar(255) NOT NULL,
        "institutionName" varchar(255),
        "institutionLogo" varchar(512),
        "status" "gocardless_connection_status_enum" NOT NULL DEFAULT 'active',
        "connectedAt" TIMESTAMP NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "accessValidForDays" integer NOT NULL DEFAULT 90,
        "lastSyncAt" TIMESTAMP,
        "lastSyncError" text,
        "linkedAccountIds" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_gocardless_connections_userId"
      ON "gocardless_connections" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gocardless_connections_requisitionId"
      ON "gocardless_connections" ("requisitionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gocardless_connections_status"
      ON "gocardless_connections" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gocardless_connections_expiresAt"
      ON "gocardless_connections" ("expiresAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gocardless_connections_userId_status"
      ON "gocardless_connections" ("userId", "status")
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "gocardless_connections"
      ADD CONSTRAINT "FK_gocardless_connections_user"
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.query(`
      ALTER TABLE "gocardless_connections"
      DROP CONSTRAINT IF EXISTS "FK_gocardless_connections_user"
    `);

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_userId_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_expiresAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_requisitionId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_userId"`,
    );

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "gocardless_connections"`);

    // Drop enum type
    await queryRunner.query(
      `DROP TYPE IF EXISTS "gocardless_connection_status_enum"`,
    );
  }
}
