import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../config';
import socketService from '../services/socketService';
import VideoCall from './VideoCall';
import '../styles/components/MeetingRoom.css';

const getPeerId = (u) => u?.email || u?.username || u?.id || '';

function MeetingRoom() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const loadMeeting = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/meetings/${meetingId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || `Meeting not found (${response.status})`);
        return;
      }

      const data = await response.json();
      if (data.success && data.meeting) {
        setMeeting(data.meeting);
      } else {
        setError('Meeting not found or access denied');
      }
    } catch (err) {
      setError(`Failed to load meeting: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (meetingId) {
      loadMeeting();
    }
  }, [meetingId, loadMeeting]);

  useEffect(() => {
    if (!meeting?.roomId) return;

    socketService.connect();
    socketService.onRoomUsers((users) => setOnlineUsers(users || []));

    return () => {
      socketService.off('room-users');
    };
  }, [meeting?.roomId]);

  const updateMeetingStatus = async (status) => {
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('Failed to update meeting status:', err);
    }
  };

  const sendMeetingNotification = async () => {
    try {
      const apiUrl = getApiUrl();
      const organizer = getPeerId(user) || meeting?.organizer;
      await fetch(`${apiUrl}/api/meetings/${meetingId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizer,
          message: `${organizer} has started the meeting`,
        }),
      });
    } catch (err) {
      console.error('Error sending notification:', err);
    }
  };

  const joinMeeting = async () => {
    if (!user) {
      setError('Session not ready — go home and continue as guest, then try again');
      return;
    }

    if (!meeting?.roomId) {
      setError('Meeting room is not configured');
      return;
    }

    setError('');

    const peerId = user.username || user.email?.split('@')[0] || getPeerId(user);
    localStorage.setItem(
      'chatUser',
      JSON.stringify({
        username: peerId,
        email: user.email,
        roomId: meeting.roomId,
      })
    );

    if (!socketService.isConnected()) {
      socketService.connect();
    }

    socketService.joinRoom(meeting.roomId, {
      username: peerId,
      email: user.email || peerId,
      id: peerId,
    });

    socketService.emit('video-call-active', {
      roomId: meeting.roomId,
      active: true,
    });

    await updateMeetingStatus('active');
    await sendMeetingNotification();
    setIsJoined(true);
  };

  const leaveMeeting = async () => {
    if (meeting?.roomId) {
      socketService.emit('video-call-active', {
        roomId: meeting.roomId,
        active: false,
      });
    }
    await updateMeetingStatus('completed');
    setIsJoined(false);
    navigate(-1);
  };

  const meetingParticipants = (meeting?.participants || []).map((p) => ({
    email: p,
    username: p,
    userId: p,
  }));

  if (loading) {
    return (
      <div className="meeting-room-container">
        <div className="meeting-loading">
          <div className="loading-spinner" />
          <p>Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (error && !meeting) {
    return (
      <div className="meeting-room-container">
        <div className="meeting-error">
          <h2>Meeting Error</h2>
          <p>{error}</p>
          <button type="button" onClick={() => navigate(-1)} className="back-button">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="meeting-room-container">
        <div className="meeting-error">
          <h2>Meeting Not Found</h2>
          <p>The meeting you are looking for does not exist or was deleted.</p>
          <button type="button" onClick={() => navigate(-1)} className="back-button">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (isJoined) {
    return (
      <VideoCall
        roomId={meeting.roomId}
        participants={meetingParticipants}
        onlineUsers={onlineUsers}
        onClose={leaveMeeting}
      />
    );
  }

  const participants = meeting.participants || [];

  return (
    <div className="meeting-room-container">
      <div className="meeting-header">
        <div className="meeting-info">
          <h1>{meeting.title}</h1>
          <p>Room: {meeting.roomId}</p>
          <p>Organized by: {meeting.organizer}</p>
          {meeting.description && <p>{meeting.description}</p>}
        </div>
        <div className="meeting-actions">
          <button type="button" onClick={joinMeeting} className="join-meeting-btn">
            Join Video Call
          </button>
          <button
            type="button"
            onClick={() => navigate(`/room/${meeting.roomId}`)}
            className="back-button"
          >
            Open Chat Room
          </button>
        </div>
      </div>

      {error && <div className="meeting-inline-error">{error}</div>}

      <div className="meeting-preview">
        <div className="meeting-details">
          <h3>Meeting Details</h3>
          <div className="detail-item">
            <strong>Status:</strong> {meeting.status}
          </div>
          <div className="detail-item">
            <strong>Scheduled:</strong>{' '}
            {new Date(meeting.scheduledTime).toLocaleString()}
          </div>
          <div className="detail-item">
            <strong>Duration:</strong> {meeting.duration} minutes
          </div>
          <div className="detail-item">
            <strong>Participants:</strong> {participants.length}
          </div>
        </div>

        <div className="participants-list">
          <h3>Participants</h3>
          <ul>
            {participants.length === 0 ? (
              <li>No participants listed yet</li>
            ) : (
              participants.map((participant) => (
                <li key={participant}>{participant}</li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MeetingRoom;
