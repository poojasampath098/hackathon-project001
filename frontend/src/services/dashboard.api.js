import { api } from './api';
export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary'),
};
