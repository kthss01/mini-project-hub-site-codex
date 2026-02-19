import { createProjectCard } from './components/project-card.js';

const projectList = document.querySelector('#project-list');

async function loadProjects() {
  try {
    const response = await fetch('./data/projects.json');

    if (!response.ok) {
      throw new Error(`프로젝트 데이터를 불러오지 못했습니다: ${response.status}`);
    }

    const projects = await response.json();

    if (!Array.isArray(projects)) {
      throw new Error('프로젝트 데이터 형식이 올바르지 않습니다.');
    }

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

    fragment.appendChild(createProjectCard(project));
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

loadProjects();
