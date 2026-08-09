import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../config';
import '../styles/components/RoomJoin.css';

function RoomJoin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    if (!user) {
      setError('Please wait for session to load, or go home and continue as guest');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = getApiUrl();
      const username = user.email || user.username || 'Guest';
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password: password || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        navigate(`/room/${roomId}`);
      } else {
        setError(data.error || 'Failed to join room');
      }
    } catch (err) {
      setError('Error joining room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="room-join-container">
        <div className="room-join-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="room-join-container">
      <div className="room-join-card">
        <div className="room-join-header">
          <h2>Join a Room</h2>
          <p>Enter the room ID to join an existing chat room</p>
        </div>

        <form onSubmit={handleJoinRoom} className="room-join-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              type="text"
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID (e.g., 1234)"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password (if private room)</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter room password (optional)"
            />
          </div>

          <button type="submit" className="join-button" disabled={loading}>
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </form>

        <div className="room-join-footer">
          <p>Don't have a room ID?</p>
          <button type="button" className="create-room-button" onClick={() => navigate('/')}>
            Create a New Room
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoomJoin;
