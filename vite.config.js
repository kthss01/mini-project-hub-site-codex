import { defineConfig } from 'vite';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const [, repoName = ''] = repository.split('/');
const isUserPage = repoName.endsWith('.github.io');

export default defineConfig({
  base: isUserPage ? '/' : '/mini-project-hub-site-codex/',
});
