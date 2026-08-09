const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const isDevMode = () =>
  process.env.NODE_ENV === 'development' || process.env.USE_LOCAL_STORE === 'true';

const genericResetMessage =
  'If this email is registered, you will receive a password reset link shortly.';
// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Validate required fields
    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and username are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUserByEmail = await User.findByEmail(email);
    if (existingUserByEmail) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const existingUserByUsername = await User.findByUsername(username);
    if (existingUserByUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase().trim(),
      username: username.trim(),
      password: password
    });

    await user.save();

    // Generate a simple token (in production, use JWT)
    const token = `token_${user.userId}_${Date.now()}`;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: user.toJSON(),
      token: token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Find user by email
    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Validate password
    if (!(await user.validatePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate a simple token (in production, use JWT)
    const token = `token_${user.userId}_${Date.now()}`;

    res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      token: token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }

    // Extract user ID from token (simple implementation)
    const userId = token.split('_')[1];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }

    // Extract user ID from token
    const userId = token.split('_')[1];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { username, profile } = req.body;
    const updateData = {};

    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUser = await User.findByUsername(username);
      if (existingUser && existingUser.userId !== user.userId) {
        return res.status(409).json({
          success: false,
          message: 'Username is already taken'
        });
      }
      updateData.username = username.trim();
    }

    if (profile) {
      updateData.profile = { ...user.profile, ...profile };
    }

    if (Object.keys(updateData).length > 0) {
      await user.update(updateData);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }

    // Extract user ID from token
    const userId = token.split('_')[1];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate current password
    if (!(await user.validatePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await user.update({ password: newPassword });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findByEmail(normalizedEmail);
    let devResetUrl;

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      await user.update({ resetToken, resetTokenExpires });

      devResetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;
      console.log(`Password reset requested for ${normalizedEmail}`);
      if (isDevMode()) {
        console.log(`Dev reset link: ${devResetUrl}`);
      }
      // Production: send devResetUrl via SES/SMTP here
    }

    const response = {
      success: true,
      message: genericResetMessage,
    };

    if (isDevMode() && devResetUrl) {
      response.devResetUrl = devResetUrl;
    }

    res.json(response);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to process password reset. Please try again.',
    });
  }
});

// Validate reset token
router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await User.findByResetToken(req.params.token);
    if (!user || !user.isResetTokenValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link. Request a new one.',
      });
    }

    res.json({ success: true, message: 'Reset link is valid' });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to validate reset link.',
    });
  }
});

// Complete password reset
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const user = await User.findByResetToken(token);
    if (!user || !user.isResetTokenValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link. Request a new one.',
      });
    }

    await user.update({
      password: newPassword,
      resetToken: null,
      resetTokenExpires: null,
    });

    res.json({
      success: true,
      message: 'Password reset successfully. You can log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to reset password. Please try again.',
    });
  }
});

module.exports = router;