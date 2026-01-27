import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateIncomePlansTable1770000000001 implements MigrationInterface {
  name = 'CreateIncomePlansTable1770000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // INCOME_PLANS TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasIncomePlansTable = await queryRunner.hasTable('income_plans');
    if (!hasIncomePlansTable) {
      await queryRunner.createTable(
        new Table({
          name: 'income_plans',
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
              name: 'reliability',
              type: 'varchar',
              length: '20',
              default: "'guaranteed'",
              isNullable: false,
            },
            {
              name: 'categoryId',
              type: 'int',
              isNullable: true,
            },
            // Monthly Calendar (12 months)
            {
              name: 'january',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'february',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'march',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'april',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'may',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'june',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'july',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'august',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'september',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'october',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'november',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            {
              name: 'december',
              type: 'decimal',
              precision: 12,
              scale: 2,
              default: 0,
              isNullable: false,
            },
            // Payment Destination
            {
              name: 'paymentAccountId',
              type: 'int',
              isNullable: true,
            },
            // Timing
            {
              name: 'expectedDay',
              type: 'int',
              isNullable: true,
            },
            // Status
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'active'",
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

      // Add foreign keys for income_plans
      await queryRunner.createForeignKey(
        'income_plans',
        new TableForeignKey({
          name: 'FK_income_plans_user',
          columnNames: ['userId'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'income_plans',
        new TableForeignKey({
          name: 'FK_income_plans_category',
          columnNames: ['categoryId'],
          referencedTableName: 'category',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'income_plans',
        new TableForeignKey({
          name: 'FK_income_plans_payment_account',
          columnNames: ['paymentAccountId'],
          referencedTableName: 'bank_account',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add index for income_plans
      await queryRunner.createIndex(
        'income_plans',
        new TableIndex({
          name: 'IDX_income_plans_user_status',
          columnNames: ['userId', 'status'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // DROP INCOME_PLANS
    // ═══════════════════════════════════════════════════════════════

    const plansTable = await queryRunner.getTable('income_plans');
    if (plansTable) {
      // Drop index
      const plansIndex = plansTable.indices.find(
        (idx) => idx.name === 'IDX_income_plans_user_status',
      );
      if (plansIndex) {
        await queryRunner.dropIndex('income_plans', plansIndex);
      }

      // Drop foreign keys
      const fkUser = plansTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_plans_user',
      );
      if (fkUser) {
        await queryRunner.dropForeignKey('income_plans', fkUser);
      }

      const fkCategory = plansTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_plans_category',
      );
      if (fkCategory) {
        await queryRunner.dropForeignKey('income_plans', fkCategory);
      }

      const fkPaymentAccount = plansTable.foreignKeys.find(
        (fk) => fk.name === 'FK_income_plans_payment_account',
      );
      if (fkPaymentAccount) {
        await queryRunner.dropForeignKey('income_plans', fkPaymentAccount);
      }

      await queryRunner.dropTable('income_plans');
    }
  }
}
