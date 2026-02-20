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
const readmeContent = document.querySelector('#readme-content');
const activityHeatmap = document.querySelector('#activity-heatmap');
const activityTotals = document.querySelector('#activity-totals');
const requestUpdateButton = document.querySelector('#request-update-button');
const requestUpdateStatus = document.querySelector('#request-update-status');
const requestUpdateButtonLabel = document.querySelector('#request-update-button-label');
const requestUpdateButtonSpinner = document.querySelector('#request-update-button-spinner');
const requestUpdateRetryButton = document.querySelector('#request-update-retry-button');

const STATUS_POLL_INTERVAL_MS = 7000;
const STATUS_POLL_TIMEOUT_MS = 180000;

let statusPollTimerId = null;
let statusPollingStartedAt = 0;
let updateDispatchKey = '';
let updateDispatchRequestedAt = 0;


function normalizeProjects(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.repos)) {
    return payload.repos.map((repo) => ({
      id: repo.id || `${repo.owner}-${repo.repo}`,
      title: repo.title || `${repo.owner}/${repo.repo}`,
      description: repo.description || '프로젝트 설명이 없습니다.',
      thumbnail: repo.thumbnail || 'project-thumbnail.svg',
      repoUrl: repo.repoUrl || repo.html_url,
      demoUrl: repo.demoUrl || repo.homepage,
      totalCommits: Number.isFinite(repo.total_commits) ? repo.total_commits : null,
      recentCommits: Array.isArray(repo.recent_commits) ? repo.recent_commits : [],
      pullRequests: repo.pull_requests || { total_count: 0, open_count: 0, open: [], recently_merged: [] },
      dataError: repo.error || '',
      tags: [],
    }));
  }

  throw new Error('프로젝트 데이터 형식이 올바르지 않습니다.');
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

