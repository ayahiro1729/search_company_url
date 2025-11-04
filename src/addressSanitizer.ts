export function sanitizeAddressForQuery(address: string): string {
  const normalized = address
    .normalize('NFKC')
    .replace(/["'“”‘’「」『』【】]/g, ' ')
    .replace(/([0-9]+)丁目/g, '$1-')
    .replace(/([0-9]+)番地?/g, '$1-')
    .replace(/([0-9]+)号/g, '$1-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/g, '')
    .trim();

  return normalized;
}
