import { MigrationInterface, QueryRunner } from "typeorm";
import { encrypt, encryptJson } from "../shared/encryption";

/**
 * Encrypts existing plaintext sensitive data and alters column types.
 *
 * Affected tables/columns:
 *   gocardless_connections: requisitionId, euaId, linkedAccountIds
 *   payment_accounts:       providerConfig
 *   bank_account:           gocardlessAccountId
 *   credit_card:            gocardlessAccountId
 *   payment_activities:     rawData
 *
 * This migration also drops the requisitionId index since encrypted values
 * cannot be meaningfully indexed.
 */
export class EncryptSensitiveFields1771200000001 implements MigrationInterface {
  name = "EncryptSensitiveFields1771200000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────────────
    // 1. Drop requisitionId indexes (encrypted data can't be indexed)
    // ──────────────────────────────────────────────────────
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gocardless_connections_requisitionId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cb1f75780a65d016f4b2cc306e"`,
    );

    // ──────────────────────────────────────────────────────
    // 2. Alter column types
    // ──────────────────────────────────────────────────────

    // gocardless_connections
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections"
         ALTER COLUMN "requisitionId" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections"
         ALTER COLUMN "euaId" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections"
         ALTER COLUMN "linkedAccountIds" TYPE text USING "linkedAccountIds"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections"
         ALTER COLUMN "linkedAccountIds" SET DEFAULT '[]'`,
    );

    // payment_accounts
    await queryRunner.query(
      `ALTER TABLE "payment_accounts"
         ALTER COLUMN "providerConfig" TYPE text USING "providerConfig"::text`,
    );

    // bank_account
    await queryRunner.query(
      `ALTER TABLE "bank_account"
         ALTER COLUMN "gocardlessAccountId" TYPE text`,
    );

    // credit_card
    await queryRunner.query(
      `ALTER TABLE "credit_card"
         ALTER COLUMN "gocardlessAccountId" TYPE text`,
    );

    // payment_activities
    await queryRunner.query(
      `ALTER TABLE "payment_activities"
         ALTER COLUMN "rawData" TYPE text USING "rawData"::text`,
    );

    // ──────────────────────────────────────────────────────
    // 3. Encrypt existing plaintext data
    // ──────────────────────────────────────────────────────

    // --- gocardless_connections: requisitionId, euaId ---
    await this.encryptColumn(
      queryRunner,
      "gocardless_connections",
      "requisitionId",
      "string",
    );
    await this.encryptColumn(
      queryRunner,
      "gocardless_connections",
      "euaId",
      "string",
    );

    // --- gocardless_connections: linkedAccountIds (JSON) ---
    await this.encryptColumn(
      queryRunner,
      "gocardless_connections",
      "linkedAccountIds",
      "json",
    );

    // --- payment_accounts: providerConfig (JSON) ---
    await this.encryptColumn(
      queryRunner,
      "payment_accounts",
      "providerConfig",
      "json",
    );

    // --- bank_account: gocardlessAccountId ---
    await this.encryptColumn(
      queryRunner,
      "bank_account",
      "gocardlessAccountId",
      "string",
    );

    // --- credit_card: gocardlessAccountId ---
    await this.encryptColumn(
      queryRunner,
      "credit_card",
      "gocardlessAccountId",
      "string",
    );

    // --- payment_activities: rawData (JSON) ---
    await this.encryptColumn(
      queryRunner,
      "payment_activities",
      "rawData",
      "json",
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      "This migration cannot be automatically reverted. " +
        "Encrypted data requires the ENCRYPTION_KEY to decrypt. " +
        "To revert, write a manual migration that decrypts each value, " +
        "restores original column types, and recreates the requisitionId index.",
    );
  }

  // ────────────────────────────────────────────────────────
  // Helper: read rows, encrypt values, write them back
  // ────────────────────────────────────────────────────────
  private async encryptColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    kind: "string" | "json",
  ): Promise<void> {
    const rows: { id: number; value: string | null }[] =
      await queryRunner.query(
        `SELECT "id", "${column}" AS "value" FROM "${table}"`,
      );

    for (const row of rows) {
      if (row.value == null) continue;

      let encrypted: string | null;
      if (kind === "json") {
        // Value was cast from jsonb to text by ALTER COLUMN, so it's a JSON string.
        // Parse it back to an object then encrypt as JSON.
        const parsed = JSON.parse(row.value);
        encrypted = encryptJson(parsed);
      } else {
        encrypted = encrypt(row.value);
      }

      await queryRunner.query(
        `UPDATE "${table}" SET "${column}" = $1 WHERE "id" = $2`,
        [encrypted, row.id],
      );
    }
  }
}
