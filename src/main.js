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
const commitChart = document.querySelector('#commit-chart');
const prChart = document.querySelector('#pr-chart');

function normalizeProjects(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.repos)) {
    return payload.repos.map((repo) => ({
      id: repo.id || `${repo.owner}-${repo.repo}`,
      title: repo.title || `${repo.owner}/${repo.repo}`,
      description: repo.description || '프로젝트 설명이 없습니다.',
      thumbnail: repo.thumbnail || 'public/images/default-thumbnail.svg',
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

function renderBarChart(container, title, countMap) {
  container.innerHTML = '';

  const titleNode = document.createElement('h4');
  titleNode.className = 'detail-chart-title';
  titleNode.textContent = title;

  const days = Object.keys(countMap).sort().slice(-10);

  if (days.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty-message';
    empty.textContent = '시각화할 데이터가 없습니다.';
    container.append(titleNode, empty);
    return;
  }

  const maxValue = Math.max(...days.map((day) => countMap[day]), 1);
  const list = document.createElement('ul');
  list.className = 'detail-chart-list';

  days.forEach((day) => {
    const item = document.createElement('li');
    item.className = 'detail-chart-item';

    const label = document.createElement('span');
    label.className = 'detail-chart-label';
    label.textContent = day.slice(5);

    const bar = document.createElement('span');
    bar.className = 'detail-chart-bar';
    bar.style.setProperty('--bar-width', `${Math.round((countMap[day] / maxValue) * 100)}%`);

    const value = document.createElement('span');
    value.className = 'detail-chart-value';
    value.textContent = String(countMap[day]);

    bar.appendChild(value);
    item.append(label, bar);
    list.appendChild(item);
  });

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

  renderBarChart(commitChart, '최근 Commit 수', countByDay(project.recentCommits || [], 'date_iso'));

  const prEvents = [
    ...(Array.isArray(project?.pullRequests?.open)
      ? project.pullRequests.open.map((pr) => ({ date: pr.updated_at }))
      : []),
    ...(Array.isArray(project?.pullRequests?.recently_merged)
      ? project.pullRequests.recently_merged.map((pr) => ({ date: pr.merged_at }))
      : []),
  ];
  renderBarChart(prChart, '최근 PR 수', countByDay(prEvents, 'date'));

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
  } catch (error) {
    renderError(error);
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

detailBackButton.addEventListener('click', showList);

loadProjects();
