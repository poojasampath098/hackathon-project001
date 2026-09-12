import { api } from './api';
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  sendOtp: (email) => api.post('/auth/send-otp', { email }),
  verifyOtp: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
  sendRegistrationOtp: (email) => api.post('/auth/register/send-otp', { email }),
  verifyRegistrationOtp: (email, otp) => api.post('/auth/register/verify-otp', { email, otp }),
  requestPasswordResetOtp: (email) => api.post('/auth/password-reset/request-otp', { email }),
  verifyPasswordResetOtp: (email, otp) => api.post('/auth/password-reset/verify-otp', { email, otp }),
  resetPassword: (data) => api.post('/auth/password-reset/reset', data),
  googleSignIn: (credential) => api.post('/auth/google', { credential }),
};
