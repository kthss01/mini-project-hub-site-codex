# Contributing

## 프로젝트 추가 방법

새 프로젝트를 목록에 추가할 때는 아래 절차를 따라주세요.

1. `public/images/`에 프로젝트 썸네일 이미지를 추가합니다.
2. `data/projects.json`에 프로젝트 객체 1개를 추가합니다.
   - 필수 필드: `id`, `title`, `description`, `thumbnail`, `repoUrl`
   - `thumbnail`은 `public/images/...` 경로를 사용합니다.
3. 로컬에서 데이터 검증을 실행해 누락/형식 오류를 확인합니다.
   - `npm run lint:data`
4. 로컬에서 화면 확인 후 커밋/푸시합니다.
5. GitHub Actions에서 배포 워크플로우가 성공했는지 확인합니다.

### 예시 객체

```json
{
  "id": "my-new-project",
  "title": "My New Project",
  "description": "프로젝트 한 줄 설명",
  "thumbnail": "public/images/my-new-project.png",
  "repoUrl": "https://github.com/your-org/my-new-project"
}
```
