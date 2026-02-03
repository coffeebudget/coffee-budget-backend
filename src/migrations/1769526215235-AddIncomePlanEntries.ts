import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIncomePlanEntries1769526215235 implements MigrationInterface {
  name = 'AddIncomePlanEntries1769526215235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_activities" DROP CONSTRAINT "FK_payment_activities_reconciledTransactionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_activities" DROP CONSTRAINT "FK_payment_activities_paymentAccountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_accounts" DROP CONSTRAINT "FK_payment_accounts_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_accounts" DROP CONSTRAINT "FK_payment_accounts_linkedBankAccountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP CONSTRAINT "FK_expense_plan_suggestions_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP CONSTRAINT "FK_expense_plan_suggestions_expense_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP CONSTRAINT "FK_expense_plan_suggestions_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP CONSTRAINT "FK_detected_patterns_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP CONSTRAINT "FK_detected_patterns_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" DROP CONSTRAINT "FK_gocardless_connections_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" DROP CONSTRAINT "FK_expense_plan_transactions_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" DROP CONSTRAINT "FK_expense_plan_transactions_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "fk_expense_plans_payment_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "FK_expense_plans_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "FK_expense_plans_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_transaction_link_suggestions_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_transaction_link_suggestions_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_transaction_link_suggestions_plan_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_transaction_link_suggestions_expense_plan"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_income_distribution_rules_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_income_distribution_rules_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_income_distribution_rules_bank_account"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_activities_externalId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_activities_paymentAccountId_executionDate"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_activities_reconciliationStatus"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_expense_plan_suggestions_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_expense_plan_suggestions_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_expense_plan_suggestions_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_detected_patterns_next_expected_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_detected_patterns_user_confidence"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_gocardless_connections_expiresAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_gocardless_connections_requisitionId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_gocardless_connections_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_gocardless_connections_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_gocardless_connections_userId_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_expense_plan_transactions_plan_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_expense_plans_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_plans_adjustment_suggested"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_expense_plans_payment_account"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transaction_link_suggestions_pending_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transaction_link_suggestions_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_income_distribution_rules_user_active"`,
    );
    await queryRunner.query(
      `CREATE TABLE "income_plans" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "name" character varying(100) NOT NULL, "description" text, "icon" character varying(10), "reliability" character varying(20) NOT NULL DEFAULT 'guaranteed', "categoryId" integer, "january" numeric(12,2) NOT NULL DEFAULT '0', "february" numeric(12,2) NOT NULL DEFAULT '0', "march" numeric(12,2) NOT NULL DEFAULT '0', "april" numeric(12,2) NOT NULL DEFAULT '0', "may" numeric(12,2) NOT NULL DEFAULT '0', "june" numeric(12,2) NOT NULL DEFAULT '0', "july" numeric(12,2) NOT NULL DEFAULT '0', "august" numeric(12,2) NOT NULL DEFAULT '0', "september" numeric(12,2) NOT NULL DEFAULT '0', "october" numeric(12,2) NOT NULL DEFAULT '0', "november" numeric(12,2) NOT NULL DEFAULT '0', "december" numeric(12,2) NOT NULL DEFAULT '0', "paymentAccountId" integer, "expectedDay" integer, "status" character varying(20) NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_061bdfec9ea677fd97ac0d8af5f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb6ed4df479493c9d4d74cab6c" ON "income_plans" ("userId", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "income_plan_entries" ("id" SERIAL NOT NULL, "incomePlanId" integer NOT NULL, "year" integer NOT NULL, "month" integer NOT NULL, "actualAmount" numeric(12,2) NOT NULL, "expectedAmount" numeric(12,2) NOT NULL, "transactionId" integer, "note" character varying(255), "isAutomatic" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1e681593e82e34b6cdf3e2b1ea6" UNIQUE ("incomePlanId", "year", "month"), CONSTRAINT "PK_cf7ec395e9e10df292d2f8144c0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1e681593e82e34b6cdf3e2b1ea" ON "income_plan_entries" ("incomePlanId", "year", "month") `,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."expense_type_enum" RENAME TO "expense_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expense_plan_suggestions_expense_type_enum" AS ENUM('subscription', 'utility', 'insurance', 'mortgage', 'rent', 'loan', 'tax', 'salary', 'investment', 'other_fixed', 'variable')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "expense_type" TYPE "public"."expense_plan_suggestions_expense_type_enum" USING "expense_type"::"text"::"public"."expense_plan_suggestions_expense_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."expense_type_enum_old"`);
    // Rename shared frequency_type_enum to old (used by both expense_plan_suggestions and detected_patterns)
    await queryRunner.query(
      `ALTER TYPE "public"."frequency_type_enum" RENAME TO "frequency_type_enum_old"`,
    );

    // Create new enums for both tables
    await queryRunner.query(
      `CREATE TYPE "public"."expense_plan_suggestions_frequency_type_enum" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."detected_patterns_frequency_type_enum" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')`,
    );

    // Migrate both columns BEFORE dropping the old enum
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "frequency_type" TYPE "public"."expense_plan_suggestions_frequency_type_enum" USING "frequency_type"::"text"::"public"."expense_plan_suggestions_frequency_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "frequency_type" TYPE "public"."detected_patterns_frequency_type_enum" USING "frequency_type"::"text"::"public"."detected_patterns_frequency_type_enum"`,
    );

    // Now safe to drop the old enum
    await queryRunner.query(`DROP TYPE "public"."frequency_type_enum_old"`);

    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "created_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "updated_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP COLUMN "merchant_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD "merchant_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP COLUMN "representative_description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD "representative_description" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "created_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "updated_at" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."gocardless_connection_status_enum" RENAME TO "gocardless_connection_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."gocardless_connections_status_enum" AS ENUM('active', 'expiring_soon', 'expired', 'disconnected', 'error')`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" TYPE "public"."gocardless_connections_status_enum" USING "status"::"text"::"public"."gocardless_connections_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."gocardless_connection_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "paymentAccountType" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "suggestedMonthlyContribution" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "suggestedAdjustmentPercent" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "adjustmentReason" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "updatedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ALTER COLUMN "updatedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ALTER COLUMN "updatedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_44c28d643272964b5d32272dcd" ON "expense_plan_suggestions" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f022ffe1bf265ef5be268b08c1" ON "expense_plan_suggestions" ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9d348fa1c254fcb2c58c29b54" ON "gocardless_connections" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb1f75780a65d016f4b2cc306e" ON "gocardless_connections" ("requisitionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f83fb390634904cc647e16ec4" ON "gocardless_connections" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_39dc610fead0cacf58dd1aaf89" ON "gocardless_connections" ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9271e4379e4737d8c0dd17b0b7" ON "expense_plan_transactions" ("expensePlanId", "date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ebb2b957e2d93df6339d12d12" ON "expense_plans" ("userId", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_53c9ceb1c1376a49fed6f8648f" ON "transaction_link_suggestions" ("userId", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8bb4bec62170750a3a1a4c517c" ON "income_distribution_rules" ("userId", "isActive") `,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD CONSTRAINT "FK_07fb376fefd1118d09446d92648" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD CONSTRAINT "FK_15f710f3e0ce7df2ec4d883acf0" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD CONSTRAINT "FK_45f2007646c0cbe201d10b24e50" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD CONSTRAINT "FK_b33bfe7e99b1a3e6a8c00b6cae6" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" ADD CONSTRAINT "FK_96610dfbdd23b8def34c738eff6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" ADD CONSTRAINT "FK_557d370205b3a3b723d173802ca" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" ADD CONSTRAINT "FK_7dd4b79aef3cd3ec6dba8c9ece9" FOREIGN KEY ("paymentAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plan_entries" ADD CONSTRAINT "FK_41dbe2e17d966f801d896d34664" FOREIGN KEY ("incomePlanId") REFERENCES "income_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plan_entries" ADD CONSTRAINT "FK_e3ce679b3021885fe5083466f04" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ADD CONSTRAINT "FK_e9d348fa1c254fcb2c58c29b548" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ADD CONSTRAINT "FK_4c37e8039479b4409e1a60f0f05" FOREIGN KEY ("expensePlanId") REFERENCES "expense_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ADD CONSTRAINT "FK_2ade87e2cf82ca259a7e3245e6c" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "FK_18add42f66d957dae030f755147" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "FK_674ba7df949da468e5f51d13d1f" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "FK_c63e2ea4426b48f19c8f654cc3d" FOREIGN KEY ("paymentAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_16ee43993b51c6d65ee1456b0e5" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_6b3ffc930f6ca98b314984ce0b7" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_b5a0eec6fee248add80a62f18ac" FOREIGN KEY ("expensePlanId") REFERENCES "expense_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_0d8165c8b8ec5cc9bf467676301" FOREIGN KEY ("expensePlanTransactionId") REFERENCES "expense_plan_transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_8b04c4a7fd13990f2ccf4116ed9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_032caecf87222d1ffb50dc58a1b" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_1d85318e6dd1af0ef87040e3511" FOREIGN KEY ("bankAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_1d85318e6dd1af0ef87040e3511"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_032caecf87222d1ffb50dc58a1b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" DROP CONSTRAINT "FK_8b04c4a7fd13990f2ccf4116ed9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_0d8165c8b8ec5cc9bf467676301"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_b5a0eec6fee248add80a62f18ac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_6b3ffc930f6ca98b314984ce0b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" DROP CONSTRAINT "FK_16ee43993b51c6d65ee1456b0e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "FK_c63e2ea4426b48f19c8f654cc3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "FK_674ba7df949da468e5f51d13d1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP CONSTRAINT "FK_18add42f66d957dae030f755147"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" DROP CONSTRAINT "FK_2ade87e2cf82ca259a7e3245e6c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" DROP CONSTRAINT "FK_4c37e8039479b4409e1a60f0f05"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" DROP CONSTRAINT "FK_e9d348fa1c254fcb2c58c29b548"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plan_entries" DROP CONSTRAINT "FK_e3ce679b3021885fe5083466f04"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plan_entries" DROP CONSTRAINT "FK_41dbe2e17d966f801d896d34664"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" DROP CONSTRAINT "FK_7dd4b79aef3cd3ec6dba8c9ece9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" DROP CONSTRAINT "FK_557d370205b3a3b723d173802ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_plans" DROP CONSTRAINT "FK_96610dfbdd23b8def34c738eff6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP CONSTRAINT "FK_b33bfe7e99b1a3e6a8c00b6cae6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP CONSTRAINT "FK_45f2007646c0cbe201d10b24e50"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP CONSTRAINT "FK_15f710f3e0ce7df2ec4d883acf0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" DROP CONSTRAINT "FK_07fb376fefd1118d09446d92648"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8bb4bec62170750a3a1a4c517c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_53c9ceb1c1376a49fed6f8648f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8ebb2b957e2d93df6339d12d12"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9271e4379e4737d8c0dd17b0b7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_39dc610fead0cacf58dd1aaf89"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4f83fb390634904cc647e16ec4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cb1f75780a65d016f4b2cc306e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9d348fa1c254fcb2c58c29b54"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f022ffe1bf265ef5be268b08c1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_44c28d643272964b5d32272dcd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "adjustmentReason" SET DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "suggestedAdjustmentPercent" SET DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "suggestedMonthlyContribution" SET DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ALTER COLUMN "paymentAccountType" SET DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."gocardless_connection_status_enum_old" AS ENUM('active', 'expiring_soon', 'expired', 'disconnected', 'error')`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" TYPE "public"."gocardless_connection_status_enum_old" USING "status"::"text"::"public"."gocardless_connection_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."gocardless_connections_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."gocardless_connection_status_enum_old" RENAME TO "gocardless_connection_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."frequency_type_enum_old" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ALTER COLUMN "frequency_type" TYPE "public"."frequency_type_enum_old" USING "frequency_type"::"text"::"public"."frequency_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."detected_patterns_frequency_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."frequency_type_enum_old" RENAME TO "frequency_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP COLUMN "representative_description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD "representative_description" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" DROP COLUMN "merchant_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD "merchant_name" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."frequency_type_enum_old" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "frequency_type" TYPE "public"."frequency_type_enum_old" USING "frequency_type"::"text"::"public"."frequency_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."expense_plan_suggestions_frequency_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."frequency_type_enum_old" RENAME TO "frequency_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expense_type_enum_old" AS ENUM('subscription', 'utility', 'insurance', 'mortgage', 'rent', 'loan', 'tax', 'salary', 'investment', 'other_fixed', 'variable')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ALTER COLUMN "expense_type" TYPE "public"."expense_type_enum_old" USING "expense_type"::"text"::"public"."expense_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."expense_plan_suggestions_expense_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."expense_type_enum_old" RENAME TO "expense_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1e681593e82e34b6cdf3e2b1ea"`,
    );
    await queryRunner.query(`DROP TABLE "income_plan_entries"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cb6ed4df479493c9d4d74cab6c"`,
    );
    await queryRunner.query(`DROP TABLE "income_plans"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_income_distribution_rules_user_active" ON "income_distribution_rules" ("isActive", "userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transaction_link_suggestions_user_status" ON "transaction_link_suggestions" ("status", "userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_transaction_link_suggestions_pending_unique" ON "transaction_link_suggestions" ("expensePlanId", "transactionId") WHERE ((status)::text = 'pending'::text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_plans_payment_account" ON "expense_plans" ("paymentAccountId") WHERE ("paymentAccountId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_plans_adjustment_suggested" ON "expense_plans" ("suggestedMonthlyContribution") WHERE ("suggestedMonthlyContribution" IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plans_user_status" ON "expense_plans" ("status", "userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plan_transactions_plan_date" ON "expense_plan_transactions" ("date", "expensePlanId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gocardless_connections_userId_status" ON "gocardless_connections" ("status", "userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gocardless_connections_userId" ON "gocardless_connections" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gocardless_connections_status" ON "gocardless_connections" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gocardless_connections_requisitionId" ON "gocardless_connections" ("requisitionId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gocardless_connections_expiresAt" ON "gocardless_connections" ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_detected_patterns_user_confidence" ON "detected_patterns" ("overall_confidence", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_detected_patterns_next_expected_date" ON "detected_patterns" ("next_expected_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plan_suggestions_user_status" ON "expense_plan_suggestions" ("status", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plan_suggestions_user_created" ON "expense_plan_suggestions" ("created_at", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expense_plan_suggestions_expires_at" ON "expense_plan_suggestions" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_activities_reconciliationStatus" ON "payment_activities" ("reconciliationStatus") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_activities_paymentAccountId_executionDate" ON "payment_activities" ("executionDate", "paymentAccountId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_activities_externalId" ON "payment_activities" ("externalId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_income_distribution_rules_bank_account" FOREIGN KEY ("bankAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_income_distribution_rules_category" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "income_distribution_rules" ADD CONSTRAINT "FK_income_distribution_rules_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_transaction_link_suggestions_expense_plan" FOREIGN KEY ("expensePlanId") REFERENCES "expense_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_transaction_link_suggestions_plan_transaction" FOREIGN KEY ("expensePlanTransactionId") REFERENCES "expense_plan_transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_transaction_link_suggestions_transaction" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_link_suggestions" ADD CONSTRAINT "FK_transaction_link_suggestions_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "FK_expense_plans_category" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "FK_expense_plans_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD CONSTRAINT "fk_expense_plans_payment_account" FOREIGN KEY ("paymentAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ADD CONSTRAINT "FK_expense_plan_transactions_plan" FOREIGN KEY ("expensePlanId") REFERENCES "expense_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_transactions" ADD CONSTRAINT "FK_expense_plan_transactions_transaction" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "gocardless_connections" ADD CONSTRAINT "FK_gocardless_connections_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD CONSTRAINT "FK_detected_patterns_category" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detected_patterns" ADD CONSTRAINT "FK_detected_patterns_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD CONSTRAINT "FK_expense_plan_suggestions_category" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD CONSTRAINT "FK_expense_plan_suggestions_expense_plan" FOREIGN KEY ("approved_expense_plan_id") REFERENCES "expense_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plan_suggestions" ADD CONSTRAINT "FK_expense_plan_suggestions_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_accounts" ADD CONSTRAINT "FK_payment_accounts_linkedBankAccountId" FOREIGN KEY ("linkedBankAccountId") REFERENCES "bank_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_accounts" ADD CONSTRAINT "FK_payment_accounts_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_activities" ADD CONSTRAINT "FK_payment_activities_paymentAccountId" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_activities" ADD CONSTRAINT "FK_payment_activities_reconciledTransactionId" FOREIGN KEY ("reconciledTransactionId") REFERENCES "transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
