import { parse, isValid, format } from 'date-fns';
import { BadRequestException } from '@nestjs/common';

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
  fallbackDate?: Date
): Date {
  if (!dateString) {
    if (fallbackDate) return fallbackDate;
    throw new BadRequestException('Date string is required');
  }

  // Try to parse as ISO date first
  const isoDate = new Date(dateString);
  if (isValid(isoDate) && !isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try to parse with the specified format
  try {
    const parsedDate = parse(dateString, dateFormat, new Date());
    if (isValid(parsedDate) && !isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  } catch (error) {
    // Continue to other formats if this fails
  }

  // Try common formats
  const commonFormats = [
    'dd/MM/yyyy',  // European format
    'MM/dd/yyyy',  // US format
    'yyyy-MM-dd',  // ISO-like
    'dd-MM-yyyy',  // European with dashes
    'MM-dd-yyyy',  // US with dashes
    'dd.MM.yyyy',  // European with dots
    'MM.dd.yyyy',  // US with dots
    'yyyyMMdd',    // Compact
  ];
  
  for (const format of commonFormats) {
    if (format === dateFormat) continue; // Skip if it's the same as the specified format
    
    try {
      const parsedDate = parse(dateString, format, new Date());
      if (isValid(parsedDate) && !isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    } catch (error) {
      // Try the next format
    }
  }

  // If we have a fallback date, return it
  if (fallbackDate) {
    return fallbackDate;
  }

  // If all parsing attempts fail, throw an error
  throw new BadRequestException(
    `Invalid date format: ${dateString}. Expected format: ${dateFormat} or another common format.`
  );
}

/**
 * Format a date to a string using the specified format
 * @param date The date to format
 * @param dateFormat The format to use (default: 'yyyy-MM-dd')
 * @returns The formatted date string
 */
export function formatDate(date: Date, dateFormat: string = 'yyyy-MM-dd'): string {
  return format(date, dateFormat);
}

/**
 * Check if a string is a valid date in any common format
 * @param dateString The date string to check
 * @returns True if the string is a valid date, false otherwise
 */
export function isValidDateString(dateString: string): boolean {
  try {
    parseDate(dateString);
    return true;
  } catch (error) {
    return false;
  }
}
