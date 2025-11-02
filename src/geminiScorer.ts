import { GoogleGenerativeAI } from '@google/generative-ai';
import { appConfig } from './config.js';
import { logger } from './logger.js';
import { CompanyInfo, GeminiScoreResponse, PageContent, ScoredUrl } from './types.js';

const geminiClient = new GoogleGenerativeAI(appConfig.geminiApiKey);

function buildPrompt(company: CompanyInfo, pages: PageContent[]): string {
  const pageSummaries = pages
    .map(
      (page) =>
        `URL: ${page.url}\nTitle: ${page.title}\nSnippet: ${page.snippet ?? 'N/A'}\nContent Preview: ${page.content.slice(0, 1000)}`
    )
    .join('\n---\n');

  const description = company.description ? `Description: ${company.description}` : 'Description: Not provided';
  const address = company.address ? `Address: ${company.address}` : 'Address: Not provided';

  return `You are evaluating candidate company websites. Return a JSON object with a single property \\"urls\\" that is an array of objects in the shape {\"url\": string, \"score\": number between 0 and 1, \"reason\": string}.\n` +
    `Company name: ${company.name}\n${address}\n${description}\n\nCandidate pages:\n${pageSummaries}\n\n` +
    'Base the score on how well the page seems to represent the official website for the company. Higher is better. ' +
    'Always return scores for every provided URL and ensure valid JSON.';
}

function safeParseGeminiResponse(raw: string): GeminiScoreResponse | undefined {
  try {
    const parsed = JSON.parse(raw) as GeminiScoreResponse;
    if (!parsed || !Array.isArray(parsed.urls)) {
      return undefined;
    }
    return {
      urls: parsed.urls
        .filter((entry) => typeof entry.url === 'string' && typeof entry.score === 'number')
        .map((entry) => ({
          url: entry.url,
          score: Math.min(1, Math.max(0, entry.score)),
          reason: entry.reason
        }))
    };
  } catch (error) {
    logger.warn('Unable to parse Gemini response as JSON.', error);
    return undefined;
  }
}

function heuristicScore(company: CompanyInfo, pages: PageContent[]): ScoredUrl[] {
  const normalizedName = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return pages.map((page) => {
    const normalizedUrl = page.url.toLowerCase();
    let score = 0.2;
    if (normalizedUrl.includes(normalizedName)) {
      score += 0.5;
    }
    if (page.snippet && page.snippet.toLowerCase().includes(company.name.toLowerCase())) {
      score += 0.2;
    }
    if (company.address && page.content.toLowerCase().includes(company.address.toLowerCase())) {
      score += 0.1;
    }
    return {
      url: page.url,
      score: Math.min(1, score),
      reason: 'Heuristic fallback score due to parsing error.'
    };
  });
}

export async function scoreCandidateUrls(company: CompanyInfo, pages: PageContent[]): Promise<ScoredUrl[]> {
  if (pages.length === 0) {
    return [];
  }

  const model = geminiClient.getGenerativeModel({ model: appConfig.geminiModel });
  const prompt = buildPrompt(company, pages);

  try {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    const candidates = response.response?.candidates ?? [];
    const combinedText = candidates
      .flatMap((candidate) => candidate.content?.parts?.map((part) => part.text ?? '') ?? [])
      .join('\n');

    const parsed = safeParseGeminiResponse(combinedText);
    if (!parsed) {
      logger.warn('Gemini response could not be parsed. Falling back to heuristic scoring.');
      return heuristicScore(company, pages);
    }

    const scoredUrls = pages.map((page) => {
      const match = parsed.urls.find((entry) => entry.url === page.url);
      return (
        match ?? {
          url: page.url,
          score: 0,
          reason: 'URL not scored by Gemini.'
        }
      );
    });

    return scoredUrls;
  } catch (error) {
    logger.error('Failed to score URLs with Gemini.', error);
    return heuristicScore(company, pages);
  }
}
