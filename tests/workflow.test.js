import { beforeEach, describe, expect, it, vi } from 'vitest';
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? 'test-google-key';
process.env.GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? 'test-cse-id';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-gemini-key';
const fetchMock = vi.fn();
vi.mock('../src/googleSearch.js', () => ({
    searchCompanyWebsites: vi.fn()
}));
vi.mock('../src/geminiScorer.js', () => ({
    scoreCandidateUrls: vi.fn()
}));
const { searchCompanyWebsites } = await import('../src/googleSearch.js');
const { scoreCandidateUrls } = await import('../src/geminiScorer.js');
const { findBestCompanyUrl } = await import('../src/index.js');
describe('findBestCompanyUrl', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            text: async () => 'Sample content mentioning Acme Corp and address 123 Street'
        });
        global.fetch = fetchMock;
        searchCompanyWebsites.mockReset();
        scoreCandidateUrls.mockReset();
    });
    it('returns the highest scoring URL', async () => {
        const company = { name: 'Acme Corp', address: '123 Street' };
        searchCompanyWebsites.mockResolvedValue([
            { title: 'Acme Corp - Official', url: 'https://www.acme.com', snippet: 'Official website for Acme Corp' },
            { title: 'Acme Partners', url: 'https://partners.acme.com', snippet: 'Partners portal' }
        ]);
        const scores = [
            { url: 'https://www.acme.com', score: 0.9, reason: 'Official domain' },
            { url: 'https://partners.acme.com', score: 0.6, reason: 'Partner portal' }
        ];
        scoreCandidateUrls.mockResolvedValue(scores);
        const result = await findBestCompanyUrl(company);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result).toEqual(scores[0]);
    });
    it('returns undefined when there are no search results', async () => {
        const company = { name: 'Unknown Inc' };
        searchCompanyWebsites.mockResolvedValue([]);
        const result = await findBestCompanyUrl(company);
        expect(result).toBeUndefined();
        expect(scoreCandidateUrls).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=workflow.test.js.map