function toDateKey(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function countByDay(items, dateField) {
  return items.reduce((acc, item) => {
    const key = toDateKey(item?.[dateField]);
    if (!key) {
      return acc;
    }

    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getActivityCellColor(commitCount, prCount) {
  const totalCount = commitCount + prCount;
  if (totalCount === 0) {
    return 'var(--activity-empty)';
  }

  const intensity = Math.min(totalCount / 4, 1);
  const alpha = 0.35 + intensity * 0.55;

  if (commitCount > 0 && prCount > 0) {
    return `color-mix(in srgb, var(--activity-both) ${Math.round(alpha * 100)}%, transparent)`;
  }

  if (commitCount > 0) {
    return `color-mix(in srgb, var(--activity-commit) ${Math.round(alpha * 100)}%, transparent)`;
  }

  return `color-mix(in srgb, var(--activity-pr) ${Math.round(alpha * 100)}%, transparent)`;
}

function renderActivityHeatmap(container, commitMap, prMap) {
  container.innerHTML = '';

  const titleNode = document.createElement('h4');
  titleNode.className = 'detail-chart-title';
  titleNode.textContent = '일자별 Commit/PR 활동';

  const dayCount = 84;
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - i);
    dates.push(date);
  }

  const hasActivity = dates.some((date) => {
    const key = date.toISOString().slice(0, 10);
    return (commitMap[key] || 0) + (prMap[key] || 0) > 0;
  });

  const grid = document.createElement('div');
  grid.className = 'activity-heatmap-grid';

  dates.forEach((date) => {
    const key = date.toISOString().slice(0, 10);
    const commitCount = commitMap[key] || 0;
    const prCount = prMap[key] || 0;

    const cell = document.createElement('span');
    cell.className = 'activity-heatmap-cell';
    cell.style.backgroundColor = getActivityCellColor(commitCount, prCount);
    cell.title = `${key} · Commit ${commitCount}개 · PR ${prCount}개`;
    cell.setAttribute('aria-label', cell.title);
    grid.appendChild(cell);
  });

  const legend = document.createElement('div');
  legend.className = 'activity-legend';
  legend.innerHTML = `
    <span class="activity-legend-item"><i style="background: var(--activity-commit);"></i>Commit</span>
    <span class="activity-legend-item"><i style="background: var(--activity-pr);"></i>PR</span>
    <span class="activity-legend-item"><i style="background: var(--activity-both);"></i>Commit + PR</span>
  `;

  if (!hasActivity) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty-message';
    empty.textContent = '시각화할 데이터가 없습니다.';
    container.append(titleNode, empty);
    return;
  }

  container.append(titleNode, grid, legend);
}

function renderTotals(container, totalCommitCount, totalPrCount) {
  container.innerHTML = '';

  const titleNode = document.createElement('h4');
  titleNode.className = 'detail-chart-title';
  titleNode.textContent = '누적 활동';

  const list = document.createElement('div');
  list.className = 'activity-total-grid';

  const commitCard = document.createElement('article');
  commitCard.className = 'activity-total-card';
  commitCard.innerHTML = `<p class="activity-total-label">총 Commit</p><p class="activity-total-value">${totalCommitCount}</p>`;

  const prCard = document.createElement('article');
  prCard.className = 'activity-total-card';
  prCard.innerHTML = `<p class="activity-total-label">총 PR</p><p class="activity-total-value">${totalPrCount}</p>`;

  list.append(commitCard, prCard);
  container.append(titleNode, list);
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

  setThumbnail(project);
  toggleLink(detailRepoLink, project.repoUrl);
  toggleLink(detailDemoLink, project.demoUrl);

  const commitByDay = countByDay(project.recentCommits || [], 'date_iso');
  const prEvents = [
    ...(Array.isArray(project?.pullRequests?.open)
      ? project.pullRequests.open.map((pr) => ({ date: pr.updated_at }))
      : []),
    ...(Array.isArray(project?.pullRequests?.recently_merged)
      ? project.pullRequests.recently_merged.map((pr) => ({ date: pr.merged_at }))
      : []),
  ];
  const prByDay = countByDay(prEvents, 'date');

  renderActivityHeatmap(activityHeatmap, commitByDay, prByDay);

  const totalCommitCount = Number.isFinite(project?.totalCommits)
    ? project.totalCommits
    : (Array.isArray(project?.recentCommits) ? project.recentCommits.length : 0);
  const totalPrCount = Number.isFinite(project?.pullRequests?.total_count)
    ? project.pullRequests.total_count
    : prEvents.length;
  renderTotals(activityTotals, totalCommitCount, totalPrCount);

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
    const response = await fetch('./data/projects.json');

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

function setRetryButtonVisible(isVisible) {
  if (!requestUpdateRetryButton) {
    return;
  }

  requestUpdateRetryButton.hidden = !isVisible;
}

function stopStatusPolling() {
  if (statusPollTimerId) {
    window.clearInterval(statusPollTimerId);
    statusPollTimerId = null;
  }
}

function setRequestRefreshLoadingState(isLoading) {
  if (!requestUpdateButton) {
    return;
  }

  requestUpdateButton.disabled = isLoading;
  requestUpdateButton.setAttribute('aria-busy', String(isLoading));
  requestUpdateButtonSpinner?.classList.toggle('is-visible', isLoading);

  if (requestUpdateButtonLabel) {
    requestUpdateButtonLabel.textContent = isLoading ? '요청 전송 중...' : '데이터 갱신 요청';
  }
}

function getRefreshErrorMessage(status) {
  if (status === 401 || status === 403) {
    return '권한이 없거나 갱신 키가 올바르지 않습니다.';
  }

  if (status === 429) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }

  if (status >= 500) {
    return '서버 오류로 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
  }

  return '업데이트 요청에 실패했습니다. 잠시 후 다시 시도해주세요.';
}

function getPollingFailureMessage(conclusion) {
  if (conclusion === 'failure') {
    return '업데이트 작업이 실패했습니다. 로그를 확인한 뒤 다시 시도해주세요.';
  }

  if (conclusion === 'cancelled') {
    return '업데이트 작업이 취소되었습니다. 잠시 후 다시 요청해주세요.';
  }

  if (conclusion === 'timed_out') {
    return '업데이트 작업이 시간 초과로 종료되었습니다. 다시 시도해주세요.';
  }

  return '업데이트 작업이 완료되지 못했습니다. 잠시 후 다시 시도해주세요.';
}

async function pollUpdateStatus() {
  if (!updateDispatchKey) {
    stopStatusPolling();
    return;
  }

  if (Date.now() - statusPollingStartedAt > STATUS_POLL_TIMEOUT_MS) {
    stopStatusPolling();
    setUpdateStatus('대기 시간이 초과되었습니다. 수동 재시도를 눌러 상태를 다시 확인해주세요.', 'error');
    setRetryButtonVisible(true);
    return;
  }

  try {
    const response = await fetch('/api/dispatch-update/status', {
      method: 'GET',
      headers: {
        'X-Dispatch-Key': updateDispatchKey,
      },
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));

      if (response.status === 404) {
        setUpdateStatus('업데이트 작업이 시작되기를 기다리는 중입니다...', 'info');
        return;
      }

      throw new Error(result.message || '업데이트 상태 조회에 실패했습니다.');
    }

    const result = await response.json();
    const createdAt = Date.parse(result.createdAt || '');
    if (Number.isFinite(createdAt) && createdAt + 10000 < updateDispatchRequestedAt) {
      setUpdateStatus('새로운 업데이트 작업이 시작되기를 기다리는 중입니다...', 'info');
      return;
    }

    if (result.status === 'completed') {
      stopStatusPolling();

      if (result.conclusion === 'success') {
        const reloadSucceeded = await loadProjects();
        if (reloadSucceeded) {
          setUpdateStatus('최신 데이터 반영 완료', 'success');
        } else {
          setUpdateStatus('업데이트는 완료됐지만 목록을 다시 불러오지 못했습니다. 잠시 후 새로고침해주세요.', 'error');
          setRetryButtonVisible(true);
        }
        return;
      }

      setUpdateStatus(getPollingFailureMessage(result.conclusion), 'error');
      setRetryButtonVisible(true);
      return;
    }

    setUpdateStatus('업데이트 작업 진행 중입니다. 잠시만 기다려주세요...', 'info');
  } catch (error) {
    stopStatusPolling();
    setUpdateStatus(error.message || '업데이트 상태를 확인하지 못했습니다.', 'error');
    setRetryButtonVisible(true);
  }
}

