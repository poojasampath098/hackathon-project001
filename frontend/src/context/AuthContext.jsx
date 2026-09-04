import { createContext, useState, useEffect } from 'react';
import { authApi } from '../services/auth.api';

const TOKEN_KEY = 'aether_token';
const USER_KEY = 'aether_user';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable; ignore
  }
}

function loadCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // storage unavailable; ignore
  }
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id || user._id || null,
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    avatar: user.avatar || user.avatarUrl || null,
    emailVerified: !!user.emailVerified,
  };
}

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      persistUser(null);
      setUser(null);
      setLoading(false);
      return undefined;
    }
    setUser(loadCachedUser());
    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        const restoredUser = normalizeUser(res?.data?.user);
        if (restoredUser) {
          setUser(restoredUser);
          persistUser(restoredUser);
        } else {
          setToken(null);
          persistUser(null);
          setUser(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        persistUser(null);
        setUser(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared session establishment used by every sign-in path (login, registered
  // ticket, OTP verification, and Google) so token/user storage stays identical.
  const establishSession = (token, authUser) => {
    setToken(token);
    persistUser(authUser);
    setUser(authUser);
  };

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const token = res?.data?.token;
    const authUser = normalizeUser(res?.data?.user);
    if (!token) throw new Error('Login response did not include a token');
    establishSession(token, authUser);
    return { success: true, data: res.data };
  };

  const register = async (data) => {
    const res = await authApi.register({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      verificationTicket: data.verificationTicket,
    });
    // When the server returns a login token (verified-ticket flow), establish
    // the session immediately just like login/verifyOtp do. The old no-ticket
    // fallback returns no token and is left untouched.
    const token = res?.data?.token;
    if (token) {
      const authUser = normalizeUser(res?.data?.user);
      establishSession(token, authUser);
      return { success: true, data: res.data, user: authUser };
    }
    return res;
  };

  const sendOtp = async (email) => {
    return authApi.sendOtp(email);
  };

  const verifyOtp = async (email, otp) => {
    const res = await authApi.verifyOtp(email, otp);
    const token = res?.data?.token;
    const authUser = normalizeUser(res?.data?.user);
    if (!token) throw new Error('Verification response did not include a token');
    establishSession(token, authUser);
    return { success: true, data: res.data, user: authUser };
  };

  // Pre-registration email verification (no account exists yet). These just
  // pass through to the dedicated endpoints; the ticket from verifyRegistrationOtp
  // is short-lived and only used transiently during the registration steps.
  const sendRegistrationOtp = async (email) => {
    return authApi.sendRegistrationOtp(email);
  };

  const verifyRegistrationOtp = async (email, otp) => {
    return authApi.verifyRegistrationOtp(email, otp);
  };

  const logout = async () => {
    setToken(null);
    persistUser(null);
    setUser(null);
    try {
      await authApi.logout();
    } catch {
      // server-side failure ignored; local session already cleared
    }
  };

  const updateUser = (updates) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...updates };
      persistUser(next);
      return next;
    });
  };

  // Google sign-in: the page sends the Google Identity Services ID token; the
  // server verifies it and returns the same { user, token } shape as login.
  const loginWithGoogle = async (credential) => {
    const res = await authApi.googleSignIn(credential);
    const token = res?.data?.token;
    const authUser = normalizeUser(res?.data?.user);
    if (!token) throw new Error('Google sign-in response did not include a token');
    establishSession(token, authUser);
    return { success: true, data: res.data, user: authUser };
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, sendOtp, verifyOtp, sendRegistrationOtp, verifyRegistrationOtp, logout, updateUser, loginWithGoogle, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}