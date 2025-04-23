import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CartaImprontaParser } from './carta-impronta.parser';

describe('CartaImprontaParser', () => {
  let parser: CartaImprontaParser;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartaImprontaParser,
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    parser = moduleRef.get<CartaImprontaParser>(CartaImprontaParser);
    parser['logger'] = mockLogger;
  });

  describe('parseFile', () => {
    it('should parse a CartaImpronta HTML file', async () => {
      // Sample HTML content similar to the provided format
      const htmlContent = `
        <html>
        <body>
          <div class="OUTLetFac">
            <table id="CCMO_CAIM">
              <thead>
                <tr>
                  <th title="Data operazione">Data operazione</th>
                  <th title="Importo &euro;">Importo &euro;</th>
                  <th title="Importo Divisa">Importo Divisa</th>
                  <th title="Divisa">Divisa</th>
                  <th title="Descrizione">Descrizione</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="oLeft">04/03/2025</td>
                  <td class="importo oRight positivo oRight">19,54</td>
                  <td class="importo oRight positivo oRight">20,00</td>
                  <td class="oLeft">USD</td>
                  <td class="oLeft break-xs"> - CURSOR, AI POWERED IDE - CURSOR.COM - US</td>
                </tr>
                <tr>
                  <td class="oLeft">05/03/2025</td>
                  <td class="importo oRight positivo oRight">5,99</td>
                  <td class="importo oRight positivo oRight"></td>
                  <td class="oLeft">EUR</td>
                  <td class="oLeft break-xs"> - Amazon Music*R26BW06L4 - music.amazon. - ITA</td>
                </tr>
              </tbody>
            </table>
          </div>
        </body>
        </html>
      `;

      // Parse the HTML content
      const transactions = await parser.parseFile(htmlContent, { userId: 1, creditCardId: 123 });

      // Expectations
      expect(transactions).toHaveLength(2);
      
      // Check first transaction
      expect(transactions[0]).toEqual(
        expect.objectContaining({
          description: ' - CURSOR, AI POWERED IDE - CURSOR.COM - US',
          amount: -19.54,
          type: 'expense',
          creditCard: { id: 123 },
        })
      );

      // Check date parsing
      const date = transactions[0].executionDate as Date;
      expect(date.getDate()).toBe(4);
      expect(date.getMonth()).toBe(2); // March is 2 (0-indexed)
      expect(date.getFullYear()).toBe(2025);
      
      // Check second transaction
      expect(transactions[1]).toEqual(
        expect.objectContaining({
          description: ' - Amazon Music*R26BW06L4 - music.amazon. - ITA',
          amount: -5.99,
          type: 'expense',
        })
      );
    });

    it('should handle empty data', async () => {
      await expect(parser.parseFile('', { userId: 1 })).rejects.toThrow('Missing CartaImpronta HTML content');
    });

    it('should handle invalid HTML data', async () => {
      await expect(parser.parseFile('<div>No table here</div>', { userId: 1 })).rejects.toThrow('Invalid CartaImpronta HTML format');
    });
  });
}); 