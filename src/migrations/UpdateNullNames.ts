import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateNullNames1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE recurring_transaction 
            SET name = 'Untitled Transaction' 
            WHERE name IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No down migration needed
    }
} 