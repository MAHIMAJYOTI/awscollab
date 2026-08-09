import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../config';
import '../styles/components/MeetingsList.css';

function MeetingsList({ roomId, onClose, isVisible }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isVisible && roomId) {
      loadMeetings();
    }
  }, [isVisible, roomId]);

  const loadMeetings = async () => {
    setLoading(true);
    setError('');
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/meetings/room/${roomId}`);
      
      if (response.ok) {
        const data = await response.json();
        setMeetings(Array.isArray(data) ? data : data.meetings || []);
      } else {
        setError('Failed to load meetings');
      }
    } catch (err) {
      setError('Error loading meetings');
      console.error('Error loading meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = (meetingId) => {
    window.open(`/meet/${meetingId}`, '_blank');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getMeetingStatus = (meeting) => {
    const now = new Date();
    const scheduledTime = new Date(meeting.scheduledTime);
    
    if (meeting.status === 'active') {
      return { status: 'Active', color: '#4CAF50' };
    } else if (meeting.status === 'completed') {
      return { status: 'Completed', color: '#9E9E9E' };
    } else if (scheduledTime <= now) {
      return { status: 'Ready to Start', color: '#FF9800' };
    } else {
      return { status: 'Scheduled', color: '#2196F3' };
    }
  };

  if (!isVisible) return null;

  return (
    <div className="meetings-overlay" onClick={onClose}>
      <div className="meetings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="meetings-header">
          <h2>📅 Scheduled Meetings</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="view-meeting-btn" onClick={loadMeetings} disabled={loading}>
              Refresh
            </button>
            <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            </button>
          </div>
        </div>

        <div className="meetings-content">
          {error && <div className="error-message">{error}</div>}
          
          {loading ? (
            <div className="loading-message">Loading meetings...</div>
          ) : !Array.isArray(meetings) || meetings.length === 0 ? (
            <div className="no-meetings">
              <p>No meetings scheduled for this room.</p>
              <p>Create a meeting to get started!</p>
            </div>
          ) : (
            <div className="meetings-list">
              {Array.isArray(meetings) && meetings.map((meeting) => {
                const statusInfo = getMeetingStatus(meeting);
                return (
                  <div key={meeting.meetingId || meeting._id} className="meeting-item">
                    <div className="meeting-header-info">
                      <h3>{meeting.title}</h3>
                      <span 
                        className="meeting-status" 
                        style={{ backgroundColor: statusInfo.color }}
                      >
                        {statusInfo.status}
                      </span>
                    </div>
                    
                    {meeting.description && (
                      <p className="meeting-description">{meeting.description}</p>
                    )}
                    
                    <div className="meeting-details">
                      <div className="detail-row">
                        <strong>📅 Scheduled:</strong> {formatDate(meeting.scheduledTime)}
                      </div>
                      <div className="detail-row">
                        <strong>⏱️ Duration:</strong> {meeting.duration} minutes
                      </div>
                      <div className="detail-row">
                        <strong>👤 Organizer:</strong> {meeting.organizer}
                      </div>
                      <div className="detail-row">
                        <strong>👥 Participants:</strong> {(meeting.participants || []).length}
                      </div>
                    </div>

                    <div className="meeting-actions">
                      {statusInfo.status !== 'Completed' && (
                        <button 
                          onClick={() => joinMeeting(meeting.meetingId || meeting.id)}
                          className="join-meeting-btn"
                        >
                          🎥 {statusInfo.status === 'Scheduled' ? 'Open Meeting' : 'Join Meeting'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MeetingsList;
