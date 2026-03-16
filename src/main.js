import { createProjectCard, getProjectThumbnailCandidates } from './components/project-card.js';

const projectList = document.querySelector('#project-list');
const listSection = document.querySelector('#projects-list-section');
const detailSection = document.querySelector('#project-detail-section');
const detailBackButton = document.querySelector('#detail-back-button');
const detailTitle = document.querySelector('#detail-title');
const detailDescription = document.querySelector('#detail-description');
const detailThumbnail = document.querySelector('#detail-thumbnail');
const detailRepoLink = document.querySelector('#detail-repo-link');
const detailDemoLink = document.querySelector('#detail-demo-link');
const detailDeployLink = document.querySelector('#detail-deploy-link');
const readmeContent = document.querySelector('#readme-content');
const languageBreakdown = document.querySelector('#language-breakdown');
const detailSummary = document.querySelector('#detail-summary');
const activityHeatmap = document.querySelector('#activity-heatmap');
const activityTotals = document.querySelector('#activity-totals');
const requestUpdateButton = document.querySelector('#request-update-button');
const requestUpdateStatus = document.querySelector('#request-update-status');


const dispatchApiBaseUrl = import.meta?.env?.VITE_DISPATCH_API_URL || '';

function getDispatchEndpoint() {
  if (typeof dispatchApiBaseUrl === 'string' && dispatchApiBaseUrl.trim().length > 0) {
    return `${dispatchApiBaseUrl.replace(/\/$/, '')}/dispatch-update`;
  }

  return '/api/dispatch-update';
}

function normalizeProjects(payload) {
  const toFiniteNumberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const getDeploymentLinks = (repo) => {
    const githubPagesUrl = repo.githubPagesUrl || repo.github_pages_url || '';
    const deploymentUrl = repo.deploymentUrl || repo.deployment_url || '';
    const demoUrl = repo.demoUrl || repo.demo_url || repo.homepage || '';
    const hasPages = Boolean(repo.has_pages || repo.hasPages);
    const repoUrl = repo.repoUrl || repo.repo_url || repo.html_url || '';
    const inferredGithubPagesUrl = buildGithubPagesUrl(repoUrl);

    return {
      githubPagesUrl:
        githubPagesUrl
        || (isGithubPagesUrl(demoUrl) ? demoUrl : '')
        || (hasPages ? inferredGithubPagesUrl : '')
        || (deploymentUrl ? inferredGithubPagesUrl : ''),
      deploymentUrl: deploymentUrl || (isVercelUrl(demoUrl) ? demoUrl : ''),
    };
  };

  const normalizeRepo = (repo) => ({
    id: repo.id || `${repo.owner}-${repo.repo}`,
    title: repo.title || `${repo.owner}/${repo.repo}`,
    description: repo.description || '프로젝트 설명이 없습니다.',
    thumbnail: repo.thumbnail || '/images/default-thumbnail.svg',
    repoUrl: repo.repoUrl || repo.repo_url || repo.html_url,
    demoUrl: repo.demoUrl || repo.demo_url || repo.homepage,
    ...getDeploymentLinks(repo),
    totalCommits: toFiniteNumberOrNull(repo.totalCommits ?? repo.total_commits),
    recentCommits: Array.isArray(repo.recentCommits)
      ? repo.recentCommits
      : (Array.isArray(repo.recent_commits) ? repo.recent_commits : []),
    pullRequests:
      repo.pullRequests
      || repo.pull_requests
      || { total_count: 0, open_count: 0, open: [], recently_merged: [] },
    dataError: repo.dataError || repo.error || '',
    tags: Array.isArray(repo.tags) ? repo.tags : [],
    activityLast7Days: Array.isArray(repo.activityLast7Days)
      ? repo.activityLast7Days
      : (Array.isArray(repo.activity_last_7_days) ? repo.activity_last_7_days : []),
  });

  if (Array.isArray(payload)) {
    return payload.map((repo) => normalizeRepo(repo));
  }

  if (payload && Array.isArray(payload.repos)) {
    return payload.repos.map((repo) => normalizeRepo(repo));
  }

  throw new Error('프로젝트 데이터 형식이 올바르지 않습니다.');
}

function isGithubPagesUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('github.io');
  } catch {
    return false;
  }
}

function isVercelUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith('vercel.app');
  } catch {
    return false;
  }
}


