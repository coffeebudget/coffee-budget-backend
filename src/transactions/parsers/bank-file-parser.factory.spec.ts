import { Test, TestingModule } from '@nestjs/testing';
import { BankFileParserFactory } from './bank-file-parser.factory';
import { BnlTxtParser } from './bnl-txt.parser';
import { BnlXlsParser } from './bnl-xls.parser';
import { WebankParser } from './webank.parser';
import { FinecoParser } from './fineco.parser';
import { BadRequestException } from '@nestjs/common';

describe('BankFileParserFactory', () => {
  it('should return BnlTxtParser for bnl_txt format', () => {
    const parser = BankFileParserFactory.getParser('bnl_txt');
    expect(parser).toBeInstanceOf(BnlTxtParser);
  });

  it('should return BnlXlsParser for bnl_xls format', () => {
    const parser = BankFileParserFactory.getParser('bnl_xls');
    expect(parser).toBeInstanceOf(BnlXlsParser);
  });

  it('should return WebankParser for webank format', () => {
    const parser = BankFileParserFactory.getParser('webank');
    expect(parser).toBeInstanceOf(WebankParser);
  });

  it('should return FinecoParser for fineco format', () => {
    const parser = BankFileParserFactory.getParser('fineco');
    expect(parser).toBeInstanceOf(FinecoParser);
  });

  it('should throw BadRequestException for unknown format', () => {
    expect(() => BankFileParserFactory.getParser('unknown_format'))
      .toThrow(BadRequestException);
    expect(() => BankFileParserFactory.getParser('unknown_format'))
      .toThrow('Unsupported bank format: unknown_format');
  });
});
