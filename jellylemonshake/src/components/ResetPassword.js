import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { PasswordInput } from "./PasswordInput";
import "../styles/components/ForgotPassword.css";
import "../styles/components/Auth.css";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setError("Missing reset token. Request a new link from Forgot Password.");
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await api.validateResetToken(token);
      if (!cancelled) {
        setTokenValid(result.success);
        if (!result.success) {
          setError(result.message || "Invalid or expired reset link.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await api.resetPassword({ token, newPassword });
    setLoading(false);

    if (result.success) {
      setMessage(result.message);
      setTimeout(() => navigate("/login"), 2000);
      return;
    }

    setError(result.message || "Unable to reset password.");
  };

  if (tokenValid === null) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p className="auth-subtitle">Checking reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Reset Password</h2>
        <p className="auth-subtitle">Choose a new password for your account</p>

        {message && <p className="auth-message">{message}</p>}
        {error && <p className="auth-message auth-error">{error}</p>}

        {tokenValid && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
                autoComplete="new-password"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                autoComplete="new-password"
                className="form-input"
              />
            </div>
            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? "Saving..." : "Reset Password"}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/forgot-password" className="auth-link">
            Request new link
          </Link>
          <span>·</span>
          <Link to="/login" className="auth-link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
