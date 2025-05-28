import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveRecurringTransactionRelationship1745467890000 implements MigrationInterface {
    name = 'RemoveRecurringTransactionRelationship1745467890000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if the column exists before attempting to drop it
        const hasColumn = await queryRunner.hasColumn('transaction', 'recurringTransactionId');
        
        if (hasColumn) {
            // Drop the foreign key constraint first
            const table = await queryRunner.getTable('transaction');
            
            if (table) {
                const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('recurringTransactionId') !== -1);
                
                if (foreignKey) {
                    await queryRunner.dropForeignKey('transaction', foreignKey);
                }
            }
            
            // Then drop the column
            await queryRunner.dropColumn('transaction', 'recurringTransactionId');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Re-add the column if needed
        await queryRunner.query(`ALTER TABLE "transaction" ADD "recurringTransactionId" integer`);
        await queryRunner.query(`ALTER TABLE "transaction" ADD CONSTRAINT "FK_recurringTransaction" FOREIGN KEY ("recurringTransactionId") REFERENCES "recurring_transaction"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
} 