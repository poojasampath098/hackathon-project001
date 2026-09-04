import { api } from './api';
export const activityApi = {
  getAll: () => api.get('/activities'),
  getByTask: (taskId) => api.get(`/activities/task/${taskId}`),
  getByExecution: (executionId) => api.get(`/activities/execution/${executionId}`),
  delete: (id) => api.delete(`/activities/${id}`),
  markRead: (id) => api.patch(`/activities/${id}/read`),
  markAllRead: () => api.post('/activities/read-all'),
};
