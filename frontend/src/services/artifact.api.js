import { api } from './api';

const API_BASE = '/api';
const TOKEN_KEY = 'aether_token';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const artifactApi = {
  create: (data) => api.post('/artifacts', data),
  getAll: () => api.get('/artifacts'),
  getByTask: (taskId) => api.get(`/artifacts/task/${taskId}`),
  getByExecution: (executionId) => api.get(`/artifacts/execution/${executionId}`),
  getById: (id) => api.get(`/artifacts/${id}`),
  download: (id) => api.get(`/artifacts/${id}/download`),
  delete: (id) => api.delete(`/artifacts/${id}`),
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/artifacts/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });

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
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }

    return res.json();
  },
};
