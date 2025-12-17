import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAccountsAndActivities1733917200000
  implements MigrationInterface
{
  name = 'AddPaymentAccountsAndActivities1733917200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create payment_accounts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_accounts" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "provider" character varying(255) NOT NULL,
        "displayName" character varying(255),
        "providerConfig" jsonb,
        "linkedBankAccountId" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_accounts" PRIMARY KEY ("id")
      )
    `);

    // Create payment_activities table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_activities" (
        "id" SERIAL NOT NULL,
        "paymentAccountId" integer NOT NULL,
        "externalId" character varying(255) NOT NULL,
        "merchantName" character varying(255),
        "merchantCategory" character varying(255),
        "merchantCategoryCode" character varying(10),
        "amount" numeric(12,2) NOT NULL,
        "executionDate" date NOT NULL,
        "description" text,
        "reconciledTransactionId" integer,
        "reconciliationStatus" character varying NOT NULL DEFAULT 'pending',
        "reconciliationConfidence" numeric(5,2),
        "reconciledAt" TIMESTAMP,
        "rawData" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payment_activities_externalId" UNIQUE ("externalId"),
        CONSTRAINT "PK_payment_activities" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_reconciliationStatus" CHECK ("reconciliationStatus" IN ('pending', 'reconciled', 'failed', 'manual'))
      )
    `);

    // Create indexes on payment_activities (check if exists first)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_activities_paymentAccountId_executionDate"
      ON "payment_activities" ("paymentAccountId", "executionDate")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_activities_externalId"
      ON "payment_activities" ("externalId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_activities_reconciliationStatus"
      ON "payment_activities" ("reconciliationStatus")
    `);

    // Add enrichment columns to transaction table (check if exists first)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transaction' AND column_name = 'enrichedFromPaymentActivityId'
        ) THEN
          ALTER TABLE "transaction" ADD COLUMN "enrichedFromPaymentActivityId" integer;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transaction' AND column_name = 'originalMerchantName'
        ) THEN
          ALTER TABLE "transaction" ADD COLUMN "originalMerchantName" character varying(255);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transaction' AND column_name = 'enhancedMerchantName'
        ) THEN
          ALTER TABLE "transaction" ADD COLUMN "enhancedMerchantName" character varying(255);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transaction' AND column_name = 'enhancedCategoryConfidence'
        ) THEN
          ALTER TABLE "transaction" ADD COLUMN "enhancedCategoryConfidence" numeric(5,2);
        END IF;
      END $$;
    `);

    // Add foreign key constraints (check if exists first)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_payment_accounts_userId'
        ) THEN
          ALTER TABLE "payment_accounts"
          ADD CONSTRAINT "FK_payment_accounts_userId"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_payment_accounts_linkedBankAccountId'
        ) THEN
          ALTER TABLE "payment_accounts"
          ADD CONSTRAINT "FK_payment_accounts_linkedBankAccountId"
          FOREIGN KEY ("linkedBankAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_payment_activities_paymentAccountId'
        ) THEN
          ALTER TABLE "payment_activities"
          ADD CONSTRAINT "FK_payment_activities_paymentAccountId"
          FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_payment_activities_reconciledTransactionId'
        ) THEN
          ALTER TABLE "payment_activities"
          ADD CONSTRAINT "FK_payment_activities_reconciledTransactionId"
          FOREIGN KEY ("reconciledTransactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "payment_activities" DROP CONSTRAINT "FK_payment_activities_reconciledTransactionId"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_activities" DROP CONSTRAINT "FK_payment_activities_paymentAccountId"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_accounts" DROP CONSTRAINT "FK_payment_accounts_linkedBankAccountId"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_accounts" DROP CONSTRAINT "FK_payment_accounts_userId"
    `);

    // Drop transaction enrichment columns
    await queryRunner.query(`
      ALTER TABLE "transaction" DROP COLUMN "enhancedCategoryConfidence"
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction" DROP COLUMN "enhancedMerchantName"
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction" DROP COLUMN "originalMerchantName"
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction" DROP COLUMN "enrichedFromPaymentActivityId"
    `);

    // Drop payment_activities indexes and table
    await queryRunner.query(`
      DROP INDEX "IDX_payment_activities_reconciliationStatus"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_payment_activities_externalId"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_payment_activities_paymentAccountId_executionDate"
    `);

    await queryRunner.query(`DROP TABLE "payment_activities"`);

    // Drop payment_accounts table
    await queryRunner.query(`DROP TABLE "payment_accounts"`);
  }
}
