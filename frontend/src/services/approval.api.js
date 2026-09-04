import { api } from './api';
export const approvalApi = {
  request: (data) => api.post('/approvals', data),
  getAll: () => api.get('/approvals'),
  getPending: () => api.get('/approvals/pending'),
  getById: (id) => api.get(`/approvals/${id}`),
  approve: (id, reason) => api.post(`/approvals/${id}/approve`, { reason }),
  reject: (id, reason) => api.post(`/approvals/${id}/reject`, { reason }),
};