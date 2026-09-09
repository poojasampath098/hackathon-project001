const API_BASE = '/api';
const TOKEN_KEY = 'aether_token';
const REQUEST_TIMEOUT_MS = 60000;
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request(endpoint, options = {}) {
  const method = options.method || 'GET';
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log(`[API] ${method} ${API_BASE}${endpoint}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      credentials: 'include',
      headers,
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err && err.name === 'AbortError') {
      throw new ApiError(0, `Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    let message = `API Error: ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.message === 'string' && body.message) {
        message = body.message;
      }
    } catch {
      // non-JSON error body; fall back to generic status message
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export const api = {
  get: (url) => request(url),
  post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (url, data) => request(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (url) => request(url, { method: 'DELETE' }),
};