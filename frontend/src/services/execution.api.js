import { api } from './api';
export const executionApi = {
  start: (data) => api.post('/executions', data),
  getAll: () => api.get('/executions'),
  getByTask: (taskId) => api.get(`/executions/by-task?taskId=${taskId}`),
  recoverStale: () => api.post('/executions/recover-stale'),
  getById: (id) => api.get(`/executions/${id}`),
  run: (id, taskId) => api.post(`/executions/${id}/run`, { taskId }),
  cancel: (id) => api.post(`/executions/${id}/cancel`),
};