import { BadRequestException } from '@nestjs/common';
import { BankFileParser } from './interfaces/bank-file-parser.interface';
import { BnlTxtParser } from './bnl-txt.parser';
import { BnlXlsParser } from './bnl-xls.parser';
import { WebankParser } from './webank.parser'; 
import { FinecoParser } from './fineco.parser';

export class BankFileParserFactory {
  static getParser(bankFormat: string): BankFileParser {
    switch (bankFormat) {
      case 'bnl_txt':
        return new BnlTxtParser();
      case 'bnl_xls':
        return new BnlXlsParser();
      case 'webank':
        return new WebankParser();
      case 'fineco':
        return new FinecoParser();
      default:
        throw new BadRequestException(`Unsupported bank format: ${bankFormat}`);
    }
  }
}
