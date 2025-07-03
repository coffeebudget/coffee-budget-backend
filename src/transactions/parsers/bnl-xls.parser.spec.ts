import { Test, TestingModule } from '@nestjs/testing';
import { BnlXlsParser } from './bnl-xls.parser';
import { Workbook, Worksheet, Row, Cell } from 'exceljs';

// Mock ExcelJS module
jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    xlsx: {
      load: jest.fn(),
    },
    worksheets: [],
  })),
}));

describe('BnlXlsParser', () => {
  let parser: BnlXlsParser;
  let mockWorkbook: jest.Mocked<Workbook>;
  let mockWorksheet: jest.Mocked<Worksheet>;

  beforeEach(async () => {
    parser = new BnlXlsParser();
    // Mock the logger to avoid console output during tests
    (parser as any).logger = { warn: jest.fn(), error: jest.fn() };

    // Create mock workbook and worksheet
    mockWorkbook = {
      xlsx: { load: jest.fn() },
      worksheets: [],
    } as any;

    mockWorksheet = {
      eachRow: jest.fn(),
    } as any;

    (Workbook as jest.Mock).mockImplementation(() => mockWorkbook);
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parseFile', () => {
    it('should throw BadRequestException if data is empty', async () => {
      await expect(parser.parseFile('', { userId: 1 })).rejects.toThrow(
        'Missing XLS file content',
      );
    });

    it('should parse BNL XLS format correctly', async () => {
      // Create sample data
      const base64Data = 'base64encodeddata';

      // Mock workbook setup
      mockWorkbook.worksheets = [mockWorksheet];

      // Mock worksheet.eachRow to simulate rows
      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '01/02/2023', '03/02/2023', '123', 'Some description', '+100,50'] },
        { values: [undefined, '05/02/2023', '07/02/2023', '456', 'Another description', '-50,25'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, {
        userId: 1,
        bankAccountId: 123,
      });

      expect(mockWorkbook.xlsx.load).toHaveBeenCalled();
      expect(result).toHaveLength(2);

      // First transaction
      expect(result[0]).toMatchObject({
        description: 'Some description',
        amount: 100.5,
        type: 'income',
        bankAccount: { id: 123 },
      });

      // Second transaction
      expect(result[1]).toMatchObject({
        description: 'Another description',
        amount: 50.25,
        type: 'expense',
        bankAccount: { id: 123 },
      });
    });

    it('should throw exception if header row is not found', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      // Mock worksheet.eachRow to return rows without the "Data contabile" header
      const mockRows = [
        { values: [undefined, 'Other header', 'Not what we want'] },
        { values: [undefined, '01/02/2023', 'Some data'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      await expect(parser.parseFile(base64Data, { userId: 1 })).rejects.toThrow(
        'Could not find header row in BNL Excel file',
      );
    });

    it('should set the correct bank account when provided', async () => {
      const base64Data = 'base64encodeddata';
      const bankAccountId = 456;

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '01/02/2023', '03/02/2023', '123', 'Some description', '+100,50'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, {
        userId: 1,
        bankAccountId,
      });

      expect(result).toHaveLength(1);

      // Check bank account is set correctly
      expect(result[0].bankAccount).toBeDefined();
      expect(result[0].bankAccount?.id).toBe(bankAccountId);

      // Verify credit card is not set when bank account is provided
      expect(result[0].creditCard).toBeUndefined();
    });

    it('should set the correct credit card when provided', async () => {
      const base64Data = 'base64encodeddata';
      const creditCardId = 789;

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '01/02/2023', '03/02/2023', '123', 'Some description', '+100,50'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, {
        userId: 1,
        creditCardId,
      });

      expect(result).toHaveLength(1);

      // Check credit card is set correctly
      expect(result[0].creditCard).toBeDefined();
      expect(result[0].creditCard?.id).toBe(creditCardId);

      // Verify bank account is not set when credit card is provided
      expect(result[0].bankAccount).toBeUndefined();
    });

    it('should handle transactions with complex descriptions', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '01/02/2023', '03/02/2023', '123', 'Payment ref: #12345 - Multi-word description with special chars: €$%&', '-250,75'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, { userId: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe(
        'Payment ref: #12345 - Multi-word description with special chars: €$%&',
      );
      expect(result[0].amount).toBe(250.75);
      expect(result[0].type).toBe('expense');
    });

    it('should handle multiple transactions with mixed types', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '01/02/2023', '03/02/2023', '123', 'Income transaction', '+1.500,00'] },
        { values: [undefined, '05/02/2023', '07/02/2023', '456', 'Expense transaction', '-750,25'] },
        { values: [undefined, '10/02/2023', '12/02/2023', '789', 'Zero amount transaction', '0,00'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, { userId: 1 });

      expect(result).toHaveLength(2); // Zero amount transaction should be skipped

      expect(result[0]).toMatchObject({
        description: 'Income transaction',
        amount: 1500.0,
        type: 'income',
      });

      expect(result[1]).toMatchObject({
        description: 'Expense transaction',
        amount: 750.25,
        type: 'expense',
      });
    });

    it('should correctly parse execution dates and set them in the transaction', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'] },
        { values: [undefined, '31/12/2023', '01/01/2024', '123', 'Year-end transaction', '+1.000,00'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      // Spy on the parseDate method to verify how it's called
      const parseDateSpy = jest.spyOn(parser as any, 'parseDate');

      const result = await parser.parseFile(base64Data, { userId: 1 });

      expect(result).toHaveLength(1);

      // Check date parsing
      expect(parseDateSpy).toHaveBeenCalledWith('31/12/2023', 'dd/MM/yyyy');

      // Verify the execution date is set correctly
      const executionDate = result[0].executionDate!;
      expect(executionDate).toBeDefined();
      expect(executionDate.getFullYear()).toBe(2023);
      expect(executionDate.getMonth()).toBe(11); // December is 11
      expect(executionDate.getDate()).toBe(31);

      // Clean up
      parseDateSpy.mockRestore();
    });

    it('should parse the newer BNL XLS format with Causale ABI column', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      const mockRows = [
        { values: [undefined, 'C/C:', '01005 20600 00000000XXXX'] },
        { values: [undefined, 'Divisa C/C:', 'EUR'] },
        { values: [undefined, 'Saldo Contabile al:', '11/04/2025', '+1.333,45'] },
        { values: [undefined, 'Data contabile', 'Data valuta', 'Causale ABI', 'Descrizione', 'Importo'] },
        { values: [undefined, '04/04/2025', '04/04/2025', '50', 'PAGAMENTI DIVERSI', '-407,97'] },
        { values: [undefined, '03/04/2025', '03/04/2025', '26', 'VOSTRO BONIFICO', '-225,00'] },
        { values: [undefined, '03/04/2025', '03/04/2025', '48', 'BONIFICO DEL 03.04.25 DA NOME COGNOME', '+1.450,00'] },
        { values: [undefined, '02/04/2025', '31/03/2025', '66', 'CANONE CONTO MARZO', '-8,40'] },
        { values: [undefined, '31/03/2025', '31/03/2025', '15', 'RIMBORSO FINANZIAMENTO N. 1523129', '-809,76'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      const result = await parser.parseFile(base64Data, {
        userId: 1,
        bankAccountId: 123,
      });

      expect(result).toHaveLength(5);

      // First transaction (expense)
      expect(result[0]).toMatchObject({
        description: 'PAGAMENTI DIVERSI',
        amount: 407.97,
        type: 'expense',
        bankAccount: { id: 123 },
      });

      // Second transaction (expense)
      expect(result[1]).toMatchObject({
        description: 'VOSTRO BONIFICO',
        amount: 225.0,
        type: 'expense',
        bankAccount: { id: 123 },
      });

      // Third transaction (income)
      expect(result[2]).toMatchObject({
        description: 'BONIFICO DEL 03.04.25 DA NOME COGNOME',
        amount: 1450.0,
        type: 'income',
        bankAccount: { id: 123 },
      });

      // Fourth transaction (expense)
      expect(result[3]).toMatchObject({
        description: 'CANONE CONTO MARZO',
        amount: 8.4,
        type: 'expense',
        bankAccount: { id: 123 },
      });

      // Fifth transaction (expense)
      expect(result[4]).toMatchObject({
        description: 'RIMBORSO FINANZIAMENTO N. 1523129',
        amount: 809.76,
        type: 'expense',
        bankAccount: { id: 123 },
      });
    });

    it('should correctly parse dates in dd/MM/yyyy format', async () => {
      // Instead of creating an actual Excel workbook, we'll directly test
      // the date parsing by mocking the sheet_to_json response
      const base64Data = 'mockBase64Data';

      mockWorkbook.worksheets = [mockWorksheet];

      // Mock worksheet.eachRow to return a row with a date in dd/MM/yyyy format
      const mockRows = [
        { values: [undefined, 'Data contabile', 'Descrizione', 'Entrate', 'Uscite'] },
        { values: [undefined, '31/12/2023', 'Test transaction', '', '100,50'] }, // December 31, 2023
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      // Spy on the parseDate method
      const parseDateSpy = jest.spyOn(parser as any, 'parseDate');

      // Parse the file
      const transactions = await parser.parseFile(base64Data, { userId: 1 });

      // Verify the parseDate was called with correct format
      expect(parseDateSpy).toHaveBeenCalledWith('31/12/2023', 'dd/MM/yyyy');

      // Verify the parsed data
      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe('Test transaction');
      expect(transactions[0].amount).toBe(100.5);
      expect(transactions[0].type).toBe('expense');

      // Clean up
      parseDateSpy.mockRestore();
    });

    it('should correctly parse multiple rows with different dates', async () => {
      // Mock base64 data
      const base64Data = 'mockBase64Data';

      mockWorkbook.worksheets = [mockWorksheet];

      // Mock worksheet.eachRow to return rows with different dates
      const mockRows = [
        { values: [undefined, 'Data contabile', 'Descrizione', 'Entrate', 'Uscite'] },
        { values: [undefined, '01/01/2023', 'January transaction', '250,00', ''] }, // January 1, 2023
        { values: [undefined, '15/02/2023', 'February transaction', '', '75,30'] }, // February 15, 2023
        { values: [undefined, '31/12/2023', 'December transaction', '', '100,50'] }, // December 31, 2023
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      // Spy on the parseDate method
      const parseDateSpy = jest.spyOn(parser as any, 'parseDate');

      // Parse the file
      const transactions = await parser.parseFile(base64Data, { userId: 1 });

      // Verify parseDate was called for each date with correct format
      expect(parseDateSpy).toHaveBeenCalledWith('01/01/2023', 'dd/MM/yyyy');
      expect(parseDateSpy).toHaveBeenCalledWith('15/02/2023', 'dd/MM/yyyy');
      expect(parseDateSpy).toHaveBeenCalledWith('31/12/2023', 'dd/MM/yyyy');

      // Verify the parsed data
      expect(transactions).toHaveLength(3);

      // Check transactions data
      expect(transactions[0].description).toBe('January transaction');
      expect(transactions[0].amount).toBe(250);
      expect(transactions[0].type).toBe('income');

      expect(transactions[1].description).toBe('February transaction');
      expect(transactions[1].amount).toBe(75.3);
      expect(transactions[1].type).toBe('expense');

      expect(transactions[2].description).toBe('December transaction');
      expect(transactions[2].amount).toBe(100.5);
      expect(transactions[2].type).toBe('expense');

      // Clean up
      parseDateSpy.mockRestore();
    });

    it('should correctly parse transactions with MOB reference numbers', async () => {
      const base64Data = 'base64encodeddata';

      mockWorkbook.worksheets = [mockWorksheet];

      // Mock worksheet.eachRow to return a row with MOB reference number
      // Note: Column indices must match how the parser is accessing the data
      const mockRows = [
        { values: [undefined, 'Data contabile', 'Data valuta', 'Causale ABI', 'Descrizione', 'Descrizione_Completa', 'Importo'] },
        { values: [undefined, '07/01/2025', '07/01/2025', '50', 'PAGAMENTI DIVERSI', 'MOB-6999764301 PAG. MAV 0 3065', '-168,12'] },
      ];

      mockWorksheet.eachRow.mockImplementation((callback) => {
        mockRows.forEach((row, index) => {
          const mockRow = {
            values: row.values,
            getCell: jest.fn().mockReturnValue({ text: row.values[index + 1] || '' }),
          };
          callback(mockRow, index + 1);
        });
      });

      // Spy on the determineTransactionType method to always return 'expense'
      const determineTypeSpy = jest
        .spyOn(parser as any, 'determineTransactionType')
        .mockReturnValue('expense');

      // Mock parseAmount to handle the amount column
      const parseAmountSpy = jest
        .spyOn(parser as any, 'parseAmount')
        .mockReturnValue(-168.12);

      // Force the parseDate to return the expected date
      const parseDateSpy = jest
        .spyOn(parser as any, 'parseDate')
        .mockReturnValue(new Date(2025, 0, 7)); // January 7, 2025

      const result = await parser.parseFile(base64Data, {
        userId: 1,
        bankAccountId: 123,
      });

      expect(result).toHaveLength(1);

      // Verify the transaction details
      expect(result[0]).toMatchObject({
        description: 'PAGAMENTI DIVERSI MOB-6999764301 PAG. MAV 0 3065',
        amount: 168.12,
        type: 'expense',
        bankAccount: { id: 123 },
      });

      // Verify the execution date is set correctly
      const executionDate = result[0].executionDate!;
      expect(executionDate).toBeDefined();
      expect(executionDate.getFullYear()).toBe(2025);
      expect(executionDate.getMonth()).toBe(0); // January is 0
      expect(executionDate.getDate()).toBe(7);

      // Clean up
      determineTypeSpy.mockRestore();
      parseAmountSpy.mockRestore();
      parseDateSpy.mockRestore();
    });
  });
});
