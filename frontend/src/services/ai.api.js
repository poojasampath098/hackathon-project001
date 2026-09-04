import { api } from './api';
export const aiApi = {
  chat: (message, artifactId, threadId) => {
    const ids = Array.isArray(artifactId)
      ? artifactId
      : artifactId
      ? [artifactId]
      : undefined;
    return api.post('/ai/chat', { message, artifactIds: ids, threadId });
  },
  history: (threadId) =>
    api.get(`/ai/chat/history${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`),
  research: (query) => api.post('/ai/research', { query }),
  generate: (data) => api.post('/ai/generate', data),
  analyze: (taskId, focus) => api.post(`/ai/analyze/${taskId}`, focus ? { focus } : {}),
};
