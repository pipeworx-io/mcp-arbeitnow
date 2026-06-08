interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Arbeitnow Job Board MCP.
 *
 * Wraps the keyless Arbeitnow Job Board API (https://www.arbeitnow.com/api/job-board-api),
 * a European (Germany-heavy) job board with many English-speaking and visa-sponsorship roles.
 * The feed is reverse-chronological and paginated; there is NO server-side keyword search,
 * so search_jobs scans recent pages and filters client-side.
 */


const BASE = 'https://www.arbeitnow.com/api/job-board-api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';
const MAX_PAGES = 10;

interface RawJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

interface ApiResponse {
  data: RawJob[];
  links?: Record<string, string | null>;
  meta?: Record<string, unknown>;
}

const tools: McpToolExport['tools'] = [
  {
    name: 'list_jobs',
    description:
      'List recent job postings from Arbeitnow, a keyless European (Germany-heavy) job board with many English-speaking and visa-sponsorship roles. Returns one page of postings in reverse-chronological order (newest first). HTML descriptions are omitted from this list — use get_job for the full description. Use page to paginate and remote_only to keep only remote jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default 1). 100 jobs per page.' },
        remote_only: { type: 'boolean', description: 'If true, keep only jobs where remote is true (default false).' },
      },
    },
  },
  {
    name: 'search_jobs',
    description:
      'Keyword-search recent Arbeitnow job postings (keyless European/German job board, many English-speaking & visa-sponsor roles). The upstream API has no search param, so this scans the most recent pages and filters client-side: it keeps jobs whose title, company name, or any tag contains the query (case-insensitive). Scans up to `pages` pages (default 3, max 10). Older jobs that have scrolled off the recent pages will not be found.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against title, company name, or tags (case-insensitive).' },
        pages: { type: 'number', description: 'How many recent pages to scan (default 3, max 10). More pages = older jobs, slower.' },
        remote_only: { type: 'boolean', description: 'If true, keep only remote jobs (default false).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_job',
    description:
      'Fetch the full details of a single Arbeitnow job posting by its slug, INCLUDING the full HTML description. There is no single-job endpoint upstream, so this scans the most recent pages (~3) to find the matching slug. If the job has scrolled off the recent listings it cannot be retrieved — use search_jobs instead.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The job slug (from list_jobs/search_jobs results).' },
      },
      required: ['slug'],
    },
  },
];

async function fetchPage(page: number): Promise<ApiResponse> {
  const res = await fetch(`${BASE}?page=${page}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(`Arbeitnow: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as ApiResponse;
  if (!json || !Array.isArray(json.data)) throw new Error('Arbeitnow: unexpected response shape (no data array).');
  return json;
}

function slimJob(j: RawJob) {
  return {
    title: j.title,
    company: j.company_name,
    location: j.location,
    remote: j.remote,
    tags: j.tags,
    job_types: j.job_types,
    url: j.url,
    slug: j.slug,
    posted: j.created_at,
  };
}

function clampPages(v: unknown, dflt: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.max(1, Math.min(MAX_PAGES, n));
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'list_jobs': {
        const page = clampPages(args.page, 1);
        const remoteOnly = args.remote_only === true;
        const resp = await fetchPage(page);
        let jobs = resp.data;
        if (remoteOnly) jobs = jobs.filter((j) => j.remote === true);
        return { page, count: jobs.length, jobs: jobs.map(slimJob) };
      }

      case 'search_jobs': {
        const query = args.query;
        if (typeof query !== 'string' || !query.trim()) {
          return { error: 'Required argument "query" is missing. Pass a keyword string, e.g. "react" or "data engineer".' };
        }
        const q = query.toLowerCase();
        const pages = clampPages(args.pages, 3);
        const remoteOnly = args.remote_only === true;
        const matched: RawJob[] = [];
        let scanned = 0;
        for (let p = 1; p <= pages; p++) {
          const resp = await fetchPage(p);
          scanned = p;
          if (resp.data.length === 0) break;
          for (const j of resp.data) {
            if (remoteOnly && j.remote !== true) continue;
            const hay = [j.title, j.company_name, ...(j.tags ?? [])].join(' ').toLowerCase();
            if (hay.includes(q)) matched.push(j);
          }
        }
        return { query, pages_scanned: scanned, count: matched.length, jobs: matched.map(slimJob) };
      }

      case 'get_job': {
        const slug = args.slug;
        if (typeof slug !== 'string' || !slug.trim()) {
          return { error: 'Required argument "slug" is missing. Pass a job slug from list_jobs/search_jobs.' };
        }
        for (let p = 1; p <= 3; p++) {
          const resp = await fetchPage(p);
          if (resp.data.length === 0) break;
          const hit = resp.data.find((j) => j.slug === slug);
          if (hit) {
            return {
              title: hit.title,
              company: hit.company_name,
              location: hit.location,
              remote: hit.remote,
              tags: hit.tags,
              job_types: hit.job_types,
              url: hit.url,
              slug: hit.slug,
              posted: hit.created_at,
              description: hit.description,
            };
          }
        }
        return { error: 'job not found in recent listings (it may have scrolled off); use search_jobs', slug };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
