import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddSyncReportRelationToImportLog1750000000002
  implements MigrationInterface
{
  name = 'AddSyncReportRelationToImportLog1750000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('import_log');

    // Add syncReportId column if it doesn't exist
    const hasColumn = table?.columns.some((c) => c.name === 'syncReportId');
    if (!hasColumn) {
      await queryRunner.addColumn(
        'import_log',
        new TableColumn({
          name: 'syncReportId',
          type: 'int',
          isNullable: true,
        }),
      );
    }

    // Add foreign key constraint if it doesn't exist
    const hasForeignKey = table?.foreignKeys.some(
      (fk) => fk.columnNames.indexOf('syncReportId') !== -1
    );
    if (!hasForeignKey) {
      await queryRunner.createForeignKey(
        'import_log',
        new TableForeignKey({
          columnNames: ['syncReportId'],
          referencedTableName: 'sync_reports',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Find and drop the foreign key
    const table = await queryRunner.getTable('import_log');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('syncReportId') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('import_log', foreignKey);
    }

    // Drop the syncReportId column
    await queryRunner.dropColumn('import_log', 'syncReportId');
  }
}
