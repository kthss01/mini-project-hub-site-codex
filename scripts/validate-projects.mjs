import { readFile } from 'node:fs/promises';

const DATA_FILE = new URL('../data/projects.json', import.meta.url);
const requiredFields = ['id', 'title', 'description', 'thumbnail', 'repoUrl'];

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

async function main() {
  const raw = await readFile(DATA_FILE, 'utf8');
  const projects = JSON.parse(raw);

  if (!Array.isArray(projects)) {
    fail('data/projects.json 최상위 값은 배열이어야 합니다.');
    return;
  }

  const ids = new Set();

  projects.forEach((project, index) => {
    const pointer = `projects[${index}]`;

    if (typeof project !== 'object' || project === null || Array.isArray(project)) {
      fail(`${pointer} 는 객체여야 합니다.`);
      return;
    }

    for (const field of requiredFields) {
      if (!isNonEmptyString(project[field])) {
        fail(`${pointer}.${field} 는 비어 있지 않은 문자열이어야 합니다.`);
      }
    }

    if (isNonEmptyString(project.id)) {
      if (ids.has(project.id)) {
        fail(`${pointer}.id '${project.id}' 는 중복될 수 없습니다.`);
      }
      ids.add(project.id);
    }

    if (isNonEmptyString(project.thumbnail) && !project.thumbnail.startsWith('public/images/')) {
      fail(`${pointer}.thumbnail 은 public/images/ 경로를 사용해야 합니다.`);
    }

    if (isNonEmptyString(project.repoUrl) && !isValidHttpUrl(project.repoUrl)) {
      fail(`${pointer}.repoUrl 은 유효한 http(s) URL이어야 합니다.`);
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
