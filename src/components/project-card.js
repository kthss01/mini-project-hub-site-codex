import { formatRelativeTime } from '../lib/time.js';

const FALLBACK_THUMBNAIL = 'public/images/default-thumbnail.svg';
const THUMBNAIL_FILENAME = 'project-thumbnail.svg';

function sanitizeThumbnailPath(thumbnailPath) {
  if (typeof thumbnailPath !== 'string') {
    return '';
  }

  return thumbnailPath
    .replace(/\\n/g, '/')
    .replace(/\n/g, '/')
    .replace(/\\+/g, '/')
    .trim();
}

function parseGithubRepo(repoUrl) {
  if (typeof repoUrl !== 'string' || repoUrl.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(repoUrl);

    if (url.hostname !== 'github.com') {
      return null;
    }

    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

function buildDocsAssetCandidates(path) {
  const normalizedPath = path.replace(/^\/+/, '');
  const hasFilenameOnly = normalizedPath.toLowerCase() === THUMBNAIL_FILENAME;

  if (hasFilenameOnly) {
    return [
      `packages/client/public/assets/${THUMBNAIL_FILENAME}`,
      `packages/client/assets/${THUMBNAIL_FILENAME}`,
      `docs/assets/${THUMBNAIL_FILENAME}`,
      `docs/${THUMBNAIL_FILENAME}`,
      `assets/${THUMBNAIL_FILENAME}`,
      `public/images/${THUMBNAIL_FILENAME}`,
      `public/${THUMBNAIL_FILENAME}`,
      `images/${THUMBNAIL_FILENAME}`,
      THUMBNAIL_FILENAME,
    ];
  }

  const withRepoPrefixStripped = normalizedPath.includes('/')
    ? normalizedPath.slice(normalizedPath.indexOf('/') + 1)
    : normalizedPath;

  return [normalizedPath, withRepoPrefixStripped, THUMBNAIL_FILENAME];
}

function buildGithubThumbnailCandidates({ owner, repo }, path) {
  const assetPaths = [...new Set(buildDocsAssetCandidates(path))];
  const branches = ['main', 'master'];

  const candidates = [];

  branches.forEach((branch) => {
    assetPaths.forEach((assetPath) => {
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${assetPath}`);
      candidates.push(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${assetPath}`);
    });
  });

  return candidates;
}

function buildThumbnailCandidates(project) {
  const path = sanitizeThumbnailPath(project.thumbnail);

  if (!path) {
    return [FALLBACK_THUMBNAIL, '/images/default-thumbnail.svg'];
  }

  const candidates = [path];

  if (path.startsWith('public/')) {
    candidates.push(`/${path.replace(/^public\//, '')}`);
  } else if (path.startsWith('/images/')) {
    candidates.push(`public${path}`);
  }

  const isThumbnailFilename = path.toLowerCase().endsWith(THUMBNAIL_FILENAME);
  const repoMeta = parseGithubRepo(project.repoUrl);
  if (isThumbnailFilename && repoMeta) {
    candidates.push(...buildGithubThumbnailCandidates(repoMeta, path));
  }

  candidates.push(FALLBACK_THUMBNAIL, '/images/default-thumbnail.svg');

  return [...new Set(candidates)];
}

export function getProjectThumbnailCandidates(project) {
  return buildThumbnailCandidates(project);
}

function createTagList(tags = []) {
  const normalizedTags = Array.isArray(tags)
    ? tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    : [];

  if (normalizedTags.length === 0) {
    return null;
  }

  const list = document.createElement('ul');
  list.className = 'project-tags';
  list.setAttribute('aria-label', '프로젝트 태그');

  const visibleTags = normalizedTags.slice(0, 3);
  visibleTags.forEach((tag) => {
    const item = document.createElement('li');
    item.className = 'project-tag';
    item.textContent = tag.trim();
    list.appendChild(item);
  });

  const hiddenCount = normalizedTags.length - visibleTags.length;
  if (hiddenCount > 0) {
    const overflowItem = document.createElement('li');
    overflowItem.className = 'project-tag project-tag-overflow';
    overflowItem.textContent = `+${hiddenCount}`;
    list.appendChild(overflowItem);
  }

  return list;
}

function createActionLink({ href, label, className }) {
  if (typeof href !== 'string' || href.trim().length === 0) {
    return null;
  }

  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;

  return link;
}

function createRecentCommits(project) {
  const commits = Array.isArray(project.recentCommits) ? project.recentCommits.slice(0, 2) : [];
  if (commits.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'project-activity';

  const title = document.createElement('h4');
  title.className = 'project-activity-title';
  title.textContent = 'Latest commits';

  const list = document.createElement('ul');
  list.className = 'project-activity-list';

  commits.forEach((commit) => {
    const item = document.createElement('li');
    item.className = 'project-activity-item';

    const link = createActionLink({
      href: commit.url,
      label: commit.message || commit.sha || 'View commit',
      className: 'project-activity-link',
    });

    if (link) {
      item.appendChild(link);
    }

    const meta = document.createElement('p');
    meta.className = 'project-activity-meta';
    meta.textContent = `${commit.author || 'unknown'} · ${formatRelativeTime(commit.date_iso, 'ko') || '-'}`;
    item.appendChild(meta);

    list.appendChild(item);
  });

  section.append(title, list);
  return section;
}

function createRecentPrs(project) {
  const prs = Array.isArray(project?.pullRequests?.open) ? project.pullRequests.open.slice(0, 2) : [];
  if (prs.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'project-activity';

  const title = document.createElement('h4');
  title.className = 'project-activity-title';
  const openCount = Number(project?.pullRequests?.open_count) || 0;
  title.textContent = `Open PRs (${openCount})`;

  const list = document.createElement('ul');
  list.className = 'project-activity-list';

  prs.forEach((pr) => {
    const item = document.createElement('li');
    item.className = 'project-activity-item';

    const link = createActionLink({
      href: pr.url,
      label: `#${pr.number} ${pr.title}`,
      className: 'project-activity-link',
    });

    if (link) {
      item.appendChild(link);
    }

    const meta = document.createElement('p');
    meta.className = 'project-activity-meta';
    meta.textContent = `${pr.author || 'unknown'} · ${formatRelativeTime(pr.updated_at, 'ko') || '-'}`;
    item.appendChild(meta);

    list.appendChild(item);
  });

  section.append(title, list);
  return section;
}

export function createProjectCard(project, { onSelect } = {}) {
  const article = document.createElement('article');
  article.className = 'project-card';
  article.setAttribute('role', 'listitem');

  const thumbnailFrame = document.createElement('div');
  thumbnailFrame.className = 'project-thumbnail-frame';

  const thumbnail = document.createElement('img');
  thumbnail.className = 'project-thumbnail';
  const thumbnailCandidates = buildThumbnailCandidates(project);
  let candidateIndex = 0;

  thumbnail.src = thumbnailCandidates[candidateIndex];
  thumbnail.alt = `${project.title} 썸네일`;
  thumbnail.loading = 'lazy';

  thumbnail.addEventListener('error', () => {
    candidateIndex += 1;

    if (candidateIndex < thumbnailCandidates.length) {
      thumbnail.src = thumbnailCandidates[candidateIndex];
      return;
    }

    thumbnailFrame.classList.add('is-thumbnail-error');
    thumbnail.remove();
  });

  thumbnailFrame.appendChild(thumbnail);

  const body = document.createElement('div');
  body.className = 'project-body';

  const title = document.createElement('h3');
  title.textContent = project.title;

  const description = document.createElement('p');
  description.textContent = project.description || '프로젝트 설명이 없습니다.';

  const actions = document.createElement('div');
  actions.className = 'project-actions';

  const detailButton = document.createElement('button');
  detailButton.className = 'project-action-link project-action-button';
  detailButton.type = 'button';
  detailButton.textContent = '상세 보기';
  detailButton.addEventListener('click', () => {
    if (typeof onSelect === 'function') {
      onSelect(project);
    }
  });
  actions.appendChild(detailButton);

  const repoAction = createActionLink({
    href: project.repoUrl,
    label: 'GitHub Repository',
    className: 'project-action-link',
  });

  const pageAction = createActionLink({
    href: project.demoUrl,
    label: 'GitHub Pages',
    className: 'project-action-link project-action-link-secondary',
  });

  if (repoAction) {
    actions.appendChild(repoAction);
  }

  if (pageAction) {
    actions.appendChild(pageAction);
  }

  body.append(title, description);

  const tagList = createTagList(project.tags);
  if (tagList) {
    body.appendChild(tagList);
  }

  const commitSummary = createRecentCommits(project);
  if (commitSummary) {
    body.appendChild(commitSummary);
  }

  const prSummary = createRecentPrs(project);
  if (prSummary) {
    body.appendChild(prSummary);
  }

  if (project.dataError) {
    const warning = document.createElement('p');
    warning.className = 'project-data-warning';
    warning.textContent = '일부 GitHub 데이터를 불러오지 못했습니다.';
    body.appendChild(warning);
  }

  if (actions.childElementCount > 0) {
    body.appendChild(actions);
  }

  article.append(thumbnailFrame, body);

  return article;
}