function buildGithubPagesUrl(repoUrl) {
  const repoMeta = parseGithubRepo(repoUrl);

  if (!repoMeta) {
    return '';
  }

  if (repoMeta.repo.toLowerCase() === `${repoMeta.owner.toLowerCase()}.github.io`) {
    return `https://${repoMeta.repo}/`;
  }

  return `https://${repoMeta.owner}.github.io/${repoMeta.repo}/`;
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

function normalizeLanguageData(languages) {
  if (!languages || typeof languages !== 'object') {
    return [];
  }

  const entries = Object.entries(languages)
    .map(([name, bytes]) => ({
      name,
      bytes: Number(bytes),
    }))
    .filter((entry) => Number.isFinite(entry.bytes) && entry.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (totalBytes <= 0) {
    return [];
  }

  return entries.map((entry) => ({
    ...entry,
    percent: (entry.bytes / totalBytes) * 100,
  }));
}

function getLanguageColor(index) {
  const palette = [
    '#3178c6',
    '#663399',
    '#e34c26',
    '#f1e05a',
    '#2b7489',
    '#89e051',
    '#3572a5',
  ];

  return palette[index % palette.length];
}

function renderLanguageBreakdown(container, languages) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const titleNode = document.createElement('h4');
  titleNode.className = 'detail-chart-title';
  titleNode.textContent = 'Languages';

  const languageItems = normalizeLanguageData(languages);
  if (languageItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty-message';
    empty.textContent = '표시할 언어 데이터가 없습니다.';
    container.append(titleNode, empty);
    return;
  }

  const bar = document.createElement('div');
  bar.className = 'language-bar';

  languageItems.forEach((language, index) => {
    const segment = document.createElement('span');
    segment.className = 'language-bar-segment';
    segment.style.width = `${language.percent}%`;
    segment.style.backgroundColor = getLanguageColor(index);
    segment.title = `${language.name} ${language.percent.toFixed(1)}%`;
    segment.setAttribute('aria-label', segment.title);
    bar.append(segment);
  });

  const legend = document.createElement('ul');
  legend.className = 'language-legend';

  languageItems.forEach((language, index) => {
    const item = document.createElement('li');
    item.className = 'language-legend-item';

    const dot = document.createElement('i');
    dot.style.backgroundColor = getLanguageColor(index);

    const label = document.createElement('span');
    label.className = 'language-legend-label';
    label.textContent = language.name;

    const value = document.createElement('span');
    value.className = 'language-legend-value';
    value.textContent = `${language.percent.toFixed(1)}%`;

    item.append(dot, label, value);
    legend.append(item);
  });

  container.append(titleNode, bar, legend);
}

async function loadGithubLanguages(project) {
  const repoMeta = parseGithubRepo(project.repoUrl);

  if (!repoMeta) {
    renderLanguageBreakdown(languageBreakdown, null);
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repoMeta.owner}/${repoMeta.repo}/languages`);
    if (!response.ok) {
      throw new Error('language fetch failed');
    }

    const payload = await response.json();
    renderLanguageBreakdown(languageBreakdown, payload);
  } catch {
    renderLanguageBreakdown(languageBreakdown, null);
  }
}

function setThumbnail(project) {
  const candidates = getProjectThumbnailCandidates(project);
  let index = 0;

  detailThumbnail.src = candidates[index];
  detailThumbnail.alt = `${project.title} 썸네일`;

  detailThumbnail.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      detailThumbnail.src = candidates[index];
    }
  };
}

function toggleLink(anchor, url) {
  if (typeof url === 'string' && url.trim().length > 0) {
    anchor.href = url;
    anchor.hidden = false;
    return;
  }

  anchor.hidden = true;
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return text;
}

function renderReadmeMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inCodeBlock = false;
  let inList = false;

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        html.push('<pre><code>');
        inCodeBlock = true;
      } else {
        html.push('</code></pre>');
        inCodeBlock = false;
      }
      return;
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`);
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      return;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listMatch[1].trim())}</li>`);
      return;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    if (line.trim().length === 0) {
      html.push('');
      return;
    }

    html.push(`<p>${inlineMarkdown(line.trim())}</p>`);
  });

  if (inList) {
    html.push('</ul>');
  }

  if (inCodeBlock) {
    html.push('</code></pre>');
  }

  return html.join('\n');
}

function getProjectSummary(project) {
  const totalCommitCount = Number.isFinite(project?.totalCommits) ? project.totalCommits : 0;
  const totalPrCount = Number.isFinite(project?.pullRequests?.total_count) ? project.pullRequests.total_count : 0;

  return `총 Commit ${totalCommitCount}개 · 총 PR ${totalPrCount}개`;
}

async function loadReadme(project) {
  readmeContent.innerHTML = '<p class="detail-empty-message">README를 불러오는 중...</p>';
  const repoMeta = parseGithubRepo(project.repoUrl);

  if (!repoMeta) {
    readmeContent.innerHTML = '<p class="detail-empty-message">README를 불러올 저장소 정보가 없습니다.</p>';
    return;
  }

  const candidates = [
    `https://raw.githubusercontent.com/${repoMeta.owner}/${repoMeta.repo}/main/README.md`,
    `https://raw.githubusercontent.com/${repoMeta.owner}/${repoMeta.repo}/master/README.md`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        readmeContent.innerHTML = renderReadmeMarkdown(await response.text());
        return;
      }
    } catch {
      // continue to next candidate
    }
  }

  readmeContent.innerHTML = '<p class="detail-empty-message">README.md를 불러오지 못했습니다.</p>';
}

