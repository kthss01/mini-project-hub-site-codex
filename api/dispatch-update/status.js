const GITHUB_API_BASE = 'https://api.github.com';

const githubErrorMessages = {
  401: '워크플로 상태 조회 인증에 실패했습니다. 운영자에게 문의해주세요.',
  403: '워크플로 상태 조회 권한이 없거나 잠시 후 다시 시도해야 합니다.',
  404: '업데이트 워크플로를 찾지 못했습니다. 설정을 확인해주세요.',
  422: '워크플로 상태 조회 요청 형식이 올바르지 않습니다.',
};

function setCorsHeaders(req, res) {
  const allowOrigin = process.env.DISPATCH_ALLOWED_ORIGIN || '*';
  const requestOrigin = req.headers.origin;

  if (allowOrigin === '*' || requestOrigin === allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin === '*' ? '*' : requestOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dispatch-Key');
  res.setHeader('Access-Control-Max-Age', '600');
}

function parseRepository(repoString) {
  if (typeof repoString !== 'string') {
    return null;
  }

  const [owner, repo] = repoString.split('/');
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function mapErrorToMessage(statusCode) {
  return githubErrorMessages[statusCode] || '워크플로 상태를 조회하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: '허용되지 않은 메서드입니다.' });
  }

  const expectedDispatchKey = process.env.DISPATCH_AUTH_KEY;
  if (!expectedDispatchKey) {
    return res.status(500).json({ message: '서버 설정이 완료되지 않았습니다.' });
  }

  const receivedDispatchKey = req.headers['x-dispatch-key'];
  if (receivedDispatchKey !== expectedDispatchKey) {
    return res.status(401).json({ message: '인증에 실패했습니다.' });
  }

  const githubToken = process.env.GITHUB_WORKFLOW_DISPATCH_TOKEN;
  const repository = parseRepository(process.env.GITHUB_REPOSITORY || '');

  if (!githubToken || !repository) {
    return res.status(500).json({ message: '서버 설정이 완료되지 않았습니다.' });
  }

  const query = new URLSearchParams({
    per_page: '1',
    event: 'workflow_dispatch',
  });

  const dispatchRef = process.env.DISPATCH_REF;
  if (dispatchRef) {
    query.set('branch', dispatchRef);
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${repository.owner}/${repository.repo}/actions/workflows/update-project-data.yml/runs?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );

  if (!response.ok) {
    return res.status(response.status).json({ message: mapErrorToMessage(response.status) });
  }

  const payload = await response.json();
  const [latestRun] = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];

  if (!latestRun) {
    return res.status(404).json({ message: '최근 실행된 업데이트 워크플로를 찾지 못했습니다.' });
  }

  return res.status(200).json({
    id: latestRun.id,
    status: latestRun.status,
    conclusion: latestRun.conclusion,
    htmlUrl: latestRun.html_url,
    runNumber: latestRun.run_number,
    createdAt: latestRun.created_at,
    updatedAt: latestRun.updated_at,
  });
};
