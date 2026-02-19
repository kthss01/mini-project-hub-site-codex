export function createProjectCard(project) {
  const article = document.createElement('article');
  article.className = 'project-card';
  article.setAttribute('role', 'listitem');

  const thumbnailSrc = project.thumbnail?.trim() || 'public/images/default-thumbnail.svg';
  const altText = `${project.title} 썸네일`;

  article.innerHTML = `
    <a
      class="project-card-link"
      href="${project.repoUrl}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${project.title} 저장소 열기 (새 탭)"
    >
      <img class="project-thumbnail" src="${thumbnailSrc}" alt="${altText}" loading="lazy" />
      <div class="project-body">
        <h3>${project.title}</h3>
        <p>${project.description || '프로젝트 설명이 없습니다.'}</p>
      </div>
    </a>
  `;

  return article;
}
