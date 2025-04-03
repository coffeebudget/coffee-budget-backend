/**
 * Parses a date string according to the specified format
 * @param dateStr The date string to parse
 * @param format The expected format (e.g., 'YYYY-MM-DD')
 * @param defaultDate The default date to return if parsing fails
 * @returns A Date object
 */
export function parseDate(dateStr: string, format: string, defaultDate: Date = new Date()): Date {
  if (!dateStr) return defaultDate;
  
  try {
    // Simple implementation for common formats
    if (format === 'YYYY-MM-DD') {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    } else if (format === 'MM/DD/YYYY') {
      const [month, day, year] = dateStr.split('/').map(Number);
      return new Date(year, month - 1, day);
    } else if (format === 'DD/MM/YYYY') {
      const [day, month, year] = dateStr.split('/').map(Number);
      return new Date(year, month - 1, day);
    } else {
      // For other formats, try standard Date parsing
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }
      return date;
    }
  } catch (error) {
    throw new Error(`Failed to parse date: ${dateStr} with format ${format}`);
  }
}
