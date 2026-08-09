import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getApiUrl } from "../config";
import "../styles/components/Home.css";

function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roomsExpanded, setRoomsExpanded] = useState(false);
  const myRoomsRef = useRef(null);
  const { user, authUser, isAuthenticated } = useAuth();

  // Helper function to get user identifier consistently
  const getUserIdentifier = () => {
    if (authUser?.username) return authUser.username;
    if (authUser?.email) return authUser.email;
    if (user?.username && !user?.isGuest) return user.username;
    if (user?.email && !user?.isGuest) return user.email;
    return username.trim() || 'Anonymous';
  };
  const [view, setView] = useState("select");
  const [showRoomsList, setShowRoomsList] = useState(false);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [roomPin, setRoomPin] = useState(["", "", "", ""]);
  const [roomPassword, setRoomPassword] = useState("");
  const [savedRooms, setSavedRooms] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  // Function to show a view
  const showView = (newView) => {
    setView(newView);
  };

  // Function to generate random color
  const generateRandomColor = () => {
    return (
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")
    );
  };

  // Load joined rooms + auto-fill display name from account or saved preference
  useEffect(() => {
    const userRooms = JSON.parse(localStorage.getItem("joinedRooms") || "[]");
    setJoinedRooms(userRooms);

    if (isAuthenticated && user?.username) {
      setUsername(user.username);
    } else if (isAuthenticated && user?.email) {
      setUsername(user.email.split("@")[0]);
    } else {
      const savedUsername = localStorage.getItem("preferredUsername");
      if (savedUsername) {
        setUsername(savedUsername);
      }
    }
  }, [isAuthenticated, user]);
  // Add useEffect for outside click detection
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        myRoomsRef.current &&
        !myRoomsRef.current.contains(event.target) &&
        roomsExpanded
      ) {
        setRoomsExpanded(false);
      }
    }

    // Add event listener
    document.addEventListener("mousedown", handleClickOutside);

    // Clean up
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [roomsExpanded]);
/*sohamghosh-jellylemonshake-23bps1146 */
  // Function to handle room creation
  const resolveDisplayName = () => {
    if (isAuthenticated && authUser?.username) return authUser.username;
    if (isAuthenticated && authUser?.email) return authUser.email.split('@')[0];
    return (
      username.trim() ||
      user?.username ||
      ''
    );
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    const displayName = resolveDisplayName();
    if (!displayName) {
      setError("Username is required");
      return;
    }

    try {
      // Save preferred username
      localStorage.setItem("preferredUsername", displayName);
      setUsername(displayName);

      // Generate a random 4-digit PIN
      const pin = Math.floor(1000 + Math.random() * 9000).toString();

      // Generate colors for room and user
      const roomColor = generateRandomColor();
      const userColor = generateRandomColor();

      // Create room data
      const userIdentifier = getUserIdentifier();
      const roomData = {
        name: pin,
        createdBy: userIdentifier,
        isPrivate: isPrivate,
        password: isPrivate ? password : null,
        color: roomColor,
        participants: [{
          username: userIdentifier,
          isCreator: true,
          color: userColor,
        }]
      };

      // Create room on backend
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roomData),
      });

      if (response.ok) {
        const createdRoom = await response.json();
        
        // Also save to localStorage for offline access
        const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
        rooms[pin] = {
          id: pin,
          createdBy: username,
          isPrivate: isPrivate,
          password: isPrivate ? password : null,
          createdAt: new Date().toISOString(),
          color: roomColor,
          participants: [{
            username,
            isCreator: true,
            color: userColor,
          }],
        };
        localStorage.setItem("chatRooms", JSON.stringify(rooms));

        // Initialize empty messages array for this room
        const allMessages = JSON.parse(
          localStorage.getItem("chatMessages") || "{}"
        );
        allMessages[pin] = [];
        localStorage.setItem("chatMessages", JSON.stringify(allMessages));

        // Add room to user's joined rooms
        const userRooms = JSON.parse(localStorage.getItem("joinedRooms") || "[]");
        userRooms.push({
          roomId: pin,
          name: `Room #${pin}`,
          joinedAt: new Date().toISOString(),
          isPrivate: isPrivate,
          isCreator: true,
          lastActivity: new Date().toISOString(),
        });
        localStorage.setItem("joinedRooms", JSON.stringify(userRooms));

        // Store active user info including color
        localStorage.setItem(
          "chatUser",
          JSON.stringify({
            username: userIdentifier,
            roomId: pin,
            joinedAt: new Date().toISOString(),
            color: userColor,
          })
        );

        // Navigate to the room
        navigate(`/room/${pin}`);
      } else {
        setError("Failed to create room on server");
      }
    } catch (err) {
      setError("Error creating room");
      console.error(err);
    }
  };

  // Handle PIN input changes
  const handlePinChange = (e) => {
    const index = parseInt(e.target.dataset.index);
    // Only allow digits and limit to single character
    const value = e.target.value.replace(/[^0-9]/g, "").slice(0, 1);

    // Create a copy of the array and update just this position
    const newPin = [...roomPin];
    newPin[index] = value;
    setRoomPin(newPin);

    // Auto-focus to next input if a digit was entered
    if (value && index < 3) {
      const nextInput = document.querySelector(
        `.pin-digit[data-index="${index + 1}"]`
      );
      if (nextInput) {
        nextInput.focus();
      }
    }
  };

  // Handle key presses in PIN inputs
  const handlePinKeyDown = (e) => {
    const index = parseInt(e.target.dataset.index);

    if (e.key === "Backspace") {
      // Create a copy of the array
      const newPin = [...roomPin];

      if (roomPin[index] === "") {
        // If current input is already empty and backspace was pressed,
        // move focus to previous input
        if (index > 0) {
          const prevInput = document.querySelector(
            `.pin-digit[data-index="${index - 1}"]`
          );
          if (prevInput) {
            prevInput.focus();
          }
        }
      } else {
        // Clear the current input
        newPin[index] = "";
        setRoomPin(newPin);
      }
    }
  };

  // Function to handle joining a room
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const displayName = resolveDisplayName();
    if (!displayName) {
      setError("Username is required");
      return;
    }
    const pinString = roomPin.join("");
    if (!pinString || pinString.length !== 4) {
      setError("Valid 4-digit room PIN is required");
      return;
    }

    try {
      // Save preferred username
      localStorage.setItem("preferredUsername", displayName);
      setUsername(displayName);

      // Check backend first for room
      const apiUrl = getApiUrl();
      let room = null;
      const userColor = generateRandomColor();

      try {
        // Use the new join endpoint with retry mechanism
        const userIdentifier = getUserIdentifier();
        console.log('Attempting to join room:', pinString, 'as user:', userIdentifier);
        
        let joinResponse;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          joinResponse = await fetch(`${apiUrl}/api/rooms/${pinString}/join`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: userIdentifier,
              password: roomPassword || undefined // Add password support if needed
            }),
          });

        if (joinResponse.ok) {
          const joinData = await joinResponse.json();
          room = {
            id: pinString,
            createdBy: joinData.room.createdBy,
            isPrivate: joinData.room.isPrivate || false,
            password: joinData.room.password,
            participants: joinData.room.participants || [],
            color: joinData.room.color
          };
          console.log('Successfully joined room:', pinString);
          console.log('Room data received:', room);
          break; // Success, exit retry loop
        } else if (joinResponse.status === 404 && retryCount < maxRetries) {
            // Room not found, wait a bit and retry
            console.log(`Room not found, retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            retryCount++;
            continue;
          } else {
            // Other errors or max retries reached
            const errorData = await joinResponse.json();
            if (joinResponse.status === 404) {
              setError(`Room "${pinString}" not found. The room may not exist or there may be a connection issue. Try creating a new room with this PIN.`);
            } else if (joinResponse.status === 403) {
              setError(errorData.error || 'Access denied. You may need a password for this private room.');
            } else {
              setError(errorData.error || 'Failed to join room. Please try again.');
            }
            return;
          }
        }
      } catch (apiError) {
        console.log('Backend check failed, checking localStorage:', apiError);
      }

      // Check if room exists or was created
      if (!room) {
        // If still no room after trying to create it, check localStorage as final fallback
        const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
        room = rooms[pinString];
        
        if (!room) {
          console.error('Room not found anywhere:', pinString);
          setError(`Room "${pinString}" not found. The room may not exist or there may be a connection issue. Try creating a new room with this PIN.`);
          return;
        } else {
          console.log('Room found in localStorage:', room);
        }
      } else {
        console.log('Room found/created successfully:', room);
      }

      // Check if room is private and verify password
      if (room.isPrivate) {
        if (!roomPassword) {
          setError("This room requires a password");
          return;
        }
        if (room.password !== roomPassword) {
          setError("Incorrect password");
          return;
        }
      }

      // Add user to room participants and update backend
      const userIdentifier = getUserIdentifier();
      if (room && !room.participants.some((p) => p.username === userIdentifier)) {
        const newParticipant = {
          username: userIdentifier,
          isCreator: false,
          joinedAt: new Date().toISOString(),
          color: userColor,
        };
        
        // Add to room participants
        room.participants.push(newParticipant);
        
        // Update room on backend if it exists there
        try {
          const updateResponse = await fetch(`${apiUrl}/api/rooms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: pinString,
              participants: [newParticipant]
            }),
          });
          
          if (updateResponse.ok) {
            console.log('User added to room on backend');
          }
        } catch (updateError) {
          console.log('Failed to update room on backend:', updateError);
        }
        
        // Update localStorage if room was found there
        const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
        if (rooms[pinString]) {
          rooms[pinString] = room;
          localStorage.setItem("chatRooms", JSON.stringify(rooms));
        }
      }

      // Add room to user's joined rooms if not already there
      const userRooms = JSON.parse(localStorage.getItem("joinedRooms") || "[]");
      if (!userRooms.some((r) => r.roomId === pinString)) {
        userRooms.push({
          roomId: pinString,
          name: `Room #${pinString}`,
          joinedAt: new Date().toISOString(),
          isPrivate: room.isPrivate,
          isCreator: room.createdBy === userIdentifier,
          lastActivity: new Date().toISOString(),
        });
        localStorage.setItem("joinedRooms", JSON.stringify(userRooms));
      }
