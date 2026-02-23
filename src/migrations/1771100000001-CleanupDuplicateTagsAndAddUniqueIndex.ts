import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupDuplicateTagsAndAddUniqueIndex1771100000001
  implements MigrationInterface
{
  name = 'CleanupDuplicateTagsAndAddUniqueIndex1771100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Reassign join table rows from duplicate tags to the primary (oldest) tag
    // For each group of duplicates (same LOWER(TRIM(name)), same userId),
    // keep the tag with the lowest id and reassign all join table references.
    await queryRunner.query(`
      WITH duplicate_groups AS (
        SELECT
          LOWER(TRIM(name)) AS normalized_name,
          "userId",
          MIN(id) AS primary_id
        FROM tag
        GROUP BY LOWER(TRIM(name)), "userId"
        HAVING COUNT(*) > 1
      ),
      duplicates AS (
        SELECT t.id AS duplicate_id, dg.primary_id
        FROM tag t
        JOIN duplicate_groups dg
          ON LOWER(TRIM(t.name)) = dg.normalized_name
          AND t."userId" = dg."userId"
          AND t.id != dg.primary_id
      )
      UPDATE transaction_tags_tag
      SET "tagId" = d.primary_id
      FROM duplicates d
      WHERE transaction_tags_tag."tagId" = d.duplicate_id
        AND NOT EXISTS (
          SELECT 1 FROM transaction_tags_tag existing
          WHERE existing."transactionId" = transaction_tags_tag."transactionId"
            AND existing."tagId" = d.primary_id
        )
    `);

    // Step 2: Delete orphaned join table rows that now point to duplicate tags
    // (these are rows where the primary already existed, so the UPDATE above skipped them)
    await queryRunner.query(`
      WITH duplicate_groups AS (
        SELECT
          LOWER(TRIM(name)) AS normalized_name,
          "userId",
          MIN(id) AS primary_id
        FROM tag
        GROUP BY LOWER(TRIM(name)), "userId"
        HAVING COUNT(*) > 1
      ),
      duplicates AS (
        SELECT t.id AS duplicate_id
        FROM tag t
        JOIN duplicate_groups dg
          ON LOWER(TRIM(t.name)) = dg.normalized_name
          AND t."userId" = dg."userId"
          AND t.id != dg.primary_id
      )
      DELETE FROM transaction_tags_tag
      WHERE "tagId" IN (SELECT duplicate_id FROM duplicates)
    `);

    // Step 3: Delete the duplicate tag records themselves
    await queryRunner.query(`
      WITH duplicate_groups AS (
        SELECT
          LOWER(TRIM(name)) AS normalized_name,
          "userId",
          MIN(id) AS primary_id
        FROM tag
        GROUP BY LOWER(TRIM(name)), "userId"
        HAVING COUNT(*) > 1
      )
      DELETE FROM tag
      WHERE id IN (
        SELECT t.id
        FROM tag t
        JOIN duplicate_groups dg
          ON LOWER(TRIM(t.name)) = dg.normalized_name
          AND t."userId" = dg."userId"
          AND t.id != dg.primary_id
      )
    `);

    // Step 4: Trim whitespace from all tag names
    await queryRunner.query(`
      UPDATE tag SET name = TRIM(name) WHERE name != TRIM(name)
    `);

    // Step 5: Add unique index on (userId, LOWER(name)) to prevent future duplicates
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tag_userId_name_unique"
      ON tag ("userId", (LOWER(name)))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tag_userId_name_unique"
    `);
  }
}
