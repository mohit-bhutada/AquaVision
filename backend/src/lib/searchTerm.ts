/**
 * Sanitizes user search input before it is interpolated into a PostgREST `.or()` filter
 * string or an ILIKE pattern. Strips PostgREST filter-syntax characters (commas, parentheses,
 * quotes, backslashes) so input cannot inject extra filter clauses, and escapes LIKE wildcards.
 */
export function escapeSearchTerm(input: string): string {
  return input
    .trim()
    .slice(0, 100)
    .replace(/[,()"'\\]/g, ' ')
    .replace(/[%_*]/g, (c) => `\\${c}`)
    .trim();
}