/*sohamghosh-jellylemonshake-23bps1146 */
      // Store active user info with color
      localStorage.setItem(
        "chatUser",
        JSON.stringify({
          username: userIdentifier,
          roomId: pinString,
          joinedAt: new Date().toISOString(),
          color: userColor, // Store user's color
        })
      );

      // Navigate to room
      console.log('About to navigate to room:', pinString);
      console.log('Room object before navigation:', room);
      navigate(`/room/${pinString}`);
    } catch (err) {
      console.error('Error in handleJoinRoom:', err);
      setError(`Error joining room: ${err.message}`);
    }
  };

  // Handle entering a joined room
  const enterRoom = (roomId) => {
    const userIdentifier = getUserIdentifier();
    const userData = JSON.parse(localStorage.getItem("chatUser") || "{}");

    // Get room data
    const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
    const room = rooms[roomId];

    // Find user's color in this room if it exists
    let userColor = userData.color;

    if (room && room.participants) {
      const participant = room.participants.find(
        (p) => p.username === username
      );
      if (participant && participant.color) {
        userColor = participant.color;
      }
    }

    // If no color found, generate a new one
    if (!userColor) {
      userColor = generateRandomColor();
    }

    // Update active user info
    localStorage.setItem(
      "chatUser",
      JSON.stringify({
        username: userIdentifier,
        roomId,
        joinedAt: new Date().toISOString(),
        color: userColor,
      })
    );

    // Update last activity
    const userRooms = JSON.parse(localStorage.getItem("joinedRooms") || "[]");
    const updatedRooms = userRooms.map((room) => {
      if (room.roomId === roomId) {
        return { ...room, lastActivity: new Date().toISOString() };
      }
      return room;
      /*sohamghosh-jellylemonshake-23bps1146 */
    });
    localStorage.setItem("joinedRooms", JSON.stringify(updatedRooms));

    // Navigate to room
    navigate(`/room/${roomId}`);
  };

  // Handle removing a room from joined rooms
  const removeRoom = (roomId, e) => {
    e.stopPropagation(); // Prevent clicking through to the room

    const userRooms = JSON.parse(localStorage.getItem("joinedRooms") || "[]");
    const updatedRooms = userRooms.filter((room) => room.roomId !== roomId);
    localStorage.setItem("joinedRooms", JSON.stringify(updatedRooms));
    setJoinedRooms(updatedRooms);

    // Also remove user from room participants if they're in there
    const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
    if (rooms[roomId]) {
      rooms[roomId].participants = rooms[roomId].participants.filter(
        (p) => p.username !== username
      );
      localStorage.setItem("chatRooms", JSON.stringify(rooms));
    }
  };

  const toggleRoomsExpanded = (e) => {
    e.stopPropagation();
    setRoomsExpanded(!roomsExpanded);
  };

  const renderSelectView = () => (
    <div className={`home-header ${view !== "select" ? "hidden" : ""}`}>
      {/* Welcome Section */}
      <div className="welcome-section">
        <h1 className="welcome-title">Welcome to ChatApp</h1>
        <p className="welcome-subtitle">Connect with friends and colleagues in real-time</p>
        {user && !user.isGuest && (
          <div className="user-welcome">
            <p>Welcome back, {user.email || user.user_metadata?.display_name || 'User'}!</p>
          </div>
        )}
      </div>

      {/* Main Action Buttons */}
      <div className="action-buttons">
        <button
          className="btn btn-primary"
          onClick={() => showView("create")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
          Create Room
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => showView("join")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          Join Room
        </button>
      </div>

      {/* My Rooms Section */}
      {joinedRooms.length > 0 && (
        <div className="my-rooms-section">
          <button
            className="btn btn-accent rooms-toggle"
            ref={myRoomsRef}
            onClick={toggleRoomsExpanded}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9,22 9,12 15,12 15,22"></polyline>
            </svg>
            My Rooms ({joinedRooms.length})
            <svg
              className={`expand-icon ${roomsExpanded ? "expanded" : ""}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          </button>
          
          <div className={`rooms-list ${roomsExpanded ? "expanded" : ""}`}>
            {joinedRooms
              .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
              .map((room) => {
                const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
                const roomData = rooms[room.roomId];
                return (
                  <div
                    key={room.roomId}
                    className="room-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      enterRoom(room.roomId);
                    }}
                  >
                    <div className="room-info">
                      <div className="room-name">
                        Room #{room.roomId}
                        {room.isPrivate && (
                          <span className="private-badge">P</span>
                        )}
                      </div>
                      <div className="room-details">
                        Last active: {formatLastActivity(room.lastActivity)}
                      </div>
                    </div>
                    <button
                      className="remove-room"
                      onClick={(e) => removeRoom(room.roomId, e)}
                      title="Remove room"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );

  const renderCreateRoomView = () => (
    <div className="create-room-view">
      <div className="home-header">
        <button 
          onClick={() => setView("select")} 
          className="back-button"
        >
          ← Back
        </button>
        <h1 className="home-title">Create Room</h1>
        <p className="home-subtitle">Set up your own chat room</p>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleCreateRoom} className="auth-form">
        <div className="form-group">
          <label htmlFor="username" className="form-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Your Username
          </label>
          <input
            type="text"
            id="username"
            value={username}
            className="form-input"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your display name"
            readOnly={isAuthenticated}
            required
          />
          {isAuthenticated && (
            <p className="form-hint" style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
              Using your account name ({authUser?.username || authUser?.email})
            </p>
          )}
        </div>

        <div className="toggle-container">
          <div className="toggle-switch" onClick={() => setIsPrivate(!isPrivate)}>
            <div className={`toggle-slider ${isPrivate ? 'active' : ''}`}></div>
          </div>
          <label htmlFor="isPrivate" className="form-label">Private Room (Password Protected)</label>
        </div>

        {isPrivate && (
          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <circle cx="12" cy="16" r="1"></circle>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Room Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              className="form-input"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter room password"
              required={isPrivate}
            />
          </div>
        )}

        <div className="button-group">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setView("select")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"></path>
            </svg>
            Back
          </button>
          <button type="submit" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
            Create Room
          </button>
        </div>
      </form>
    </div>
  );
/*sohamghosh-jellylemonshake-23bps1146 */
  const renderJoinRoomView = () => (
    <div className="join-room-view">
      <div className="home-header">
        <button 
          onClick={() => setView("select")} 
          className="back-button"
        >
          ← Back
        </button>
        <h1 className="home-title">Join Room</h1>
        <p className="home-subtitle">Enter the room PIN to join</p>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleJoinRoom} className="auth-form">
        <div className="form-group">
          <label htmlFor="join-username" className="form-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Your Username
          </label>
          <input
            type="text"
            id="join-username"
            value={username}
            className="form-input"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your display name"
            readOnly={isAuthenticated}
            required
          />
          {isAuthenticated && (
            <p className="form-hint" style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
              Using your account name ({authUser?.username || authUser?.email})
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="roomPin" className="form-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <circle cx="12" cy="16" r="1"></circle>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Room PIN
          </label>
          <div className="pin-input-container">
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                type="text"
                className="pin-input"
                maxLength="1"
                pattern="[0-9]"
                inputMode="numeric"
                autoComplete="off"
                onChange={handlePinChange}
                onKeyDown={handlePinKeyDown}
                data-index={i}
                value={roomPin[i] || ""}
              />
            ))}
          </div>
          <input
            type="hidden"
            id="roomPin"
            value={roomPin.join("")}
            className="pin-input-hidden"
          />
        </div>

        <div className="form-group">
          <label htmlFor="roomPassword" className="form-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <circle cx="12" cy="16" r="1"></circle>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Room Password (if required)
          </label>
          <input
            type="password"
            id="roomPassword"
            value={roomPassword}
            className="form-input"
            onChange={(e) => setRoomPassword(e.target.value)}
            placeholder="Enter room password if needed"
          />
        </div>

        <div className="button-group">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setView("select")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"></path>
            </svg>
            Back
          </button>
          <button type="submit" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            Join Room
          </button>
        </div>
      </form>
    </div>
  );

  const renderMyRoomsView = () => (
    <div className="my-rooms-view">
      <div className="home-header">
        <button 
          onClick={() => setView("select")} 
          className="back-button"
        >
          ← Back
        </button>
        <h1 className="home-title">My Rooms</h1>
        <p className="home-subtitle">Manage your joined rooms</p>
      </div>
      
      {joinedRooms.length === 0 ? (
        <div className="no-rooms">
          <p>You haven't joined any rooms yet.</p>
          <div className="button-group">
            <button
              onClick={() => setView("create")}
              className="btn btn-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"></path>
              </svg>
              Create Room
            </button>
            <button
              onClick={() => setView("join")}
              className="btn btn-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
              Join Room
            </button>
          </div>
        </div>
      ) : (
        <div className="rooms-list">
          {joinedRooms
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
            .map((room) => {
              const rooms = JSON.parse(localStorage.getItem("chatRooms") || "{}");
              const roomData = rooms[room.roomId];
              return (
                <div
                  key={room.roomId}
                  className="room-item"
                  onClick={() => enterRoom(room.roomId)}
                  style={roomData?.color ? { borderLeft: `4px solid ${roomData.color}` } : {}}
                >
                  <div className="room-info">
                    <div className="room-name">
                      {room.name}
                      {room.isPrivate && (
                        <span className="private-badge">P</span>
                      )}
                    </div>
                    <div className="room-details">
                      {room.isCreator ? "Created by you" : "Joined"} • Last activity: {formatLastActivity(room.lastActivity)}
                    </div>
                  </div>
                  <button
                    className="remove-room"
                    onClick={(e) => removeRoom(room.roomId, e)}
                    title="Remove room"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );

  // Helper function to format the last activity time
  const formatLastActivity = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="home-container">
      <div className="home-content fade-in">
        {renderSelectView()}

        {/* Direct view rendering without dialog overlay */}
        {view === "create" && renderCreateRoomView()}
        {view === "join" && renderJoinRoomView()}
        {view === "myRooms" && renderMyRoomsView()}
      </div>
      {/* GitHub Profile Logo - Bottom Left */}
      <a
        href="https://github.com/jellylemonshake"
        className="github-profile-link"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub Profile"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          width="36"
          height="36"
          aria-hidden="true"
        >
          <path
            d="M12 0.3C5.37 0.3 0 5.67 0 12.3c0 5.29 
               3.438 9.779 8.205 11.387 0.6 0.113 0.82-0.256 
               0.82-0.572 0-0.281-0.011-1.028-0.017-2.019-3.338 
               0.726-4.042-1.611-4.042-1.611-0.545-1.384-1.332-1.753-1.332-1.753-1.089-0.745 
               0.083-0.73 0.083-0.73 1.205 0.084 1.84 1.237 1.84 1.237 1.07 1.834 
               2.809 1.304 3.495 0.997 0.108-0.775 0.418-1.305 0.762-1.606-2.665-0.304-5.467-1.332-5.467-5.932 
               0-1.312 0.469-2.382 1.235-3.221-0.124-0.303-0.535-1.523 0.117-3.176 
               0 0 1.008-0.323 3.301 1.23a11.5 11.5 0 0 1 3.003-0.404c1.019 0.005 2.048 0.138 3.003 0.404
               2.291-1.553 3.297-1.23 3.297-1.23 0.654 1.653 0.243 2.873 0.12 3.176
               0.77 0.839 1.234 1.909 1.234 3.221 0 4.61-2.807 5.625-5.479 5.921
               0.43 0.37 0.823 1.099 0.823 2.217 0 1.6-0.015 2.892-0.015 3.287 0 0.319 0.216 0.689 0.825 0.572
               C20.565 22.075 24 17.586 24 12.3c0-6.63-5.37-12-12-12z"
          />
        </svg>
      </a>
    </div>
  );
}

export default Home;
