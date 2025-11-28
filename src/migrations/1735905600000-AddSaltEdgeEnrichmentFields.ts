import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSaltEdgeEnrichmentFields1735905600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    const columnsToAdd = [
      new TableColumn({
        name: 'saltEdgeCategory',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'saltEdgeMerchantId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'saltEdgeMerchantName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'categorizationConfidence',
        type: 'decimal',
        precision: 5,
        scale: 2,
        isNullable: true,
      }),
    ];

    // Only add columns that don't exist
    for (const column of columnsToAdd) {
      const hasColumn = table?.columns.some((c) => c.name === column.name);
      if (!hasColumn) {
        await queryRunner.addColumn('transaction', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');
    const columnsToRemove = [
      'saltEdgeCategory',
      'saltEdgeMerchantId',
      'saltEdgeMerchantName',
      'categorizationConfidence',
    ];

    // Only drop columns that exist
    for (const columnName of columnsToRemove) {
      const hasColumn = table?.columns.some((c) => c.name === columnName);
      if (hasColumn) {
        await queryRunner.dropColumn('transaction', columnName);
      }
    }
  }
}
