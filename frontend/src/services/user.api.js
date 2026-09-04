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

export const userApi = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  deleteAccount: () => api.delete('/users/account'),
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const token = getToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/users/profile/avatar`, {
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
