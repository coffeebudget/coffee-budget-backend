import { Test, TestingModule } from '@nestjs/testing';
import { FinecoParser } from './fineco.parser';
import { Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';

// Mock ExcelJS
jest.mock('exceljs', () => {
  const mockWorkbook = {
    xlsx: {
      load: jest.fn().mockResolvedValue(true),
    },
    worksheets: [
      {
        eachRow: jest.fn(),
      },
    ],
  };

  return {
    Workbook: jest.fn().mockImplementation(() => mockWorkbook),
  };
});

describe('FinecoParser', () => {
  let parser: FinecoParser;

  beforeEach(async () => {
    // Direct instantiation without TagsService since we're no longer using it
    parser = new FinecoParser();
    // Mock the logger to avoid console output during tests
    (parser as any).logger = { warn: jest.fn(), error: jest.fn() };
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parseFile', () => {
    it('should throw BadRequestException if data is empty', async () => {
      await expect(parser.parseFile('', { userId: 1 })).rejects.toThrow(
        'Missing XLS content',
      );
    });

    it('should parse Fineco XLS format and create tags from Moneymap values', async () => {
      // Mock the eachRow function to simulate Excel rows
      const mockHeaders = [
        '',
        'Data',
        'Entrate',
        'Uscite',
        'Descrizione_Completa',
        'Descrizione',
        'Moneymap',
      ];

      // Mock row implementations for headers and data
      const mockRows = [
        {
          values: mockHeaders,
          getCell: jest.fn(),
        },
        {
          values: [
            '',
            '01/02/2023',
            '100,50',
            '',
            'Salary payment',
            'Salary',
            'Income:Salary',
          ],
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '01/02/2023'
                : colIndex === 2
                  ? '100,50'
                  : colIndex === 4
                    ? 'Salary payment'
                    : colIndex === 5
                      ? 'Salary'
                      : colIndex === 6
                        ? 'Income:Salary'
                        : '',
          })),
        },
        {
          values: [
            '',
            '05/02/2023',
            '',
            '50,25',
            'Supermarket purchase',
            'Food',
            'Expenses:Groceries',
          ],
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '05/02/2023'
                : colIndex === 3
                  ? '50,25'
                  : colIndex === 4
                    ? 'Supermarket purchase'
                    : colIndex === 5
                      ? 'Food'
                      : colIndex === 6
                        ? 'Expenses:Groceries'
                        : '',
          })),
        },
      ];

      // Set up the eachRow mock
      const mockEachRow = jest.fn((callback) => {
        mockRows.forEach((row, index) => {
          callback(row, index + 1);
        });
      });

      // Apply our mock
      const mockWorkbook = new Workbook();
      mockWorkbook.worksheets[0].eachRow = mockEachRow;

      // Execute the parser
      const result = await parser.parseFile('base64content', {
        userId: 1,
        bankAccountId: 123,
      });

      // Verify results
      expect(result).toHaveLength(2);

      // First transaction (income)
      expect(result[0]).toMatchObject({
        description:
          expect.stringContaining('Salary payment') &&
          expect.stringContaining('[Tag: Salary]'),
        amount: 100.5,
        type: 'income',
        executionDate: expect.any(Date),
        bankAccount: { id: 123 },
      });

      // Check that tagNames were set correctly for later processing
      expect((result[0] as any).tagNames).toBeDefined();
      expect((result[0] as any).tagNames).toEqual(['Income', 'Salary']);

      // Second transaction (expense)
      expect(result[1]).toMatchObject({
        description:
          expect.stringContaining('Supermarket purchase') &&
          expect.stringContaining('[Tag: Food]'),
        amount: 50.25,
        type: 'expense',
        executionDate: expect.any(Date),
        bankAccount: { id: 123 },
      });

      // Check that tagNames were set correctly for later processing
      expect((result[1] as any).tagNames).toBeDefined();
      expect((result[1] as any).tagNames).toEqual(['Expenses', 'Groceries']);
    });

    it('should handle rows with missing values', async () => {
      // Mock the eachRow function to simulate Excel rows with missing data
      const mockHeaders = [
        '',
        'Data',
        'Entrate',
        'Uscite',
        'Descrizione_Completa',
        'Descrizione',
        'Moneymap',
      ];

      // Mock row implementations for headers and data with some missing values
      const mockRows = [
        {
          values: mockHeaders,
          getCell: jest.fn(),
        },
        {
          values: [
            '',
            '01/02/2023',
            '',
            '25,30',
            'Payment without tags',
            '',
            '',
          ],
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '01/02/2023'
                : colIndex === 3
                  ? '25,30'
                  : colIndex === 4
                    ? 'Payment without tags'
                    : '',
          })),
        },
      ];

      // Set up the eachRow mock
      const mockEachRow = jest.fn((callback) => {
        mockRows.forEach((row, index) => {
          callback(row, index + 1);
        });
      });

      // Apply our mock
      const mockWorkbook = new Workbook();
      mockWorkbook.worksheets[0].eachRow = mockEachRow;

      // Execute the parser
      const result = await parser.parseFile('base64content', {
        userId: 1,
        bankAccountId: 123,
      });

      // Verify result
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Payment without tags');
      expect(result[0].amount).toBe(25.3);
      expect(result[0].type).toBe('expense');
      expect((result[0] as any).tagNames).toBeUndefined(); // No tagNames should be set
    });

    it('should correctly parse the Fineco account statement format and create tags', async () => {
      // Mock headers and metadata rows matching the screenshot format
      const mockRows = [
        {
          values: ['', 'Conto Corrente: 1234567'],
          getCell: jest.fn(),
        },
        {
          values: ['', 'Intestazione Conto Corrente: NOME COGNOME'],
          getCell: jest.fn(),
        },
        {
          values: ['', 'Periodo Dal: 25/12/2024 Al: 25/03/2025'],
          getCell: jest.fn(),
        },
        {
          values: ['', 'Risultati Ricerca'],
          getCell: jest.fn(),
        },
        {
          values: [
            '',
            'Data',
            'Entrate',
            'Uscite',
            'Descrizione',
            'Descrizione_Completa',
            'Stato',
            'Moneymap',
          ],
          getCell: jest.fn(),
        },
        // Transaction rows matching the screenshot format with anonymized data
        {
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '11/03/2025'
                : colIndex === 2
                  ? '200'
                  : colIndex === 4
                    ? 'Giroconto'
                    : colIndex === 5
                      ? 'Giroconto dal cc n. 1234567 / 01 saldo negativo'
                      : colIndex === 6
                        ? 'Contabilizzato'
                        : colIndex === 7
                          ? 'Altre Entrate'
                          : '',
          })),
        },
        {
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '11/03/2025'
                : colIndex === 3
                  ? '63,66'
                  : colIndex === 4
                    ? 'SEPA Direct Debit'
                    : colIndex === 5
                      ? 'TELECOM SPA Addebito SDD fattura a Vs carico da IT12345678901'
                      : colIndex === 6
                        ? 'Contabilizzato'
                        : colIndex === 7
                          ? 'Internet Telefono e Tecnologia'
                          : '',
          })),
        },
        {
          getCell: jest.fn((colIndex) => ({
            text:
              colIndex === 1
                ? '05/03/2025'
                : colIndex === 3
                  ? '1,75'
                  : colIndex === 4
                    ? 'Canone Mensile Conto'
                    : colIndex === 5
                      ? 'Canone Mensile Conto Febbraio 2025'
                      : colIndex === 6
                        ? 'Contabilizzato'
                        : colIndex === 7
                          ? 'Altre spese'
                          : '',
          })),
        },
      ];

      // Set up the eachRow mock
      const mockEachRow = jest.fn((callback) => {
        mockRows.forEach((row, index) => {
          callback(row, index + 1);
        });
      });

      // Apply our mock
      const mockWorkbook = new Workbook();
      mockWorkbook.worksheets[0].eachRow = mockEachRow;

      // Mock parseDate to return expected dates
      jest
        .spyOn(parser as any, 'parseDate')
        .mockImplementation((dateStr: string) => {
          return new Date(dateStr.split('/').reverse().join('-'));
        });

      // Execute the parser
      const result = await parser.parseFile('base64content', {
        userId: 1,
        bankAccountId: 123,
      });

      // Verify results
      expect(result).toHaveLength(3);

      // First transaction (income)
      expect(result[0]).toMatchObject({
        description:
          expect.stringContaining(
            'Giroconto dal cc n. 1234567 / 01 saldo negativo',
          ) && expect.stringContaining('[Tag: Giroconto]'),
        amount: 200,
        type: 'income',
      });

      // Check that tagNames were set correctly for later processing
      expect((result[0] as any).tagNames).toBeDefined();
      expect((result[0] as any).tagNames).toEqual(['Altre Entrate']);

      // Second transaction (expense) - with Internet Telefono e Tecnologia tags
      expect(result[1]).toMatchObject({
        description:
          expect.stringContaining(
            'TELECOM SPA Addebito SDD fattura a Vs carico da IT12345678901',
          ) && expect.stringContaining('[Tag: SEPA Direct Debit]'),
        amount: 63.66,
        type: 'expense',
      });

      // Check that tagNames were set correctly for later processing
      expect((result[1] as any).tagNames).toBeDefined();
      expect((result[1] as any).tagNames).toEqual([
        'Internet Telefono e Tecnologia',
      ]);

      // Third transaction (expense) - with Altre spese tag
      expect(result[2]).toMatchObject({
        description:
          expect.stringContaining('Canone Mensile Conto Febbraio 2025') &&
          expect.stringContaining('[Tag: Canone Mensile Conto]'),
        amount: 1.75,
        type: 'expense',
      });

      // Check that tagNames were set correctly for later processing
      expect((result[2] as any).tagNames).toBeDefined();
      expect((result[2] as any).tagNames).toEqual(['Altre spese']);
    });

    it('should not include headers row in the transactions', async () => {
      // Mock the eachRow function where only headers are present
      const mockHeaders = [
        '',
        'Data',
        'Entrate',
        'Uscite',
        'Descrizione_Completa',
        'Descrizione',
        'Moneymap',
      ];

      const mockRows = [
        {
          values: mockHeaders,
          getCell: jest.fn(),
        },
      ];

      // Set up the eachRow mock
      const mockEachRow = jest.fn((callback) => {
        mockRows.forEach((row, index) => {
          callback(row, index + 1);
        });
      });

      // Apply our mock
      const mockWorkbook = new Workbook();
      mockWorkbook.worksheets[0].eachRow = mockEachRow;

      // Execute the parser
      const result = await parser.parseFile('base64content', { userId: 1 });

      // Verify that no transactions were parsed from just the header
      expect(result).toHaveLength(0);
    });
  });
});
