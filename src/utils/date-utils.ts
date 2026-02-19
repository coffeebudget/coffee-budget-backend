import { parse, isValid, format } from 'date-fns';
import { BadRequestException } from '@nestjs/common';
import { Logger } from '@nestjs/common';

// Create a logger for date-utils
const logger = new Logger('DateUtils');

/**
 * Parse a date string using the specified format or try common formats
 * @param dateString The date string to parse
 * @param dateFormat The primary format to use for parsing
 * @param fallbackDate The date to return if parsing fails
 * @returns The parsed date or the fallback date
 */
export function parseDate(
  dateString: string,
  dateFormat: string = 'yyyy-MM-dd',
  fallbackDate?: Date,
): Date {
  if (!dateString) {
    if (fallbackDate) return fallbackDate;
    throw new BadRequestException('Date string is required');
  }

  // Add debug logging (NestJS Logger will filter this based on config)
  logger.debug(
    `Attempting to parse date: "${dateString}" with format: "${dateFormat}"`,
  );

  // For dd/MM/yyyy format (European format), handle it specially to avoid timezone issues
  if (
    dateFormat === 'dd/MM/yyyy' &&
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)
  ) {
    try {
      // Split the date string into day, month, and year
      const [day, month, year] = dateString
        .split('/')
        .map((part) => parseInt(part, 10));

      // Create a Date object with the local timezone (months are 0-indexed in JS Date)
      const result = new Date(year, month - 1, day, 12, 0, 0);

      if (isValid(result) && !isNaN(result.getTime())) {
        logger.debug(
          `Successfully parsed European date: ${result.toISOString()} (day: ${result.getDate()}, month: ${result.getMonth() + 1})`,
        );
        return result;
      }
    } catch (error) {
      logger.debug(`Failed to parse European date: ${error.message}`);
    }
  }

  // Try to parse as ISO date first
  const isoDate = new Date(dateString);
  if (isValid(isoDate) && !isNaN(isoDate.getTime())) {
    logger.debug(`Successfully parsed as ISO date: ${isoDate.toISOString()}`);
    return isoDate;
  }

  // Try to parse with the specified format
  try {
    const parsedDate = parse(dateString, dateFormat, new Date());
    if (isValid(parsedDate) && !isNaN(parsedDate.getTime())) {
      // For timezone safety, recreate the date with just the year, month, and day components
      const localDate = new Date(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate(),
        12,
        0,
        0, // Use noon to avoid any timezone issues
      );

      logger.debug(
        `Successfully parsed with specified format: ${localDate.toISOString()}`,
      );
      return localDate;
    }
  } catch (error) {
    logger.debug(`Failed to parse with format ${dateFormat}: ${error.message}`);
    // Continue to other formats if this fails
  }

  // Try common formats
  const commonFormats = [
    'dd/MM/yyyy', // European format
    'MM/dd/yyyy', // US format
    'yyyy-MM-dd', // ISO-like
    'dd-MM-yyyy', // European with dashes
    'MM-dd-yyyy', // US with dashes
    'dd.MM.yyyy', // European with dots
    'MM.dd.yyyy', // US with dots
    'yyyyMMdd', // Compact
  ];

  for (const format of commonFormats) {
    if (format === dateFormat) continue; // Skip if it's the same as the specified format

    try {
      const parsedDate = parse(dateString, format, new Date());
      if (isValid(parsedDate) && !isNaN(parsedDate.getTime())) {
        // For timezone safety, recreate the date with just the year, month, and day components
        const localDate = new Date(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate(),
          12,
          0,
          0, // Use noon to avoid any timezone issues
        );

        logger.debug(
          `Successfully parsed with format ${format}: ${localDate.toISOString()}`,
        );
        return localDate;
      }
    } catch (error) {
      logger.debug(`Failed to parse with format ${format}: ${error.message}`);
      // Try the next format
    }
  }

  // If we have a fallback date, return it
  if (fallbackDate) {
    logger.debug(`Using fallback date: ${fallbackDate.toISOString()}`);
    return fallbackDate;
  }

  // If all parsing attempts fail, throw an error
  logger.error(`Failed to parse date: ${dateString}`);
  throw new BadRequestException(
    `Invalid date format: ${dateString}. Expected format: ${dateFormat} or another common format.`,
  );
}

