import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { parse, isValid } from 'date-fns';

@Injectable()
export class ParseDatePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (!value) {
      return undefined;
    }

    // Try to parse as ISO date string
    const date = new Date(value);
    if (isValid(date)) {
      return date;
    }

    // Try to parse as yyyy-MM-dd format
    const parsedDate = parse(value, 'yyyy-MM-dd', new Date());
    if (isValid(parsedDate)) {
      return parsedDate;
    }

    throw new BadRequestException(`Invalid date format: ${value}. Expected ISO date or yyyy-MM-dd format.`);
  }
}