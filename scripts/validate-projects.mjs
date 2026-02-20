import { readFile } from 'node:fs/promises';

const DATA_FILE = new URL('../data/projects.json', import.meta.url);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeProjects(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.repos)) {
    return payload.repos;
  }

  return null;
}

async function main() {
  const raw = await readFile(DATA_FILE, 'utf8');
  const payload = JSON.parse(raw);
  const projects = normalizeProjects(payload);

  if (!projects) {
    fail('data/projects.json 최상위 값은 배열 또는 repos 배열을 가진 객체여야 합니다.');
    return;
  }

  const ids = new Set();

  projects.forEach((project, index) => {
    const pointer = `projects[${index}]`;

    if (typeof project !== 'object' || project === null || Array.isArray(project)) {
      fail(`${pointer} 는 객체여야 합니다.`);
      return;
    }

    const title = project.title || `${project.owner || ''}/${project.repo || ''}`;
    if (!isNonEmptyString(title)) {
      fail(`${pointer}.title 또는 owner/repo 중 하나는 필요합니다.`);
    }

    if (!isNonEmptyString(project.repoUrl) && !isNonEmptyString(project.html_url) && !isNonEmptyString(project.demoUrl)) {
      fail(`${pointer} 는 repoUrl/html_url/demoUrl 중 하나 이상이 필요합니다.`);
    }

    if (isNonEmptyString(project.id)) {
      if (ids.has(project.id)) {
        fail(`${pointer}.id '${project.id}' 는 중복될 수 없습니다.`);
      }
      ids.add(project.id);
    }

    if (isNonEmptyString(project.repoUrl) && !isValidHttpUrl(project.repoUrl)) {
      fail(`${pointer}.repoUrl 은 유효한 http(s) URL이어야 합니다.`);
    }

    if (isNonEmptyString(project.html_url) && !isValidHttpUrl(project.html_url)) {
      fail(`${pointer}.html_url 은 유효한 http(s) URL이어야 합니다.`);
    }

    if (isNonEmptyString(project.demoUrl) && !isValidHttpUrl(project.demoUrl)) {
      fail(`${pointer}.demoUrl 은 유효한 http(s) URL이어야 합니다.`);
    }

    if (Array.isArray(project.activity_last_7_days)) {
      if (project.activity_last_7_days.length !== 7) {
        fail(`${pointer}.activity_last_7_days 는 7개 항목이어야 합니다.`);
      }
    }
  });

  if (process.exitCode === 1) {
    return;
  }

  console.log(`✅ ${projects.length}개 프로젝트 데이터 검증 통과`);
}

main().catch((error) => {
  fail(`검증 스크립트 실행 실패: ${error.message}`);
});
