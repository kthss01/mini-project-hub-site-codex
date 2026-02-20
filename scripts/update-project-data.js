#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'projects.config.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'projects.json');
const ETAG_PATH = path.join(ROOT_DIR, 'data', '.github-etags.json');
const SCHEMA_VERSION = '1.0.0';
const RECENT_COMMIT_COUNT = 10;
const OPEN_PR_LIMIT = 10;
const MERGED_PR_LIMIT = 5;
const ACTIVITY_WINDOW_DAYS = 7;
const ACTIVITY_COMMITS_MAX_PAGES = 15;

function toDateStringByTimezone(dateInput, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date(dateInput));
}

function getLastDays(timezone, days) {
  const now = new Date();
  const list = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    list.push(toDateStringByTimezone(date, timezone));
  }

  return list;
}

async function githubRequest(endpoint, token, params = {}) {
  const { etag, ...queryParams } = params;
  const url = new URL(`https://api.github.com${endpoint}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mini-project-hub-data-updater',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    return { notModified: true, data: null, etag };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${body.slice(0, 200)}`);
  }

  return {
    notModified: false,
    data: await response.json(),
    etag: response.headers.get('etag'),
  };
}

async function githubRequestRaw(endpoint, token, params = {}) {
  const url = new URL(`https://api.github.com${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mini-project-hub-data-updater',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${body.slice(0, 200)}`);
  }

  return response;
}

async function fetchActivityCommits(owner, repo, token, sinceIso) {
  const commits = [];

  for (let page = 1; page <= ACTIVITY_COMMITS_MAX_PAGES; page += 1) {
    const pageResult = await githubRequest(`/repos/${owner}/${repo}/commits`, token, {
      since: sinceIso,
      per_page: '100',
      page: String(page),
    });

    const pageItems = pageResult.data;
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    commits.push(...pageItems);
  }

  return commits;
}

function parseLastPageFromLinkHeader(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  const parts = linkHeader.split(',').map((part) => part.trim());
  const lastPart = parts.find((part) => part.endsWith('rel="last"'));

  if (!lastPart) {
    return null;
  }

  const match = lastPart.match(/<([^>]+)>/);
  if (!match) {
    return null;
  }

  const lastUrl = new URL(match[1]);
  const page = Number.parseInt(lastUrl.searchParams.get('page') || '', 10);

  return Number.isNaN(page) ? null : page;
}

async function getOpenPrCount(owner, repo, token) {
  const response = await githubRequestRaw(`/repos/${owner}/${repo}/pulls`, token, {
    state: 'open',
    per_page: '1',
    page: '1',
  });

  const linkHeader = response.headers.get('link');
  const lastPage = parseLastPageFromLinkHeader(linkHeader);

  if (lastPage !== null) {
    return lastPage;
  }

  const firstPageItems = await response.json();
  return firstPageItems.length;
}

function pickCommitDate(commit) {
  return commit?.commit?.author?.date || commit?.commit?.committer?.date || null;
}

function mapRecentCommits(commits) {
  return commits.slice(0, RECENT_COMMIT_COUNT).map((commit) => ({
    sha: commit.sha.slice(0, 7),
    message: (commit?.commit?.message || '').split('\n')[0],
    author: commit?.author?.login || commit?.commit?.author?.name || 'unknown',
    date_iso: pickCommitDate(commit),
    url: commit.html_url,
  }));
}

function buildActivityLast7Days(commits, timezone) {
  const days = getLastDays(timezone, ACTIVITY_WINDOW_DAYS);
  const counts = new Map(days.map((date) => [date, 0]));

  commits.forEach((commit) => {
    const dateIso = pickCommitDate(commit);
    if (!dateIso) {
      return;
    }

    const day = toDateStringByTimezone(dateIso, timezone);
    if (counts.has(day)) {
      counts.set(day, counts.get(day) + 1);
    }
  });

  return days.map((date) => ({ date, count: counts.get(date) || 0 }));
}

function mapOpenPrs(prs) {
  return prs.slice(0, OPEN_PR_LIMIT).map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr?.user?.login || 'unknown',
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    url: pr.html_url,
  }));
}

function mapMergedPrs(prs) {
  return prs
    .filter((pr) => Boolean(pr.merged_at))
    .slice(0, MERGED_PR_LIMIT)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      merged_at: pr.merged_at,
      author: pr?.user?.login || 'unknown',
      url: pr.html_url,
    }));
}

