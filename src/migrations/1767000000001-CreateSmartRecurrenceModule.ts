import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSmartRecurrenceModule1767000000001 implements MigrationInterface {
  name = 'CreateSmartRecurrenceModule1767000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // CREATE ENUM TYPES
    // ═══════════════════════════════════════════════════════════════

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "frequency_type_enum" AS ENUM (
          'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "expense_type_enum" AS ENUM (
          'subscription', 'utility', 'insurance', 'mortgage', 'rent',
          'loan', 'tax', 'salary', 'investment', 'other_fixed', 'variable'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ═══════════════════════════════════════════════════════════════
    // DETECTED_PATTERNS TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasDetectedPatternsTable = await queryRunner.hasTable('detected_patterns');
    if (!hasDetectedPatternsTable) {
      await queryRunner.createTable(
        new Table({
          name: 'detected_patterns',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'user_id',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'category_id',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'merchant_name',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'representative_description',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'average_amount',
              type: 'decimal',
              precision: 10,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'frequency_type',
              type: 'frequency_type_enum',
              isNullable: false,
            },
            {
              name: 'interval_days',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'frequency_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'similarity_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'overall_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'occurrence_count',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'first_occurrence',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'last_occurrence',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'next_expected_date',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'metadata',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'is_active',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Add foreign keys for detected_patterns
      await queryRunner.createForeignKey(
        'detected_patterns',
        new TableForeignKey({
          name: 'FK_detected_patterns_user',
          columnNames: ['user_id'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'detected_patterns',
        new TableForeignKey({
          name: 'FK_detected_patterns_category',
          columnNames: ['category_id'],
          referencedTableName: 'category',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add indexes for detected_patterns
      await queryRunner.createIndex(
        'detected_patterns',
        new TableIndex({
          name: 'IDX_detected_patterns_user_confidence',
          columnNames: ['user_id', 'overall_confidence'],
        }),
      );

      await queryRunner.createIndex(
        'detected_patterns',
        new TableIndex({
          name: 'IDX_detected_patterns_next_expected_date',
          columnNames: ['next_expected_date'],
        }),
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPENSE_PLAN_SUGGESTIONS TABLE
    // ═══════════════════════════════════════════════════════════════

    const hasSuggestionsTable = await queryRunner.hasTable('expense_plan_suggestions');
    if (!hasSuggestionsTable) {
      await queryRunner.createTable(
        new Table({
          name: 'expense_plan_suggestions',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'user_id',
              type: 'int',
              isNullable: false,
            },
            // Suggestion Identity
            {
              name: 'suggested_name',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
            },
            // Pattern Source Data
            {
              name: 'merchant_name',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'representative_description',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'category_id',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'category_name',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
            // Financial Data
            {
              name: 'average_amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'monthly_contribution',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'yearly_total',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            // Classification Data
            {
              name: 'expense_type',
              type: 'expense_type_enum',
              isNullable: false,
            },
            {
              name: 'is_essential',
              type: 'boolean',
              isNullable: false,
            },
            {
              name: 'frequency_type',
              type: 'frequency_type_enum',
              isNullable: false,
            },
            {
              name: 'interval_days',
              type: 'int',
              isNullable: false,
            },
            // Confidence Metrics
            {
              name: 'pattern_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'classification_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'overall_confidence',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'classification_reasoning',
              type: 'text',
              isNullable: true,
            },
            // Occurrence Data
            {
              name: 'occurrence_count',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'first_occurrence',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'last_occurrence',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'next_expected_date',
              type: 'timestamp',
              isNullable: false,
            },
            // Metadata
            {
              name: 'metadata',
              type: 'jsonb',
              isNullable: true,
            },
            // Status & Workflow
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'pending'",
              isNullable: false,
            },
            {
              name: 'approved_expense_plan_id',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'rejection_reason',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'reviewed_at',
              type: 'timestamp',
              isNullable: true,
            },
            // Timestamps
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
            {
              name: 'expires_at',
              type: 'timestamp',
              isNullable: true,
            },
          ],
        }),
        true,
      );

      // Add foreign keys for expense_plan_suggestions
      await queryRunner.createForeignKey(
        'expense_plan_suggestions',
        new TableForeignKey({
          name: 'FK_expense_plan_suggestions_user',
          columnNames: ['user_id'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'expense_plan_suggestions',
        new TableForeignKey({
          name: 'FK_expense_plan_suggestions_category',
          columnNames: ['category_id'],
          referencedTableName: 'category',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      await queryRunner.createForeignKey(
        'expense_plan_suggestions',
        new TableForeignKey({
          name: 'FK_expense_plan_suggestions_expense_plan',
          columnNames: ['approved_expense_plan_id'],
          referencedTableName: 'expense_plans',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add indexes for expense_plan_suggestions
      await queryRunner.createIndex(
        'expense_plan_suggestions',
        new TableIndex({
          name: 'IDX_expense_plan_suggestions_user_status',
          columnNames: ['user_id', 'status'],
        }),
      );

      await queryRunner.createIndex(
        'expense_plan_suggestions',
        new TableIndex({
          name: 'IDX_expense_plan_suggestions_user_created',
          columnNames: ['user_id', 'created_at'],
        }),
      );

      await queryRunner.createIndex(
        'expense_plan_suggestions',
        new TableIndex({
          name: 'IDX_expense_plan_suggestions_expires_at',
          columnNames: ['expires_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════════
    // DROP EXPENSE_PLAN_SUGGESTIONS
    // ═══════════════════════════════════════════════════════════════

    const suggestionsTable = await queryRunner.getTable('expense_plan_suggestions');
    if (suggestionsTable) {
      // Drop indexes
      const suggestionsIndexes = [
        'IDX_expense_plan_suggestions_user_status',
        'IDX_expense_plan_suggestions_user_created',
        'IDX_expense_plan_suggestions_expires_at',
      ];
      for (const indexName of suggestionsIndexes) {
        const index = suggestionsTable.indices.find((idx) => idx.name === indexName);
        if (index) {
          await queryRunner.dropIndex('expense_plan_suggestions', index);
        }
      }

      // Drop foreign keys
      const suggestionsFks = [
        'FK_expense_plan_suggestions_user',
        'FK_expense_plan_suggestions_category',
        'FK_expense_plan_suggestions_expense_plan',
      ];
      for (const fkName of suggestionsFks) {
        const fk = suggestionsTable.foreignKeys.find((f) => f.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('expense_plan_suggestions', fk);
        }
      }

      await queryRunner.dropTable('expense_plan_suggestions');
    }

    // ═══════════════════════════════════════════════════════════════
    // DROP DETECTED_PATTERNS
    // ═══════════════════════════════════════════════════════════════

    const patternsTable = await queryRunner.getTable('detected_patterns');
    if (patternsTable) {
      // Drop indexes
      const patternsIndexes = [
        'IDX_detected_patterns_user_confidence',
        'IDX_detected_patterns_next_expected_date',
      ];
      for (const indexName of patternsIndexes) {
        const index = patternsTable.indices.find((idx) => idx.name === indexName);
        if (index) {
          await queryRunner.dropIndex('detected_patterns', index);
        }
      }

      // Drop foreign keys
      const patternsFks = [
        'FK_detected_patterns_user',
        'FK_detected_patterns_category',
      ];
      for (const fkName of patternsFks) {
        const fk = patternsTable.foreignKeys.find((f) => f.name === fkName);
        if (fk) {
          await queryRunner.dropForeignKey('detected_patterns', fk);
        }
      }

      await queryRunner.dropTable('detected_patterns');
    }

    // ═══════════════════════════════════════════════════════════════
    // DROP ENUM TYPES
    // ═══════════════════════════════════════════════════════════════

    await queryRunner.query(`DROP TYPE IF EXISTS "expense_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "frequency_type_enum"`);
  }
}
