import { GoogleGenAI } from '@google/genai';

import { appConfig } from './config.js';
import { logger } from './logger.js';
import {
  CompanyInfo,
  GeminiScoreResponse,
  PageContent,
  ScoredUrl,
} from './types.js';

const geminiClient = new GoogleGenAI({ apiKey: appConfig.geminiApiKey });

function extractTextFromGeminiResponse(response: unknown): string {
  if (!response) {
    return '';
  }

  const collected: string[] = [];
  const payload = response as Record<string, unknown>;

  const candidateGroups = [
    (payload.response as { candidates?: unknown[] } | undefined)?.candidates,
    (payload as { candidates?: unknown[] }).candidates,
    (payload.output as { candidates?: unknown[] } | undefined)?.candidates,
    (payload.result as { candidates?: unknown[] } | undefined)?.candidates,
  ].filter((group): group is unknown[] => Array.isArray(group));

  const extractFromParts = (parts: unknown): string[] => {
    if (!Array.isArray(parts)) {
      return [];
    }

    return parts
      .map((part) => {
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }

        if (typeof part === 'string') {
          return part;
        }

        return '';
      })
      .filter((text): text is string => Boolean(text?.trim?.()));
  };

  for (const candidates of candidateGroups) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const candidateObj = candidate as {
        content?: { parts?: unknown[] } | undefined;
        parts?: unknown[];
        output_text?: string;
      };

      collected.push(...extractFromParts(candidateObj.content?.parts));
      collected.push(...extractFromParts(candidateObj.parts));

      if (
        typeof candidateObj.output_text === 'string' &&
        candidateObj.output_text.trim().length > 0
      ) {
        collected.push(candidateObj.output_text);
      }
    }
  }

  const outputArray =
    (payload.output as unknown[])?.filter?.(
      (item) => item && typeof item === 'object'
    ) ?? [];
  if (Array.isArray(outputArray)) {
    for (const item of outputArray) {
      const entry = item as {
        content?: { parts?: unknown[] };
        parts?: unknown[];
        output_text?: string;
      };
      collected.push(...extractFromParts(entry.content?.parts));
      collected.push(...extractFromParts(entry.parts));
      if (
        typeof entry.output_text === 'string' &&
        entry.output_text.trim().length > 0
      ) {
        collected.push(entry.output_text);
      }
    }
  }

  const textLikeCandidates = [
    (payload.response as { text?: () => string } | undefined)?.text?.() ?? '',
    (payload.response as { output_text?: string } | undefined)?.output_text ??
      '',
    (payload as { output_text?: string }).output_text ?? '',
    (payload as { text?: string }).text ?? '',
  ].filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  );

  collected.push(...textLikeCandidates);

  const uniqueText = collected
    .map((text) => text.trim())
    .filter(
      (text, index, array) => text.length > 0 && array.indexOf(text) === index
    );

  if (uniqueText.length === 0) {
    return '';
  }

  return uniqueText.join('\n');
}

function buildPrompt(company: CompanyInfo, pages: PageContent[]): string {
  const pageSummaries = pages
    .map(
      (page) =>
        `URL: ${page.url}\nTitle: ${page.title}\nSnippet: ${
          page.snippet ?? 'N/A'
        }\nContent Preview: ${page.content.slice(0, 1000)}`
    )
    .join('\n---\n');

  const description = company.description
    ? `Description: ${company.description}`
    : 'Description: Not provided';
  const address = company.address
    ? `Address: ${company.address}`
    : 'Address: Not provided';

  return (
    `You are evaluating candidate company websites. Return ONLY a raw JSON object (no markdown, no code blocks, no backticks).\n\n` +
    `The JSON must have a single property "urls" that is an array of objects with this exact shape:\n` +
    `{"url": string, "score": number between 0 and 1, "reason": string}\n\n` +
    `Company name: ${company.name}\n${address}\n${description}\n\nCandidate pages:\n${pageSummaries}\n\n` +
    'Base the score on how well the page seems to represent the official website for the company. Higher is better. ' +
    'Always return scores for every provided URL. Return ONLY the JSON object, nothing else.'
  );
}

function safeParseGeminiResponse(raw: string): GeminiScoreResponse | undefined {
  try {
    // トリムして余分な空白を削除
    let cleanedJson = raw.trim();

    // 念のため、マークダウンコードブロックがあれば削除（フォールバック）
    const codeBlockMatch = cleanedJson.match(
      /^```(?:json)?\s*([\s\S]*?)\s*```$/
    );
    if (codeBlockMatch) {
      cleanedJson = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(cleanedJson) as GeminiScoreResponse;
    if (!parsed || !Array.isArray(parsed.urls)) {
      return undefined;
    }
    return {
      urls: parsed.urls
        .filter(
          (entry) =>
            typeof entry.url === 'string' && typeof entry.score === 'number'
        )
        .map((entry) => ({
          url: entry.url,
          score: Math.min(1, Math.max(0, entry.score)),
          reason: entry.reason,
        })),
    };
  } catch (error) {
    logger.warn('Unable to parse Gemini response as JSON.', error);
    return undefined;
  }
}

function heuristicScore(
  company: CompanyInfo,
  pages: PageContent[]
): ScoredUrl[] {
  const normalizedName = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return pages.map((page) => {
    const normalizedUrl = page.url.toLowerCase();
    let score = 0.2;
    if (normalizedUrl.includes(normalizedName)) {
      score += 0.5;
    }
    if (
      page.snippet &&
      page.snippet.toLowerCase().includes(company.name.toLowerCase())
    ) {
      score += 0.2;
    }
    if (
      company.address &&
      page.content.toLowerCase().includes(company.address.toLowerCase())
    ) {
      score += 0.1;
    }
    return {
      url: page.url,
      score: Math.min(1, score),
      reason: 'Heuristic fallback score due to parsing error.',
    };
  });
}

export async function scoreCandidateUrls(
  company: CompanyInfo,
  pages: PageContent[]
): Promise<ScoredUrl[]> {
  if (pages.length === 0) {
    return [];
  }

  const prompt = buildPrompt(company, pages);

  try {
    const response = await geminiClient.models.generateContent({
      model: appConfig.geminiModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    const usageMetadata = response?.usageMetadata;
    if (usageMetadata) {
      const { promptTokenCount, candidatesTokenCount, totalTokenCount } =
        usageMetadata;
      logger.info(
        `Gemini token usage - prompt: ${promptTokenCount}, candidates: ${candidatesTokenCount}, total: ${totalTokenCount}`
      );
    } else {
      logger.info('Gemini token usage metadata was not provided in the response.');
    }

    const combinedText = extractTextFromGeminiResponse(response);

    const parsed = safeParseGeminiResponse(combinedText);
    if (!parsed) {
      logger.warn(
        'Gemini response could not be parsed. Falling back to heuristic scoring.'
      );
      return heuristicScore(company, pages);
    }

    const scoredUrls = pages.map((page) => {
      const match = parsed.urls.find((entry) => entry.url === page.url);
      return (
        match ?? {
          url: page.url,
          score: 0,
          reason: 'URL not scored by Gemini.',
        }
      );
    });

    return scoredUrls;
  } catch (error) {
    logger.error('Failed to score URLs with Gemini.', error);
    return heuristicScore(company, pages);
  }
}
