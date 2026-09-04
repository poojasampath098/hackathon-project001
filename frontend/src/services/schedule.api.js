import { api } from './api';
export const scheduleApi = {
  create: (data) => api.post('/schedules', data),
  getAll: () => api.get('/schedules'),
  getById: (id) => api.get(`/schedules/${id}`),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  toggle: (id, enabled) =>
    api.post(`/schedules/${id}/toggle`, typeof enabled === "boolean" ? { enabled } : {}),
  delete: (id) => api.delete(`/schedules/${id}`),
};
