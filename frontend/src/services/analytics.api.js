import { api } from './api';
export const analyticsApi = {
  get: () => api.get('/analytics'),
};
