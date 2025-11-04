import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? 'test-google-key';
process.env.GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? 'test-cse-id';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-gemini-key';

const listMock = vi.fn();

vi.mock('@googleapis/customsearch', () => ({
  customsearch_v1: {
    Customsearch: vi.fn(() => ({
      cse: {
        list: listMock
      }
    }))
  }
}));

const { searchCompanyWebsites } = await import('../src/googleSearch.js');

describe('searchCompanyWebsites', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({ data: { items: [] } });
  });

  it('removes quoting characters from address when building query', async () => {
    const company = {
      name: 'VIVID株式会社',
      address: '"愛知県名古屋市中区錦1丁目17番13号2F"'
    };

    await searchCompanyWebsites(company);

    expect(listMock).toHaveBeenCalledTimes(1);

    const { q } = listMock.mock.calls[0][0];
    expect(q).toContain('VIVID株式会社 会社概要 愛知県名古屋市中区錦1丁目17番13号2F');
    expect(q).not.toContain('"');
    expect(q).not.toMatch(/[“”‘’「」『』【】]/);
  });
});