function showProjectDetail(project) {
  detailTitle.textContent = project.title;
  detailDescription.textContent = project.description || '프로젝트 설명이 없습니다.';
  detailSummary.textContent = getProjectSummary(project);

  setThumbnail(project);
  toggleLink(detailRepoLink, project.repoUrl);
  toggleLink(detailDemoLink, project.githubPagesUrl);
  toggleLink(detailDeployLink, project.deploymentUrl);

  renderLanguageBreakdown(languageBreakdown, null);
  void loadGithubLanguages(project);

  loadReadme(project);

  listSection.hidden = true;
  detailSection.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showList() {
  detailSection.hidden = true;
  listSection.hidden = false;
}

async function loadProjects() {
  try {
    const cacheBustingUrl = new URL('./data/projects.json', window.location.href);
    cacheBustingUrl.searchParams.set('t', String(Date.now()));

    const response = await fetch(cacheBustingUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`프로젝트 데이터를 불러오지 못했습니다: ${response.status}`);
    }

    const payload = await response.json();
    const projects = normalizeProjects(payload);

    renderProjects(projects);
    return true;
  } catch (error) {
    renderError(error);
    return false;
  }
}

function renderProjects(projects) {
  const fragment = document.createDocumentFragment();

  projects.forEach((project) => {
    if (!project?.title || (!project?.repoUrl && !project?.demoUrl)) {
      return;
    }

    fragment.appendChild(createProjectCard(project, { onSelect: showProjectDetail }));
  });

  if (fragment.childElementCount === 0) {
    projectList.innerHTML = '<p class="empty-message">아직 등록된 프로젝트가 없습니다. 새 프로젝트를 추가해보세요.</p>';
    return;
  }

  projectList.replaceChildren(fragment);
}

function renderError(error) {
  projectList.innerHTML = `<p class="error-message">${error.message}</p>`;
}

function setUpdateStatus(message, tone = '') {
  if (!requestUpdateStatus) {
    return;
  }

  requestUpdateStatus.textContent = message;
  requestUpdateStatus.dataset.tone = tone;
}

async function requestProjectDataUpdate() {
  if (!requestUpdateButton) {
    return;
  }

  const dispatchKey = window.prompt('갱신 요청 키를 입력해주세요.');
  if (!dispatchKey) {
    setUpdateStatus('갱신 요청이 취소되었습니다.', 'info');
    return;
  }

  requestUpdateButton.disabled = true;
  setUpdateStatus('업데이트 요청을 전송하고 있습니다...', 'info');

  try {
    const response = await fetch(getDispatchEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dispatch-Key': dispatchKey,
      },
      body: JSON.stringify({}),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || '업데이트 요청 전송에 실패했습니다.');
    }

    setUpdateStatus(result.message || '업데이트 요청이 접수되었습니다.', 'success');
  } catch (error) {
    setUpdateStatus(error.message || '업데이트 요청에 실패했습니다.', 'error');
  } finally {
    requestUpdateButton.disabled = false;
  }
}

detailBackButton.addEventListener('click', showList);
requestUpdateButton?.addEventListener('click', requestProjectDataUpdate);


if (requestUpdateButton && window.location.hostname.endsWith('github.io') && !dispatchApiBaseUrl) {
  requestUpdateButton.disabled = true;
  setUpdateStatus('현재 배포에서는 갱신 요청 API 주소가 설정되지 않았습니다.', 'error');
}

loadProjects();
