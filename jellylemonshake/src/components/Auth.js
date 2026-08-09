import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { PasswordInput } from "./PasswordInput";
import "../styles/components/Auth.css";

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login, continueAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleGuest = (e) => {
    e.preventDefault();
    continueAsGuest();
    navigate('/');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    console.log('Login form values:', { email: email.trim(), password: password.trim(), emailLength: email.trim().length, passwordLength: password.trim().length });

    // Temporary: Skip validation to test
    if (email.trim().length === 0 || password.trim().length === 0) {
      setError(`Email: "${email.trim()}" (${email.trim().length}) | Password: "${password.trim()}" (${password.trim().length}) - Please fill in all fields`);
      setIsLoading(false);
      return;
    }

    try {
      const result = await login(email, password);
      if (result) {
        navigate("/");
      }
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Log In</h2>
        <p className="auth-subtitle">
          Welcome back! Please log in to access your account.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <div className="auth-link">
          <span className="auth-link-text">
            <Link to="/forgot-password">Forgot Password?</Link>
            {' • '}
            <Link to="/register">Create Account</Link>
          </span>
        </div>

        <div className="auth-guest">
          <button type="button" onClick={handleGuest} className="guest-link">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
};
/*sohamghosh-jellylemonshake-23bps1146 */
export const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const { signup, continueAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleGuest = (e) => {
    e.preventDefault();
    continueAsGuest();
    navigate('/');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    console.log('Register form values:', { 
      name: name.trim(), 
      email: email.trim(), 
      password: password.trim(), 
      confirmPassword: confirmPassword.trim(),
      nameLength: name.trim().length,
      emailLength: email.trim().length,
      passwordLength: password.trim().length,
      confirmPasswordLength: confirmPassword.trim().length
    });

    // Detailed validation with specific error messages
    if (name.trim().length === 0) {
      setError("Name is required");
      setIsLoading(false);
      return;
    }
    if (email.trim().length === 0) {
      setError("Email is required");
      setIsLoading(false);
      return;
    }
    if (password.trim().length === 0) {
      setError("Password is required");
      setIsLoading(false);
      return;
    }
    if (confirmPassword.trim().length === 0) {
      setError("Please confirm your password");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const result = await signup({ name, email, password });
      console.log('Signup result:', result);
      
      if (result.needsEmailConfirmation) {
        setVerificationSent(true);
        setError("");
        console.log('Email verification sent');
      } else if (result.user) {
        console.log('User registered and logged in:', result.user);
        navigate("/");
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">
          Sign up to save your chats and access them from any device.
        </p>

        {error && <div className="auth-error">{error}</div>}
        
        {verificationSent && (
          <div className="auth-success">
            ✅ Verification email sent! Please check your inbox and click the verification link to complete your registration.
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">Name</label>
            <input
              type="text"
              id="name"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password" className="form-label">Confirm Password</label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <div className="auth-link">
          <span className="auth-link-text">
            Already have an account? <Link to="/login">Log In</Link>
          </span>
        </div>

        <div className="auth-guest">
          <button type="button" onClick={handleGuest} className="guest-link">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
};