async function collectRepoData(repoConfig, timezone, token, options = {}) {
  const { owner, repo } = repoConfig;
  const repoName = `${owner}/${repo}`;
  const repoKey = repoName.toLowerCase();
  const { etags = {}, existingRepoMap = new Map() } = options;
  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(now.getUTCDate() - ACTIVITY_WINDOW_DAYS - 1);

  const metaEndpoint = `/repos/${owner}/${repo}`;
  const repoMetaResponse = await githubRequest(metaEndpoint, token, {
    etag: etags[metaEndpoint],
  });

  if (repoMetaResponse.notModified) {
    const cachedRepo = existingRepoMap.get(repoKey);
    if (cachedRepo) {
      return {
        ...cachedRepo,
        owner,
        repo,
        title: repoConfig.title || cachedRepo.title || `${owner}/${repo}`,
        thumbnail: repoConfig.thumbnail || cachedRepo.thumbnail || 'public/images/default-thumbnail.svg',
        demoUrl: repoConfig.demo_url || cachedRepo.demoUrl || '',
      };
    }

    delete etags[metaEndpoint];
    console.warn(`⚠️ 304 returned but no cached repo data for ${repoName}. Retrying without ETag.`);
  } else if (repoMetaResponse.etag) {
    etags[metaEndpoint] = repoMetaResponse.etag;
  }

  const repoMeta = repoMetaResponse.data || (await githubRequest(metaEndpoint, token)).data;

  const [recentCommitsRaw, activityCommits, openPrsRaw, closedPrs, openPrCount] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}/commits`, token, {
      per_page: String(RECENT_COMMIT_COUNT),
    }).then((result) => result.data),
    fetchActivityCommits(owner, repo, token, since.toISOString()),
    githubRequest(`/repos/${owner}/${repo}/pulls`, token, {
      state: 'open',
      per_page: String(OPEN_PR_LIMIT),
      sort: 'updated',
      direction: 'desc',
    }).then((result) => result.data),
    githubRequest(`/repos/${owner}/${repo}/pulls`, token, {
      state: 'closed',
      per_page: '30',
      sort: 'updated',
      direction: 'desc',
    }).then((result) => result.data),
    getOpenPrCount(owner, repo, token),
  ]);

  const recentCommits = mapRecentCommits(recentCommitsRaw);
  const openPullRequests = mapOpenPrs(openPrsRaw);
  const mergedPullRequests = mapMergedPrs(closedPrs);

  return {
    id: repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    owner,
    repo,
    title: repoConfig.title || repoMeta.name,
    html_url: repoMeta.html_url,
    description: repoConfig.description || repoMeta.description || '',
    homepage: repoConfig.demo_url || repoMeta.homepage || '',
    default_branch: repoMeta.default_branch || '',
    updated_at: repoMeta.updated_at || null,
    thumbnail: repoConfig.thumbnail || 'public/images/default-thumbnail.svg',
    repoUrl: repoMeta.html_url,
    demoUrl: repoConfig.demo_url || repoMeta.homepage || '',
    recent_commits: recentCommits,
    pull_requests: {
      open_count: openPrCount,
      open: openPullRequests,
      recently_merged: mergedPullRequests,
    },
    activity_last_7_days: buildActivityLast7Days(activityCommits, timezone),
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const configRaw = await fs.readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(configRaw);
  const timezone = config.timezone || 'Asia/Seoul';
  const existingPayloadRaw = await fs.readFile(OUTPUT_PATH, 'utf8').catch(() => null);
  const existingPayload = existingPayloadRaw ? JSON.parse(existingPayloadRaw) : null;
  const existingRepoMap = new Map(
    Array.isArray(existingPayload?.repos)
      ? existingPayload.repos
          .filter((repoItem) => repoItem?.owner && repoItem?.repo)
          .map((repoItem) => [`${repoItem.owner}/${repoItem.repo}`.toLowerCase(), repoItem])
      : [],
  );

  const etagsRaw = await fs.readFile(ETAG_PATH, 'utf8').catch(() => null);
  const etags = etagsRaw ? JSON.parse(etagsRaw) : {};

  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    throw new Error('projects.config.json 의 repos 배열이 비어 있습니다.');
  }

  const repos = [];

  for (const repoConfig of config.repos) {
    if (!repoConfig?.owner || !repoConfig?.repo) {
      repos.push({
        owner: repoConfig?.owner || '',
        repo: repoConfig?.repo || '',
        error: 'owner/repo 값이 없습니다.',
      });
      continue;
    }

    try {
      const repoData = await collectRepoData(repoConfig, timezone, token, {
        etags,
        existingRepoMap,
      });
      repos.push(repoData);
      console.log(`✅ collected ${repoConfig.owner}/${repoConfig.repo}`);
    } catch (error) {
      console.warn(`⚠️ failed ${repoConfig.owner}/${repoConfig.repo}: ${error.message}`);
      const cachedRepo = existingRepoMap.get(`${repoConfig.owner}/${repoConfig.repo}`.toLowerCase());
      if (cachedRepo) {
        repos.push(cachedRepo);
        console.warn(`ℹ️ reused cached data for ${repoConfig.owner}/${repoConfig.repo}`);
        continue;
      }

      repos.push({
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        title: repoConfig.title || `${repoConfig.owner}/${repoConfig.repo}`,
        html_url: `https://github.com/${repoConfig.owner}/${repoConfig.repo}`,
        description: repoConfig.description || '',
        homepage: repoConfig.demo_url || '',
        default_branch: '',
        updated_at: null,
        thumbnail: repoConfig.thumbnail || 'public/images/default-thumbnail.svg',
        repoUrl: `https://github.com/${repoConfig.owner}/${repoConfig.repo}`,
        demoUrl: repoConfig.demo_url || '',
        recent_commits: [],
        pull_requests: { open_count: 0, open: [], recently_merged: [] },
        activity_last_7_days: getLastDays(timezone, ACTIVITY_WINDOW_DAYS).map((date) => ({ date, count: 0 })),
        error: error.message,
      });
    }
  }

  const payload = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    timezone,
    repos,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(ETAG_PATH, `${JSON.stringify(etags, null, 2)}\n`, 'utf8');
  console.log(`✅ wrote ${OUTPUT_PATH}`);
  console.log(`✅ wrote ${ETAG_PATH}`);
}

main().catch((error) => {
  console.error(`❌ update failed: ${error.message}`);
  process.exitCode = 1;
});
