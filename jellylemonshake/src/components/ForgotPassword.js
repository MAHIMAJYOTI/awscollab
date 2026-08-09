import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import "../styles/components/ForgotPassword.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setDevResetUrl("");
    setLoading(true);

    const result = await api.forgotPassword(email.trim());
    setLoading(false);

    if (!result.success) {
      setError(result.message || "Unable to send reset link.");
      return;
    }

    setMessage(result.message);
    if (result.devResetUrl) {
      setDevResetUrl(result.devResetUrl);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Forgot Password</h2>
        <p className="auth-subtitle">Enter your email to reset your password</p>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-message auth-error">{error}</p>}

        {devResetUrl && (
          <div className="dev-reset-link">
            <p>Local dev — no email sent. Use this link:</p>
            <a href={devResetUrl}>{devResetUrl}</a>
          </div>
        )}

        {!message && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/login" className="auth-link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
