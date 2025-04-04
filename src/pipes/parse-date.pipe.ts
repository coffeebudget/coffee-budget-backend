import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { parseDate } from '../utils/date-utils';

@Injectable()
export class ParseDatePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (!value) {
      return undefined;
    }

    try {
      return parseDate(value);
    } catch (error) {
      throw new BadRequestException(`Invalid date format: ${value}. Expected ISO date or another common format.`);
    }
  }
}