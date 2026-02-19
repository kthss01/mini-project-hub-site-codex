# 프로젝트 데이터 스키마 및 렌더링 규칙

## 1) 데이터 파일 위치
- 기본 파일: `data/projects.json`
- JS 모듈 사용이 필요할 때만 `data/projects.js`로 전환 (예: 빌드 시 동적 데이터 가공)

## 2) 카드 렌더링 최소 필드
각 프로젝트 객체는 아래 필드를 기준으로 렌더링합니다.

- `id` (string, 필수): 고유 식별자
- `title` (string, 필수): 프로젝트명
- `description` (string, 필수): 카드용 1~2줄 설명
- `thumbnail` (string, 필수): 썸네일 이미지 경로 (`project-thumbnail.svg` 파일명 기준, 경로 포함 가능)
- `repoUrl` (string, 필수): GitHub 저장소 URL
- `demoUrl` (string, 선택): 배포 링크
- `tags` (string[], 필수): 기술 스택/주제 배열
- `status` (`completed` | `in-progress`, 필수): 진행 상태
- `updatedAt` (string, 필수): 정렬용 날짜 (`YYYY-MM-DD` 권장)

### 권장 확장 필드
- `featured` (boolean, 선택): 메인 노출 우선순위 플래그

## 3) 정렬 규칙
카드 목록 정렬은 아래 우선순위를 따릅니다.

1. `featured === true` 항목을 먼저 배치
2. 같은 그룹 내에서 `updatedAt` 최신순(내림차순)
3. 동일 날짜일 경우 `title` 오름차순(사전순)

## 4) 빈 값/누락 값 처리 규칙
- `thumbnail`이 빈 문자열이거나 누락된 경우:
  - 기본 이미지 경로 `"public/images/default-thumbnail.svg"` 사용
- `thumbnail`은 아래 형식 중 하나를 사용:
  - `"project-thumbnail.svg"`
  - `"<repo>/docs/assets/project-thumbnail.svg"` 또는 기타 경로 포함 `project-thumbnail.svg`
  - `"public/images/<name>.svg"` (레거시 호환)
- `demoUrl`이 없으면:
  - "Live Demo" 버튼/링크를 숨김
- `tags`가 비어 있으면:
  - 빈 배열(`[]`)로 처리하고 태그 영역은 렌더링하지 않음
- `description`이 너무 길면:
  - UI에서 2줄 말줄임 처리
- `updatedAt` 형식이 잘못된 경우:
  - 파싱 실패 항목은 목록 하단으로 배치하고, 데이터 수정 대상로 로그 표시

## 5) 운영 가이드
- 신규 항목 추가 시 `id` 중복 여부를 먼저 확인
- 날짜는 가능한 UTC 기준 `YYYY-MM-DD`로 통일
- `status`는 반드시 `completed` 또는 `in-progress`만 사용
