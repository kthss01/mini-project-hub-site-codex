# Project Cache Data Schema (`data/projects.json`)

이 문서는 GitHub Actions가 생성하는 정적 캐시 데이터 구조를 정의합니다.
프론트엔드는 GitHub API를 직접 호출하지 않고 이 JSON만 읽어야 합니다.

## 1) 파일 생성 파이프라인

- 설정 파일: `projects.config.json`
- 생성 스크립트: `scripts/update-project-data.js`
- 워크플로: `.github/workflows/update-project-data.yml`
- 출력 파일: `data/projects.json`

## 2) 최상위 스키마

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-02-20T03:30:00.000Z",
  "timezone": "Asia/Seoul",
  "repos": []
}
```

- `schema_version`: 데이터 포맷 버전
- `generated_at`: 캐시 생성 시각(ISO)
- `timezone`: 날짜 그룹핑 기준 시간대 (`Asia/Seoul`)
- `repos`: 프로젝트(저장소)별 데이터 배열

## 3) 프로젝트(저장소) 객체

```json
{
  "id": "kthss01-mini-project-hub-site-codex",
  "owner": "kthss01",
  "repo": "mini-project-hub-site-codex",
  "title": "Mini Project Hub",
  "html_url": "https://github.com/kthss01/mini-project-hub-site-codex",
  "description": "...",
  "homepage": "https://kthss01.github.io/mini-project-hub-site-codex/",
  "default_branch": "main",
  "updated_at": "2026-02-20T03:28:10Z",
  "thumbnail": "public/images/mini-project-hub-site-codex.svg",
  "repoUrl": "https://github.com/kthss01/mini-project-hub-site-codex",
  "demoUrl": "https://kthss01.github.io/mini-project-hub-site-codex/",
  "recent_commits": [],
  "pull_requests": {
    "open_count": 2,
    "open": [],
    "recently_merged": []
  },
  "activity_last_7_days": [
    { "date": "2026-02-14", "count": 3 }
  ]
}
```

### A. Repo 메타
- `owner`, `repo`, `html_url`
- `description`, `homepage`, `default_branch`, `updated_at`

### B. 최근 커밋 요약 (`recent_commits`)
- 최대 10개
- 각 항목: `sha`, `message`, `author`, `date_iso`, `url`
- 상대시간은 프론트에서 `date_iso`로 계산

### C. PR 요약 (`pull_requests`)
- `open_count`
- `open`: 최대 10개 (`number`, `title`, `author`, `created_at`, `updated_at`, `url`)
- `recently_merged`: 최대 5개 (`number`, `title`, `merged_at`, `author`, `url`)

### D. 최근 7일 활동 (`activity_last_7_days`)
- 길이 7 고정
- 형식: `{ "date": "YYYY-MM-DD", "count": number }`
- 날짜 경계는 `Asia/Seoul` 기준

## 4) 프론트 상대시간 변환 예시

```js
export function formatRelativeTime(dateIso, locale = 'ko') {
  const date = new Date(dateIso);
  const diffMs = date.getTime() - Date.now();

  const units = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, unitMs] of units) {
    const value = Math.round(diffMs / unitMs);
    if (Math.abs(value) >= 1) {
      return rtf.format(value, unit);
    }
  }

  return rtf.format(0, 'minute');
}
```

## 5) 프론트 활동 그래프 사용 예시

```js
const labels = project.activity_last_7_days.map((d) => d.date);
const series = project.activity_last_7_days.map((d) => d.count);
```

차트 라이브러리(Chart.js, ECharts 등)에 `labels`/`series`를 그대로 연결할 수 있습니다.
