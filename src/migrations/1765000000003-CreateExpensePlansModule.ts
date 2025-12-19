import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateExpensePlansModule1765000000003 implements MigrationInterface {
  name = 'CreateExpensePlansModule1765000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // EXPENSE_PLANS TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasExpensePlansTable = await queryRunner.hasTable('expense_plans');
    if (!hasExpensePlansTable) {
      await queryRunner.createTable(
        new Table({
          name: 'expense_plans',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'userId',
              type: 'int',
              isNullable: false,
            },
            // Identity
            {
              name: 'name',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'icon',
              type: 'varchar',
              length: '10',
              isNullable: true,
            },
            // Classification
            {
              name: 'planType',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'priority',
              type: 'varchar',
              length: '20',
              default: "'important'",
              isNullable: false,
            },
            {
              name: 'categoryId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'autoTrackCategory',
              type: 'boolean',
              default: false,
              isNullable: false,
            },
            // Financial
            {
              name: 'targetAmount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'currentBalance',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'monthlyContribution',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'contributionSource',
              type: 'varchar',
              length: '20',
              default: "'calculated'",
              isNullable: false,
            },
            // Timing
            {
              name: 'frequency',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'frequencyYears',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'dueMonth',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'dueDay',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'targetDate',
              type: 'date',
              isNullable: true,
            },
            {
              name: 'seasonalMonths',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'lastFundedDate',
              type: 'date',
              isNullable: true,
            },
            {
              name: 'nextDueDate',
              type: 'date',
              isNullable: true,
            },
            // Tracking
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'active'",
              isNullable: false,
            },
            {
              name: 'autoCalculate',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            {
              name: 'rolloverSurplus',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            // Initialization
            {
              name: 'initialBalanceSource',
              type: 'varchar',
              length: '20',
              default: "'zero'",
              isNullable: false,
            },
            {
              name: 'initialBalanceCustom',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: true,
            },
            // Metadata
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Add foreign keys for expense_plans
      await queryRunner.createForeignKey(
        'expense_plans',
        new TableForeignKey({
          name: 'FK_expense_plans_user',
          columnNames: ['userId'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'expense_plans',
        new TableForeignKey({
          name: 'FK_expense_plans_category',
          columnNames: ['categoryId'],
          referencedTableName: 'category',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add index for expense_plans
      await queryRunner.createIndex(
        'expense_plans',
        new TableIndex({
          name: 'IDX_expense_plans_user_status',
          columnNames: ['userId', 'status'],
        }),
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPENSE_PLAN_TRANSACTIONS TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasTransactionsTable = await queryRunner.hasTable('expense_plan_transactions');
    if (!hasTransactionsTable) {
      await queryRunner.createTable(
        new Table({
          name: 'expense_plan_transactions',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'expensePlanId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'type',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'date',
              type: 'date',
              isNullable: false,
            },
            {
              name: 'balanceAfter',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'transactionId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'note',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'isAutomatic',
              type: 'boolean',
              default: false,
              isNullable: false,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Add foreign keys for expense_plan_transactions
      await queryRunner.createForeignKey(
        'expense_plan_transactions',
        new TableForeignKey({
          name: 'FK_expense_plan_transactions_plan',
          columnNames: ['expensePlanId'],
          referencedTableName: 'expense_plans',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'expense_plan_transactions',
        new TableForeignKey({
          name: 'FK_expense_plan_transactions_transaction',
          columnNames: ['transactionId'],
          referencedTableName: 'transaction',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add index for expense_plan_transactions
      await queryRunner.createIndex(
        'expense_plan_transactions',
        new TableIndex({
          name: 'IDX_expense_plan_transactions_plan_date',
          columnNames: ['expensePlanId', 'date'],
        }),
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // INCOME_DISTRIBUTION_RULES TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasRulesTable = await queryRunner.hasTable('income_distribution_rules');
    if (!hasRulesTable) {
      await queryRunner.createTable(
        new Table({
          name: 'income_distribution_rules',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'userId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'name',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            // Detection criteria
            {
              name: 'expectedAmount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'amountTolerance',
              type: 'decimal',
              precision: 5,
              scale: 2,
              default: 10,
              isNullable: false,
            },
            {
              name: 'descriptionPattern',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'categoryId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'bankAccountId',
              type: 'int',
              isNullable: true,
            },
            // Distribution settings
            {
              name: 'autoDistribute',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            {
              name: 'distributionStrategy',
              type: 'varchar',
              length: '20',
              default: "'priority'",
              isNullable: false,
            },
            {
              name: 'isActive',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            // Metadata
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Add foreign keys for income_distribution_rules
      await queryRunner.createForeignKey(
        'income_distribution_rules',
        new TableForeignKey({
          name: 'FK_income_distribution_rules_user',
          columnNames: ['userId'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'income_distribution_rules',
        new TableForeignKey({
          name: 'FK_income_distribution_rules_category',
          columnNames: ['categoryId'],
          referencedTableName: 'category',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'income_distribution_rules',
        new TableForeignKey({
          name: 'FK_income_distribution_rules_bank_account',
          columnNames: ['bankAccountId'],
          referencedTableName: 'bank_account',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add index for income_distribution_rules
      await queryRunner.createIndex(
        'income_distribution_rules',
        new TableIndex({
          name: 'IDX_income_distribution_rules_user_active',
          columnNames: ['userId', 'isActive'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // DROP INCOME_DISTRIBUTION_RULES
    // ═══════════════════════════════════════════════════════════════

    const rulesTable = await queryRunner.getTable('income_distribution_rules');
    if (rulesTable) {
      // Drop index
      const rulesIndex = rulesTable.indices.find(
        (idx) => idx.name === 'IDX_income_distribution_rules_user_active',
      );
      if (rulesIndex) {
        await queryRunner.dropIndex('income_distribution_rules', rulesIndex);
      }

      // Drop foreign keys
      const fkUser = rulesTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_distribution_rules_user',
      );
      if (fkUser) {
        await queryRunner.dropForeignKey('income_distribution_rules', fkUser);
      }

      const fkCategory = rulesTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_distribution_rules_category',
      );
      if (fkCategory) {
        await queryRunner.dropForeignKey('income_distribution_rules', fkCategory);
      }

      const fkBankAccount = rulesTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_distribution_rules_bank_account',
      );
      if (fkBankAccount) {
        await queryRunner.dropForeignKey('income_distribution_rules', fkBankAccount);
      }

      await queryRunner.dropTable('income_distribution_rules');
    }

    // ═══════════════════════════════════════════════════════════════
    // DROP EXPENSE_PLAN_TRANSACTIONS
    // ═══════════════════════════════════════════════════════════════

    const transactionsTable = await queryRunner.getTable('expense_plan_transactions');
    if (transactionsTable) {
      // Drop index
      const transactionsIndex = transactionsTable.indices.find(
        (idx) => idx.name === 'IDX_expense_plan_transactions_plan_date',
      );
      if (transactionsIndex) {
        await queryRunner.dropIndex('expense_plan_transactions', transactionsIndex);
      }

      // Drop foreign keys
      const fkPlan = transactionsTable.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plan_transactions_plan',
      );
      if (fkPlan) {
        await queryRunner.dropForeignKey('expense_plan_transactions', fkPlan);
      }

      const fkTransaction = transactionsTable.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plan_transactions_transaction',
      );
      if (fkTransaction) {
        await queryRunner.dropForeignKey('expense_plan_transactions', fkTransaction);
      }

      await queryRunner.dropTable('expense_plan_transactions');
    }

    // ═══════════════════════════════════════════════════════════════
    // DROP EXPENSE_PLANS
    // ═══════════════════════════════════════════════════════════════

    const plansTable = await queryRunner.getTable('expense_plans');
    if (plansTable) {
      // Drop index
      const plansIndex = plansTable.indices.find(
        (idx) => idx.name === 'IDX_expense_plans_user_status',
      );
      if (plansIndex) {
        await queryRunner.dropIndex('expense_plans', plansIndex);
      }

      // Drop foreign keys
      const fkUser = plansTable.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plans_user',
      );
      if (fkUser) {
        await queryRunner.dropForeignKey('expense_plans', fkUser);
      }

      const fkCategory = plansTable.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plans_category',
      );
      if (fkCategory) {
        await queryRunner.dropForeignKey('expense_plans', fkCategory);
      }

      await queryRunner.dropTable('expense_plans');
    }
  }
}
