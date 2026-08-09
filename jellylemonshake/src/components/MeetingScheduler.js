import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../config';
import '../styles/components/MeetingScheduler.css';

const getParticipantName = (p) => {
  if (typeof p === 'string') return p;
  return p?.username || p?.email || '';
};

function MeetingScheduler({ roomId, participants, onClose, onMeetingCreated }) {
  const { user, authUser, isAuthenticated } = useAuth();
  
  if (!user) {
    return (
      <div className="error-message">
        Please wait for your session to load.
      </div>
    );
  }
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduledTime: '',
    duration: 60,
    selectedParticipants: [],
    requirePassword: false,
    password: '',
    allowScreenShare: true,
    allowChat: true,
    maxParticipants: 50,
    isRecurring: false,
    recurringFrequency: 'weekly',
    recurringInterval: 1,
    recurringEndDate: ''
  });
  const organizerName = authUser?.username || authUser?.email || user?.username || user?.email || 'Guest';

  const roomParticipants = (participants || [])
    .map(getParticipantName)
    .filter(Boolean);

  const otherParticipants = roomParticipants.filter(
    (name) => name !== organizerName
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Set minimum date to current time
  useEffect(() => {
    const now = new Date();
    const minDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    
    if (!formData.scheduledTime) {
      setFormData(prev => ({
        ...prev,
        scheduledTime: minDateTime
      }));
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleParticipantToggle = (participantUsername) => {
    setFormData(prev => ({
      ...prev,
      selectedParticipants: prev.selectedParticipants.includes(participantUsername)
        ? prev.selectedParticipants.filter(p => p !== participantUsername)
        : [...prev.selectedParticipants, participantUsername]
    }));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Meeting title is required');
      return false;
    }
    
    if (!formData.scheduledTime) {
      setError('Please select a date and time');
      return false;
    }
    
    const scheduledDate = new Date(formData.scheduledTime);
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    if (scheduledDate < oneMinuteAgo) {
      setError('Meeting time must be in the future');
      return false;
    }
    
    if (formData.requirePassword && !formData.password.trim()) {
      setError('Please enter a password for the meeting');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const participantSet = new Set([
        organizerName,
        ...formData.selectedParticipants,
      ]);

      const meetingData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        roomId,
        organizer: organizerName,
        participants: Array.from(participantSet),
        scheduledTime: new Date(formData.scheduledTime).toISOString(),
        duration: parseInt(formData.duration, 10),
        settings: {
          allowScreenShare: formData.allowScreenShare,
          allowChat: formData.allowChat,
          requirePassword: formData.requirePassword,
          password: formData.requirePassword ? formData.password : '',
          maxParticipants: parseInt(formData.maxParticipants, 10)
        },
        isRecurring: formData.isRecurring,
        recurringSettings: formData.isRecurring ? {
          frequency: formData.recurringFrequency,
          interval: parseInt(formData.recurringInterval, 10),
          endDate: formData.recurringEndDate || null
        } : null
      };

      const apiUrl = getApiUrl();
      
      const response = await fetch(`${apiUrl}/api/meetings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingData)
      });

      const data = await response.json();
      console.log('Meeting creation response:', data);

      if (data.success) {
        setSuccess('Meeting scheduled successfully!');
        setTimeout(() => {
          onMeetingCreated(data.meeting);
          onClose();
        }, 1500);
      } else {
        setError(data.message || data.error || 'Failed to create meeting');
      }
    } catch (err) {
      setError('Failed to create meeting. Please check your connection and try again.');
      console.error('Meeting creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="meeting-scheduler-overlay" onClick={onClose}>
      <div className="meeting-scheduler-modal" onClick={(e) => e.stopPropagation()}>
        <div className="meeting-scheduler-header">
          <h2>Schedule Meeting</h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="meeting-scheduler-form">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-group">
            <label htmlFor="title">Meeting Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="Enter meeting title"
              maxLength="100"
            />
            <div className="char-count">{formData.title.length}/100</div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Meeting description (optional)"
              rows="3"
              maxLength="500"
            />
            <div className="char-count">{formData.description.length}/500</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="scheduledTime">Date & Time *</label>
              <input
                type="datetime-local"
                id="scheduledTime"
                name="scheduledTime"
                value={formData.scheduledTime}
                onChange={handleInputChange}
                required
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="duration">Duration (minutes)</label>
              <select
                id="duration"
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <div className="participants-header">
              <label>Participants</label>
              <div className="participant-actions">
                <button
                  type="button"
                  className="select-all-btn"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      selectedParticipants: prev.selectedParticipants.length === otherParticipants.length
                        ? []
                        : [...otherParticipants]
                    }));
                  }}
                >
                  {formData.selectedParticipants.length === otherParticipants.length && otherParticipants.length > 0
                    ? 'Deselect All' 
                    : 'Select All'}
                </button>
              </div>
            </div>
            <div className="participants-list">
              {otherParticipants.length === 0 ? (
                <div className="no-participants">
                  No other members in this room yet — you can still schedule (you will be added as organizer).
                </div>
              ) : (
                otherParticipants.map((participantName) => (
                  <label key={participantName} className="participant-checkbox" htmlFor={`participant-${participantName}`}>
                    <input
                      type="checkbox"
                      id={`participant-${participantName}`}
                      checked={formData.selectedParticipants.includes(participantName)}
                      onChange={() => handleParticipantToggle(participantName)}
                    />
                    <span className="participant-name">{participantName}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-label" htmlFor="isRecurring">
              <input
                type="checkbox"
                id="isRecurring"
                name="isRecurring"
                checked={formData.isRecurring}
                onChange={handleInputChange}
              />
              Recurring Meeting
            </label>
          </div>

          {formData.isRecurring && (
            <div className="recurring-options">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="recurringFrequency">Frequency</label>
                  <select
                    id="recurringFrequency"
                    name="recurringFrequency"
                    value={formData.recurringFrequency}
                    onChange={handleInputChange}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="recurringInterval">Every</label>
                  <input
                    type="number"
                    id="recurringInterval"
                    name="recurringInterval"
                    value={formData.recurringInterval}
                    onChange={handleInputChange}
                    min="1"
                    max="30"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="recurringEndDate">End Date (optional)</label>
                <input
                  type="date"
                  id="recurringEndDate"
                  name="recurringEndDate"
                  value={formData.recurringEndDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}

          <div className="meeting-settings">
            <h3>Meeting Settings</h3>
            
            <div className="settings-row">
              <label className="checkbox-label" htmlFor="allowScreenShare">
                <input
                  type="checkbox"
                  id="allowScreenShare"
                  name="allowScreenShare"
                  checked={formData.allowScreenShare}
                  onChange={handleInputChange}
                />
                Allow Screen Sharing
              </label>

              <label className="checkbox-label" htmlFor="allowChat">
                <input
                  type="checkbox"
                  id="allowChat"
                  name="allowChat"
                  checked={formData.allowChat}
                  onChange={handleInputChange}
                />
                Allow Chat
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-label" htmlFor="requirePassword">
                <input
                  type="checkbox"
                  id="requirePassword"
                  name="requirePassword"
                  checked={formData.requirePassword}
                  onChange={handleInputChange}
                />
                Require Password
              </label>
            </div>

            {formData.requirePassword && (
              <div className="form-group">
                <label htmlFor="password">Meeting Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter meeting password"
                  required={formData.requirePassword}
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="maxParticipants">Max Participants</label>
              <input
                type="number"
                id="maxParticipants"
                name="maxParticipants"
                value={formData.maxParticipants}
                onChange={handleInputChange}
                min="2"
                max="100"
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="create-button">
              {loading ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MeetingScheduler;