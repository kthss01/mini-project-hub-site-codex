const FALLBACK_THUMBNAIL = 'public/images/default-thumbnail.svg';

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

export function createProjectCard(project) {
  const article = document.createElement('article');
  article.className = 'project-card';
  article.setAttribute('role', 'listitem');

  const link = document.createElement('a');
  link.className = 'project-card-link';
  link.href = project.repoUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${project.title} 저장소 열기 (새 탭)`);

  const thumbnailFrame = document.createElement('div');
  thumbnailFrame.className = 'project-thumbnail-frame';

  const thumbnail = document.createElement('img');
  thumbnail.className = 'project-thumbnail';
  thumbnail.src = project.thumbnail?.trim() || FALLBACK_THUMBNAIL;
  thumbnail.alt = `${project.title} 썸네일`;
  thumbnail.loading = 'lazy';

  thumbnail.addEventListener('error', () => {
    if (thumbnail.dataset.fallbackApplied === 'true') {
      thumbnailFrame.classList.add('is-thumbnail-error');
      thumbnail.remove();
      return;
    }

    thumbnail.dataset.fallbackApplied = 'true';
    thumbnail.src = FALLBACK_THUMBNAIL;
  });

  thumbnailFrame.appendChild(thumbnail);

  const body = document.createElement('div');
  body.className = 'project-body';

  const title = document.createElement('h3');
  title.textContent = project.title;

  const description = document.createElement('p');
  description.textContent = project.description || '프로젝트 설명이 없습니다.';

  body.append(title, description);

  const tagList = createTagList(project.tags);
  if (tagList) {
    body.appendChild(tagList);
  }

  link.append(thumbnailFrame, body);
  article.appendChild(link);

  return article;
}
