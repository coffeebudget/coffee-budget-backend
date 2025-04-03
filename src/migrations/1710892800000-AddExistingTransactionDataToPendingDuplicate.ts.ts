import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddExistingTransactionDataToPendingDuplicate1710892800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn("pending_duplicates", new TableColumn({
            name: "existingTransactionData",
            type: "json",
            isNullable: true,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("pending_duplicates", "existingTransactionData");
    }
} 