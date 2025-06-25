import { Test, TestingModule } from '@nestjs/testing';
import { BnlTxtParser } from './bnl-txt.parser';
import { Logger } from '@nestjs/common';

describe('BnlTxtParser', () => {
  let parser: BnlTxtParser;

  beforeEach(async () => {
    parser = new BnlTxtParser();
    // Mock the logger to avoid console output during tests
    (parser as any).logger = { warn: jest.fn(), error: jest.fn() };
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parseFile', () => {
    it('should throw BadRequestException if data is empty', async () => {
      await expect(parser.parseFile('', { userId: 1 })).rejects.toThrow(
        'Missing file content',
      );
    });

    it('should parse BNL TXT format correctly', async () => {
      // Sample BNL TXT content
      const sampleData = `
        1 01/02/2023 03/02/2023 123 Some description  +100.50
        2 05/02/2023 07/02/2023 456 Another description  -50.25
      `;

      const result = await parser.parseFile(sampleData, {
        userId: 1,
        bankAccountId: 123,
      });

      expect(result).toHaveLength(2);

      // First transaction
      expect(result[0]).toMatchObject({
        description: 'Some description',
        amount: 100.5,
        type: 'income',
        executionDate: expect.any(Date),
        bankAccount: { id: 123 },
      });

      // Second transaction
      expect(result[1]).toMatchObject({
        description: 'Another description',
        amount: 50.25,
        type: 'expense',
        executionDate: expect.any(Date),
        bankAccount: { id: 123 },
      });
    });

    it('should skip lines that do not match the expected format', async () => {
      const sampleData = `
        Invalid line
        1 01/02/2023 03/02/2023 123 Some description  +100.50
        Another invalid line
        2 05/02/2023 07/02/2023 456 Another description  -50.25
      `;

      const result = await parser.parseFile(sampleData, { userId: 1 });

      expect(result).toHaveLength(2);
    });
  });
});
