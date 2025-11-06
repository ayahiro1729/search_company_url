import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';

import type { CompanyInfo, ScoredUrl } from '../src/types.js';

process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? 'test-google-key';
process.env.GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? 'test-cse-id';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-gemini-key';
process.env.BRAVE_API_KEY = process.env.BRAVE_API_KEY ?? 'test-brave-key';

const fetchMock = vi.fn();

vi.mock('../src/googleSearch.js', () => ({
  searchCompanyWebsites: vi.fn()
}));

vi.mock('../src/braveSearch.js', () => ({
  searchCompanyWebsites: vi.fn()
}));

vi.mock('../src/geminiScorer.js', () => ({
  scoreCandidateUrls: vi.fn()
}));

const { searchCompanyWebsites: googleSearchCompanyWebsites } = await import('../src/googleSearch.js');
const { searchCompanyWebsites: braveSearchCompanyWebsites } = await import('../src/braveSearch.js');
const { scoreCandidateUrls } = await import('../src/geminiScorer.js');
const { findBestCompanyUrl } = await import('../src/index.js');

describe('findBestCompanyUrl', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'Sample content mentioning Acme Corp and address 123 Street'
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    (googleSearchCompanyWebsites as MockedFunction<
      typeof googleSearchCompanyWebsites
    >).mockReset();
    (braveSearchCompanyWebsites as MockedFunction<
      typeof braveSearchCompanyWebsites
    >).mockReset();
    (scoreCandidateUrls as MockedFunction<typeof scoreCandidateUrls>).mockReset();
  });

  it('returns the highest scoring URL', async () => {
    const company: CompanyInfo = { name: 'Acme Corp', address: '123 Street' };

    (googleSearchCompanyWebsites as MockedFunction<
      typeof googleSearchCompanyWebsites
    >).mockResolvedValue([
      { title: 'Acme Corp - Official', url: 'https://www.acme.com', snippet: 'Official website for Acme Corp' },
      { title: 'Acme Partners', url: 'https://partners.acme.com', snippet: 'Partners portal' }
    ]);

    const scores: ScoredUrl[] = [
      { url: 'https://www.acme.com', score: 0.9, reason: 'Official domain' },
      { url: 'https://partners.acme.com', score: 0.6, reason: 'Partner portal' }
    ];

    (scoreCandidateUrls as MockedFunction<typeof scoreCandidateUrls>).mockResolvedValue(scores);

    const result = await findBestCompanyUrl(company);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ...scores[0], url: 'https://www.acme.com/' });
  });

  it('normalizes the best URL to the domain when Gemini returns a path', async () => {
    const company: CompanyInfo = { name: 'Acme Corp', address: '123 Street' };

    (googleSearchCompanyWebsites as MockedFunction<
      typeof googleSearchCompanyWebsites
    >).mockResolvedValue([
      { title: 'Acme Corp - Official', url: 'https://www.acme.com/company', snippet: 'Official website for Acme Corp' }
    ]);

    const scores: ScoredUrl[] = [
      { url: 'https://www.acme.com/company', score: 0.95, reason: 'Likely official page' }
    ];

    (scoreCandidateUrls as MockedFunction<typeof scoreCandidateUrls>).mockResolvedValue(scores);

    const result = await findBestCompanyUrl(company);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ...scores[0], url: 'https://www.acme.com/' });
  });

  it('returns undefined when there are no search results', async () => {
    const company: CompanyInfo = { name: 'Unknown Inc' };
    (googleSearchCompanyWebsites as MockedFunction<
      typeof googleSearchCompanyWebsites
    >).mockResolvedValue([]);

    const result = await findBestCompanyUrl(company);

    expect(result).toBeUndefined();
    expect(scoreCandidateUrls).not.toHaveBeenCalled();
  });

  it('falls back to Brave search when Google scores are low', async () => {
    const company: CompanyInfo = { name: 'Fallback Corp' };

    (googleSearchCompanyWebsites as MockedFunction<
      typeof googleSearchCompanyWebsites
    >).mockResolvedValue([
      {
        title: 'Fallback Corp Blog',
        url: 'https://blog.fallback.example',
        snippet: 'Blog mentioning Fallback Corp',
      },
    ]);

    (braveSearchCompanyWebsites as MockedFunction<
      typeof braveSearchCompanyWebsites
    >).mockResolvedValue([
      {
        title: 'Fallback Corp Official',
        url: 'https://www.fallback.example/about',
        snippet: 'Official info',
      },
    ]);

    (scoreCandidateUrls as MockedFunction<typeof scoreCandidateUrls>)
      .mockResolvedValueOnce([
        {
          url: 'https://blog.fallback.example',
          score: 0.6,
          reason: 'Blog reference',
        },
      ])
      .mockResolvedValueOnce([
        {
          url: 'https://www.fallback.example/about',
          score: 0.82,
          reason: 'Official site',
        },
      ]);

    const result = await findBestCompanyUrl(company);

    expect(result).toEqual({
      url: 'https://www.fallback.example/',
      score: 0.82,
      reason: 'Official site',
    });
    expect(
      googleSearchCompanyWebsites as MockedFunction<
        typeof googleSearchCompanyWebsites
      >
    ).toHaveBeenCalledTimes(1);
    expect(
      braveSearchCompanyWebsites as MockedFunction<
        typeof braveSearchCompanyWebsites
      >
    ).toHaveBeenCalledTimes(1);
    expect(scoreCandidateUrls).toHaveBeenCalledTimes(2);
  });
});
