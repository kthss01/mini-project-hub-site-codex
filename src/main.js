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
    projectList.innerHTML = `<p class="error-message">${error.message}</p>`;
  }
}

function renderProjects(projects) {
  const fragment = document.createDocumentFragment();

  projects.forEach((project) => {
    if (!project?.title || !project?.repoUrl) {
      return;
    }

    fragment.appendChild(createProjectCard(project));
  });

  projectList.replaceChildren(fragment);
}

loadProjects();
