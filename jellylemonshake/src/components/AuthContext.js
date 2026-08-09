import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext();

const createGuestUser = () => {
  const stored = localStorage.getItem('guestUser');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem('guestUser');
    }
  }
  const guestUser = {
    id: 'guest-' + Math.random().toString(36).substring(2, 10),
    username: 'Guest' + Math.floor(Math.random() * 10000),
    isGuest: true,
  };
  localStorage.setItem('guestUser', JSON.stringify(guestUser));
  return guestUser;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getInitialSession = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await api.getCurrentUser();
          if (response.success) {
            setUser(response.user);
            setLoading(false);
            return;
          }
          localStorage.removeItem('authToken');
        }
        setUser(createGuestUser());
      } catch (error) {
        console.error('Error getting initial session:', error);
        localStorage.removeItem('authToken');
        setUser(createGuestUser());
      }
      setLoading(false);
    };

    getInitialSession();
  }, []);

  const login = async (email, password) => {
    try {
      // Add basic validation
      if (!email?.trim() || !password?.trim()) {
        throw new Error('Email and password are required');
      }
      
      // Better email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        throw new Error('Please enter a valid email address');
      }

      const response = await api.login({ 
        email: email.trim(), 
        password: password.trim() 
      });
      
      if (response.success) {
        setUser(response.user);
        localStorage.setItem('authToken', response.token);
        localStorage.removeItem('guestUser');
        return response.user;
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  const signup = async ({ name, email, password }) => {
    try {
      console.log('Signup called with:', { name, email, passwordLength: password?.length });
      
      // Add basic validation
      if (!email?.trim() || !password?.trim()) {
        throw new Error('Email and password are required');
      }
      
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }
      
      // Better email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        throw new Error('Please enter a valid email address');
      }

      const response = await api.register({ 
        email: email.trim(), 
        password: password.trim(),
        username: name?.trim() || email.trim().split('@')[0]
      });
      
      if (response.success) {
        setUser(response.user);
        localStorage.setItem('authToken', response.token);
        localStorage.removeItem('guestUser');
        return { user: response.user, needsEmailConfirmation: false };
      } else {
        throw new Error(response.message || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      throw err;
    }
  };

  const continueAsGuest = () => {
    localStorage.removeItem('authToken');
    setUser(createGuestUser());
  };

  const logout = async () => {
    localStorage.removeItem('authToken');
    setUser(createGuestUser());
  };

  const isAuthenticated = Boolean(user && !user.isGuest);
  // authUser = registered account only (null for guests)
  // user = whoever is using the app right now (guest OR registered)
  const authUser = isAuthenticated ? user : null;

  return (
    <AuthContext.Provider
      value={{ user, authUser, isAuthenticated, loading, login, signup, logout, continueAsGuest }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
