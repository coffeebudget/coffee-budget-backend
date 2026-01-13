import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateExistingGocardlessConnections1768100000002
  implements MigrationInterface
{
  name = 'MigrateExistingGocardlessConnections1768100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration creates placeholder connection records for existing accounts
    // Since we don't have requisition data, we create connections with:
    // - connectedAt = current date (conservative estimate)
    // - expiresAt = current date (forces re-authentication)
    // - status = 'expired'

    // Get all distinct gocardlessAccountIds grouped by user from bank accounts
    const existingBankAccounts = await queryRunner.query(`
      SELECT ba."userId", array_agg(ba."gocardlessAccountId") as account_ids
      FROM bank_account ba
      WHERE ba."gocardlessAccountId" IS NOT NULL
      GROUP BY ba."userId"
    `);

    // Get all distinct gocardlessAccountIds grouped by user from credit cards
    const existingCreditCards = await queryRunner.query(`
      SELECT cc."userId", array_agg(cc."gocardlessAccountId") as account_ids
      FROM credit_card cc
      WHERE cc."gocardlessAccountId" IS NOT NULL
      GROUP BY cc."userId"
    `);

    // Merge accounts by user
    const userAccountsMap = new Map<number, string[]>();

    for (const row of existingBankAccounts) {
      const userId = row.userId;
      const accountIds = row.account_ids || [];
      if (!userAccountsMap.has(userId)) {
        userAccountsMap.set(userId, []);
      }
      userAccountsMap.get(userId)!.push(...accountIds);
    }

    for (const row of existingCreditCards) {
      const userId = row.userId;
      const accountIds = row.account_ids || [];
      if (!userAccountsMap.has(userId)) {
        userAccountsMap.set(userId, []);
      }
      userAccountsMap.get(userId)!.push(...accountIds);
    }

    // Create a single "legacy" connection per user with expired status
    for (const [userId, accountIds] of userAccountsMap) {
      // Remove duplicates
      const uniqueAccountIds = [...new Set(accountIds)];

      await queryRunner.query(
        `
        INSERT INTO gocardless_connections (
          "userId",
          "requisitionId",
          "institutionId",
          "institutionName",
          "status",
          "connectedAt",
          "expiresAt",
          "linkedAccountIds"
        ) VALUES (
          $1,
          $2,
          'UNKNOWN',
          'Legacy Connection (requires re-authentication)',
          'expired',
          NOW(),
          NOW(),
          $3::jsonb
        )
      `,
        [
          userId,
          `legacy-migration-${userId}`,
          JSON.stringify(uniqueAccountIds),
        ],
      );
    }

    // Log migration result
    const count = userAccountsMap.size;
    if (count > 0) {
      console.log(
        `Created ${count} legacy GoCardless connection(s) for existing accounts`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove migrated connections
    await queryRunner.query(`
      DELETE FROM gocardless_connections
      WHERE "requisitionId" LIKE 'legacy-migration-%'
    `);
  }
}
