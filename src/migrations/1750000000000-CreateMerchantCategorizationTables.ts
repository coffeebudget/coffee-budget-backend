import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMerchantCategorizationTables1750000000000 implements MigrationInterface {
  name = 'CreateMerchantCategorizationTables1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('merchant_categorization');
    if (tableExists) {
      return;
    }

    // Create merchant_categorization table
    await queryRunner.createTable(
      new Table({
        name: 'merchant_categorization',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'merchantName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'merchantCategoryCode',
            type: 'varchar',
            length: '10',
            isNullable: true,
          },
          {
            name: 'suggestedCategoryId',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'averageConfidence',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'usageCount',
            type: 'int',
            default: 1,
            isNullable: false,
          },
          {
            name: 'firstSeen',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'lastSeen',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'categoryHistory',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'aiPrompt',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'aiResponse',
            type: 'json',
            isNullable: true,
          },
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
          {
            name: 'userId',
            type: 'int',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['suggestedCategoryId'],
            referencedTableName: 'category',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create unique index for merchant categorization
    await queryRunner.createIndex(
      'merchant_categorization',
      new TableIndex({
        name: 'IDX_merchant_categorization_unique',
        columnNames: ['merchantName', 'merchantCategoryCode', 'userId'],
        isUnique: true,
      }),
    );

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('merchant_categorization', 'IDX_merchant_categorization_unique');

    // Drop tables
    await queryRunner.dropTable('merchant_categorization');
  }
}

