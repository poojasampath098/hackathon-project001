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
  googleSignIn: (credential) => api.post('/auth/google', { credential }),
};
