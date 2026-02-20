const GITHUB_API_BASE = 'https://api.github.com';

const rateLimitStore = globalThis.__dispatchRateLimitStore || new Map();
globalThis.__dispatchRateLimitStore = rateLimitStore;

const githubErrorMessages = {
  401: '업데이트 요청 인증에 실패했습니다. 운영자에게 문의해주세요.',
  403: '업데이트 요청 권한이 없거나 잠시 후 다시 시도해야 합니다.',
  404: '업데이트 워크플로를 찾지 못했습니다. 설정을 확인해주세요.',
  422: '업데이트 요청 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.',
};

function setCorsHeaders(req, res) {
  const allowOrigin = process.env.DISPATCH_ALLOWED_ORIGIN || '*';
  const requestOrigin = req.headers.origin;

  if (allowOrigin === '*' || requestOrigin === allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin === '*' ? '*' : requestOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dispatch-Key');
  res.setHeader('Access-Control-Max-Age', '600');
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req, limitPerMinute) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `${ip}:${Math.floor(now / 60000)}`;
  const count = rateLimitStore.get(key) || 0;

  rateLimitStore.set(key, count + 1);

  if (rateLimitStore.size > 5000) {
    const minWindow = Math.floor(now / 60000) - 3;
    for (const mapKey of rateLimitStore.keys()) {
      const window = Number(mapKey.split(':').pop());
      if (!Number.isFinite(window) || window < minWindow) {
        rateLimitStore.delete(mapKey);
      }
    }
  }

  return count < limitPerMinute;
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
  return githubErrorMessages[statusCode] || '업데이트 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
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

  const limitPerMinute = Number.parseInt(process.env.DISPATCH_RATE_LIMIT_PER_MINUTE || '10', 10);
  if (!checkRateLimit(req, Number.isFinite(limitPerMinute) ? limitPerMinute : 10)) {
    return res.status(429).json({ message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  const githubToken = process.env.GITHUB_WORKFLOW_DISPATCH_TOKEN;
  const repository = parseRepository(process.env.GITHUB_REPOSITORY || '');

  if (!githubToken || !repository) {
    return res.status(500).json({ message: '서버 설정이 완료되지 않았습니다.' });
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${repository.owner}/${repository.repo}/actions/workflows/update-project-data.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: process.env.DISPATCH_REF || 'main',
      }),
    },
  );

  if (!response.ok) {
    return res.status(response.status).json({ message: mapErrorToMessage(response.status) });
  }

  return res.status(202).json({ message: '업데이트 요청이 접수되었습니다.' });
}