function startStatusPolling(dispatchKey) {
  updateDispatchKey = dispatchKey;
  updateDispatchRequestedAt = Date.now();
  statusPollingStartedAt = Date.now();

  stopStatusPolling();
  setRetryButtonVisible(false);
  void pollUpdateStatus();
  statusPollTimerId = window.setInterval(() => {
    void pollUpdateStatus();
  }, STATUS_POLL_INTERVAL_MS);
}

async function requestRefresh() {
  if (!requestUpdateButton) {
    return;
  }

  const dispatchKey = window.prompt('갱신 요청 키를 입력해주세요.');
  if (!dispatchKey) {
    setUpdateStatus('갱신 요청이 취소되었습니다.', 'info');
    return;
  }

  setRequestRefreshLoadingState(true);
  setUpdateStatus('업데이트 요청을 전송하고 있습니다...', 'info');

  try {
    const response = await fetch('/api/dispatch-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dispatch-Key': dispatchKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || getRefreshErrorMessage(response.status));
    }

    setUpdateStatus('업데이트 요청됨 · 작업 진행 중입니다. 데이터 반영까지 시간이 걸릴 수 있습니다.', 'success');
    startStatusPolling(dispatchKey);
  } catch (error) {
    setUpdateStatus(error.message || '업데이트 요청에 실패했습니다.', 'error');
    setRetryButtonVisible(false);
  } finally {
    setRequestRefreshLoadingState(false);
  }
}

function retryStatusPolling() {
  if (!updateDispatchKey) {
    setUpdateStatus('먼저 데이터 갱신 요청을 진행해주세요.', 'info');
    setRetryButtonVisible(false);
    return;
  }

  setUpdateStatus('업데이트 상태를 다시 확인하고 있습니다...', 'info');
  startStatusPolling(updateDispatchKey);
}

detailBackButton.addEventListener('click', showList);
requestUpdateButton?.addEventListener('click', requestRefresh);
requestUpdateRetryButton?.addEventListener('click', retryStatusPolling);

loadProjects();
