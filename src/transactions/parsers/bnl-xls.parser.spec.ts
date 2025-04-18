import { Test, TestingModule } from '@nestjs/testing';
import { BnlXlsParser } from './bnl-xls.parser';
import * as xlsx from 'xlsx';

// Mock xlsx module
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn()
  }
}));

describe('BnlXlsParser', () => {
  let parser: BnlXlsParser;

  beforeEach(async () => {
    parser = new BnlXlsParser();
    // Mock the logger to avoid console output during tests
    (parser as any).logger = { warn: jest.fn(), error: jest.fn() };
  });

  it('should be defined', () => {
    expect(parser).toBeDefined();
  });

  describe('parseFile', () => {
    it('should throw BadRequestException if data is empty', async () => {
      await expect(parser.parseFile('', { userId: 1 }))
        .rejects.toThrow('Missing XLS file content');
    });

    it('should parse BNL XLS format correctly', async () => {
      // Create sample data
      const base64Data = 'base64encodeddata';
      
      // Mock xlsx responses
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      });

      // Mock sheet_to_json to return rows
      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['01/02/2023', '03/02/2023', '123', 'Some description', '+100,50'],
        ['05/02/2023', '07/02/2023', '456', 'Another description', '-50,25']
      ]);

      const result = await parser.parseFile(base64Data, { 
        userId: 1,
        bankAccountId: 123
      });

      expect(xlsx.read).toHaveBeenCalled();
      expect(xlsx.utils.sheet_to_json).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      
      // First transaction
      expect(result[0]).toMatchObject({
        description: 'Some description',
        amount: 100.50,
        type: 'income',
        bankAccount: { id: 123 }
      });

      // Second transaction
      expect(result[1]).toMatchObject({
        description: 'Another description',
        amount: 50.25,
        type: 'expense',
        bankAccount: { id: 123 }
      });
    });

    it('should throw exception if header row is not found', async () => {
      const base64Data = 'base64encodeddata';
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      });

      // Mock sheet_to_json to return rows without the "Data contabile" header
      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Other header', 'Not what we want'],
        ['01/02/2023', 'Some data']
      ]);

      await expect(parser.parseFile(base64Data, { userId: 1 }))
        .rejects.toThrow('Could not find header row in BNL Excel file');
    });

    it('should set the correct bank account when provided', async () => {
      const base64Data = 'base64encodeddata';
      const bankAccountId = 456;
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });

      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['01/02/2023', '03/02/2023', '123', 'Some description', '+100,50']
      ]);

      const result = await parser.parseFile(base64Data, { 
        userId: 1,
        bankAccountId
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
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });

      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['01/02/2023', '03/02/2023', '123', 'Some description', '+100,50']
      ]);

      const result = await parser.parseFile(base64Data, { 
        userId: 1,
        creditCardId
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
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });

      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['01/02/2023', '03/02/2023', '123', 'Payment ref: #12345 - Multi-word description with special chars: €$%&', '-250,75']
      ]);

      const result = await parser.parseFile(base64Data, { userId: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Payment ref: #12345 - Multi-word description with special chars: €$%&');
      expect(result[0].amount).toBe(250.75);
      expect(result[0].type).toBe('expense');
    });

    it('should handle multiple transactions with mixed types', async () => {
      const base64Data = 'base64encodeddata';
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });

      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['01/02/2023', '03/02/2023', '123', 'Income transaction', '+1.500,00'],
        ['05/02/2023', '07/02/2023', '456', 'Expense transaction', '-750,25'],
        ['10/02/2023', '12/02/2023', '789', 'Zero amount transaction', '0,00']
      ]);

      const result = await parser.parseFile(base64Data, { userId: 1 });

      // Zero amount transactions are skipped in our implementation
      expect(result).toHaveLength(2);
      
      // First transaction (income)
      expect(result[0].description).toBe('Income transaction');
      expect(result[0].amount).toBe(1500);
      expect(result[0].type).toBe('income');
      
      // Second transaction (expense)
      expect(result[1].description).toBe('Expense transaction');
      expect(result[1].amount).toBe(750.25);
      expect(result[1].type).toBe('expense');
      
      // Zero amount transactions are skipped
    });

    it('should correctly parse execution dates and set them in the transaction', async () => {
      const base64Data = 'base64encodeddata';
      
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} }
      });

      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['Data contabile', 'Data valuta', 'Codice', 'Descrizione', 'Importo'],
        ['31/12/2023', '01/01/2024', '123', 'Year-end transaction', '+1.000,00']
      ]);

      // Spy on the parseDate method to verify how it's called
      const parseDateSpy = jest.spyOn(parser as any, 'parseDate');

      const result = await parser.parseFile(base64Data, { userId: 1 });

      expect(result).toHaveLength(1);
      
      // Check date parsing
      expect(parseDateSpy).toHaveBeenCalledWith('31/12/2023', 'dd/MM/yyyy');
      
      // Verify the execution date is set correctly (assuming the parseDate method works as expected)
      expect(result[0].executionDate).toBeDefined();
      
      // Clean up
      parseDateSpy.mockRestore();
    });

    it('should parse the newer BNL XLS format with Causale ABI column', async () => {
      const base64Data = 'base64encodeddata';
      
      // Mock xlsx responses
      (xlsx.read as jest.Mock).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {}
        }
      });

      // Mock sheet_to_json to return rows matching the screenshot format
      (xlsx.utils.sheet_to_json as jest.Mock).mockReturnValue([
        ['C/C:', '01005 20600 00000000XXXX'],
        ['Divisa C/C:', 'EUR'],
        ['Saldo Contabile al:', '11/04/2025', '+1.333,45'],
        [],
        ['Data contabile', 'Data valuta', 'Causale ABI', 'Descrizione', 'Importo'],
        ['04/04/2025', '04/04/2025', '50', 'PAGAMENTI DIVERSI', '-407,97'],
        ['03/04/2025', '03/04/2025', '26', 'VOSTRO BONIFICO', '-225,00'],
        ['03/04/2025', '03/04/2025', '48', 'BONIFICO DEL 03.04.25 DA NOME COGNOME', '+1.450,00'],
        ['02/04/2025', '31/03/2025', '66', 'CANONE CONTO MARZO', '-8,40'],
        ['31/03/2025', '31/03/2025', '15', 'RIMBORSO FINANZIAMENTO N. 1523129', '-809,76']
      ]);

      const result = await parser.parseFile(base64Data, { 
        userId: 1,
        bankAccountId: 123
      });

      expect(xlsx.read).toHaveBeenCalled();
      expect(xlsx.utils.sheet_to_json).toHaveBeenCalled();
      // We expect 5 transactions from the 5 transaction rows
      expect(result).toHaveLength(5);
      
      // First transaction (expense)
      expect(result[0]).toMatchObject({
        description: 'PAGAMENTI DIVERSI',
        amount: 407.97,
        type: 'expense',
        bankAccount: { id: 123 }
      });

      // Second transaction (expense)
      expect(result[1]).toMatchObject({
        description: 'VOSTRO BONIFICO',
        amount: 225.00,
        type: 'expense',
        bankAccount: { id: 123 }
      });
      
      // Third transaction (income)
      expect(result[2]).toMatchObject({
        description: 'BONIFICO DEL 03.04.25 DA NOME COGNOME',
        amount: 1450.00,
        type: 'income',
        bankAccount: { id: 123 }
      });
      
      // Fourth transaction (expense)
      expect(result[3]).toMatchObject({
        description: 'CANONE CONTO MARZO',
        amount: 8.40,
        type: 'expense',
        bankAccount: { id: 123 }
      });
      
      // Fifth transaction (expense)
      expect(result[4]).toMatchObject({
        description: 'RIMBORSO FINANZIAMENTO N. 1523129',
        amount: 809.76,
        type: 'expense',
        bankAccount: { id: 123 }
      });
    });
  });
});
