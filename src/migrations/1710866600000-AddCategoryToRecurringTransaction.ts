import { MigrationInterface, QueryRunner, TableForeignKey } from "typeorm";

export class AddCategoryToRecurringTransaction1710866600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // First, try to drop the existing foreign key if it exists
        try {
            const table = await queryRunner.getTable("recurring_transaction");
            if (table) {
                const foreignKey = table.foreignKeys.find(
                    (fk) => fk.columnNames.indexOf("categoryId") !== -1
                );
            if (foreignKey) {
                    await queryRunner.dropForeignKey("recurring_transaction", foreignKey);
                }
            }
        } catch (error) {
            // Ignore error if constraint doesn't exist
        }

        // Then create the new foreign key
        await queryRunner.createForeignKey(
            "recurring_transaction",
            new TableForeignKey({
                columnNames: ["categoryId"],
                referencedColumnNames: ["id"],
                referencedTableName: "category",
                onDelete: "SET NULL",
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("recurring_transaction");
        if (table) {
            const foreignKey = table.foreignKeys.find(
                (fk) => fk.columnNames.indexOf("categoryId") !== -1
            );
            if (foreignKey) {
                await queryRunner.dropForeignKey("recurring_transaction", foreignKey);
            }
        }
    }
} 