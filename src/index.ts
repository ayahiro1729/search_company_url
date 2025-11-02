import { fileURLToPath } from 'node:url';

import { appConfig } from './config.js';
import { scoreCandidateUrls } from './geminiScorer.js';
import { searchCompanyWebsites } from './googleSearch.js';
import { logger } from './logger.js';
import { CompanyInfo, PageContent, ScoredUrl } from './types.js';

async function fetchPageContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      logger.warn(
        `Failed to fetch page content for ${url}. Status: ${response.status}`
      );
      return '';
    }
    const content = await response.text();
    return content;
  } catch (error) {
    logger.warn(`Error fetching content for ${url}`, error);
    return '';
  }
}

export async function findBestCompanyUrl(
  company: CompanyInfo
): Promise<ScoredUrl | undefined> {
  logger.info(`Starting workflow for ${company.name}`);

  const searchResults = await searchCompanyWebsites(company);
  if (searchResults.length === 0) {
    logger.warn('No search results returned for company.');
    return undefined;
  }

  const pages: PageContent[] = await Promise.all(
    searchResults.map(async (result) => ({
      ...result,
      content: await fetchPageContent(result.url),
    }))
  );

  const scored = await scoreCandidateUrls(company, pages);
  if (scored.length === 0) {
    logger.warn('No scored URLs returned.');
    return undefined;
  }

  const best = [...scored].sort((a, b) => b.score - a.score)[0];
  logger.info(
    `Best URL for ${company.name}: ${best.url} (score=${best.score.toFixed(2)})`
  );
  return best;
}

function parseArgs(argv: string[]): CompanyInfo {
  const args = argv.slice(2);
  const company: CompanyInfo = { name: '' };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--name' && args[i + 1]) {
      company.name = args[i + 1];
      i += 1;
    } else if (arg === '--address' && args[i + 1]) {
      company.address = args[i + 1];
      i += 1;
    } else if (arg === '--description' && args[i + 1]) {
      company.description = args[i + 1];
      i += 1;
    }
  }

  if (!company.name) {
    throw new Error(
      'Company name is required. Use --name "Company Name" to provide it.'
    );
  }

  return company;
}

async function runFromCli(): Promise<void> {
  try {
    const company = parseArgs(process.argv);
    const best = await findBestCompanyUrl(company);
    if (best) {
      console.log(JSON.stringify(best, null, 2));
    } else {
      console.log('No suitable website found.');
    }
  } catch (error) {
    logger.error('CLI execution failed.', error);
    process.exitCode = 1;
  }
}

const isExecutedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  runFromCli().catch((error) => {
    logger.error('Unexpected error running CLI.', error);
    process.exitCode = 1;
  });
}

export { appConfig };
