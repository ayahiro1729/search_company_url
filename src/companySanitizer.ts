const FULL_WIDTH_ALPHANUMERIC = /[Ａ-Ｚａ-ｚ０-９]/g;
const FULL_WIDTH_SPACE = /\u3000/g;

export function sanitizeCompanyNameForQuery(name: string): string {
  return name
    .replace(FULL_WIDTH_SPACE, ' ')
    .replace(FULL_WIDTH_ALPHANUMERIC, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    );
}
