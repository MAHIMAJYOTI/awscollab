import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import '../styles/components/VideoCall.css';

// Import socket service directly
import socketService from '../services/socketService';

const getPeerId = (u) => u?.email || u?.username || u?.id || '';

/** Same identity as chat room — prefer logged-in account username over stale localStorage */
const getLocalPeerId = (user) => {
  if (user && !user.isGuest) {
    if (user.username) return String(user.username);
    if (user.email) return String(user.email);
  }
  try {
    const chatUser = JSON.parse(localStorage.getItem('chatUser') || '{}');
    if (chatUser.username) return String(chatUser.username);
    if (chatUser.email) return String(chatUser.email);
  } catch {
    // ignore
  }
  return String(getPeerId(user) || '');
};

const normalizePeerId = (id) => String(id || '').trim().toLowerCase();

const shouldInitiateOffer = (localId, remoteId) =>
  normalizePeerId(localId) < normalizePeerId(remoteId);

const participantKey = (p) => {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return String(p.socketId || p.username || p.email || p.userId || p.id || '');
};

const displayName = (participant, fallbackId = '') =>
  participant?.username || participant?.email || fallbackId || 'Guest';

// Validate socket service
let socketServiceAvailable = false;
if (socketService && typeof socketService.on === 'function' && typeof socketService.emit === 'function') {
  socketServiceAvailable = true;
  console.log('Socket service loaded successfully');
} else {
  console.error('Socket service methods not available');
  socketServiceAvailable = false;
}

// Additional safety wrapper
const safeSocketService = {
  on: (event, callback) => {
    try {
      if (socketService && typeof socketService.on === 'function') {
        return socketService.on(event, callback);
      } else {
        console.warn(`Safe socket service - cannot listen to event: ${event}`);
        return false;
      }
    } catch (error) {
      console.error(`Error in socket.on for event ${event}:`, error);
      return false;
    }
  },
  emit: (event, data) => {
    try {
      if (socketService && typeof socketService.emit === 'function') {
        return socketService.emit(event, data);
      } else {
        console.warn(`Safe socket service - cannot emit event: ${event}`);
        return false;
      }
    } catch (error) {
      console.error(`Error in socket.emit for event ${event}:`, error);
      return false;
    }
  },
  off: (event, callback) => {
    try {
      if (socketService && typeof socketService.off === 'function') {
        return socketService.off(event, callback);
      } else {
        console.warn(`Safe socket service - cannot remove listener for event: ${event}`);
        return false;
      }
    } catch (error) {
      console.error(`Error in socket.off for event ${event}:`, error);
      return false;
    }
  },
  connect: () => {
    try {
      if (socketService && typeof socketService.connect === 'function') {
        return socketService.connect();
      } else {
        console.warn('Safe socket service - cannot connect');
        return false;
      }
    } catch (error) {
      console.error('Error in socket.connect:', error);
      return false;
    }
  },
  disconnect: () => {
    try {
      if (socketService && typeof socketService.disconnect === 'function') {
        return socketService.disconnect();
      } else {
        console.warn('Safe socket service - cannot disconnect');
        return false;
      }
    } catch (error) {
      console.error('Error in socket.disconnect:', error);
      return false;
    }
  },
  isConnected: () => {
    try {
      if (socketService && typeof socketService.isConnected === 'function') {
        return socketService.isConnected();
      } else {
        console.warn('Safe socket service - not connected');
        return false;
      }
    } catch (error) {
      console.error('Error in socket.isConnected:', error);
      return false;
    }
  }
};

function VideoCall({ roomId, onClose, participants = [], onlineUsers = [] }) {
  // Early return if socket service is not available
  if (!socketServiceAvailable) {
    return (
      <div className="video-call-overlay" onClick={onClose}>
        <div className="video-call-container" onClick={e => e.stopPropagation()}>
          <div className="video-call-header">
            <h2>🎥 Video Call - Room {roomId}</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="error-message" style={{
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            padding: '20px',
            borderRadius: '4px',
            textAlign: 'center',
            margin: '20px'
          }}>
            <h3>⚠️ Video Call Service Unavailable</h3>
            <p>The video call service is currently not available. This may be due to:</p>
            <ul style={{ textAlign: 'left', margin: '10px 0' }}>
              <li>Network connectivity issues</li>
              <li>Server maintenance</li>
              <li>Browser compatibility issues</li>
            </ul>
            <p>Please try again later or contact support if the issue persists.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-primary"
              style={{ margin: '10px' }}
            >
              🔄 Refresh Page
            </button>
            <button 
              onClick={onClose} 
              className="btn-secondary"
              style={{ margin: '10px' }}
            >
              ❌ Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { user, isAuthenticated } = useAuth();
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [componentError, setComponentError] = useState(null);
  const [isSettingVideoStream, setIsSettingVideoStream] = useState(false);
  const [connectionTimeout, setConnectionTimeout] = useState(null);
  const [permissionRequested, setPermissionRequested] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef([]);
  const peerConnections = useRef({});
  const localStreamRef = useRef(null);
  const signalingReady = useRef(false);
  const hasAnnouncedVideo = useRef(false);

  const announceVideoJoin = () => {
    if (hasAnnouncedVideo.current) return;
    hasAnnouncedVideo.current = true;
    const currentUserId = getLocalPeerId(user);
    safeSocketService.emit('user-joined-video', {
      roomId,
      userId: currentUserId,
      username: currentUserId,
      email: user?.email || '',
    });
  };

  const pendingIceCandidates = useRef({});

  const getMySocketId = () => socketService.getSocketId();

  const isSignalForMe = (data) => {
    const mySocketId = getMySocketId();
    if (!mySocketId || data.roomId !== roomId) return false;
    if (data.from === mySocketId) return false;
    if (data.to && data.to !== mySocketId) return false;
    return true;
  };

  const queueIceCandidate = (peerSocketId, candidate) => {
    if (!pendingIceCandidates.current[peerSocketId]) {
      pendingIceCandidates.current[peerSocketId] = [];
    }
    pendingIceCandidates.current[peerSocketId].push(candidate);
  };

  const flushPendingCandidates = async (peerSocketId) => {
    const pc = peerConnections.current[peerSocketId];
    const pending = pendingIceCandidates.current[peerSocketId] || [];
    if (!pc || pending.length === 0) return;
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('ICE candidate flush failed:', err?.message);
      }
    }
    pendingIceCandidates.current[peerSocketId] = [];
  };

  const connectToPeer = (peerSocketId, participant = null) => {
    const mySocketId = getMySocketId();
    if (!peerSocketId || !mySocketId || peerSocketId === mySocketId) return;
    if (peerConnections.current[peerSocketId]) return;

    console.log('📹 Connecting to peer', participant?.username || peerSocketId, peerSocketId);

    setRemoteStreams(prev => {
      if (prev.some(s => s.id === peerSocketId)) return prev;
      return [
        ...prev,
        {
          id: peerSocketId,
          name: displayName(participant, participant?.username || 'Guest'),
          stream: null,
          isVideoEnabled: true,
          isAudioEnabled: true,
          connectionStatus: 'connecting',
        },
      ];
    });

    const initiateOffer = shouldInitiateOffer(mySocketId, peerSocketId);
    startWebRTCConnection(peerSocketId, participant, initiateOffer);
  };

  const safePlay = useCallback((videoEl) => {
    if (!videoEl) return;
    const playPromise = videoEl.play();
    if (playPromise?.catch) {
      playPromise.catch((err) => {
        // Harmless when srcObject changes during load (common in dev / strict mode)
        if (err?.name === 'AbortError') return;
        if (err?.name === 'NotAllowedError') return;
        console.warn('Video play failed:', err?.message || err);
      });
    }
  }, []);

  const attachStreamToVideo = useCallback(
    (videoEl, stream) => {
      if (!videoEl || !stream) return;
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      safePlay(videoEl);
    },
    [safePlay]
  );

  // Centralized function to set video stream (prevents race conditions)
  const setVideoStreamSafely = useCallback(
    (stream) => {
      if (!localVideoRef.current || !stream) {
        return;
      }

      if (localVideoRef.current.srcObject === stream) {
        safePlay(localVideoRef.current);
        return;
      }

      if (isSettingVideoStream) {
        return;
      }

      setIsSettingVideoStream(true);
      try {
        attachStreamToVideo(localVideoRef.current, stream);
      } catch (error) {
        console.error('Error setting video stream:', error);
      } finally {
        setIsSettingVideoStream(false);
      }
    },
    [isSettingVideoStream, attachStreamToVideo, safePlay]
  );

  // Manual permission request function
  const requestPermissionsManually = async () => {
    try {
      setPermissionRequested(true);
      setError('');
      setConnectionStatus('connecting');
      
      console.log('Manually requesting camera and microphone permissions...');
      
      // Request permissions explicitly
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set video stream immediately
      const setVideoStream = (retryCount = 0) => {
        if (localVideoRef.current) {
          setVideoStreamSafely(stream);
          return;
        }
        
        if (retryCount < 50) { // Max 5 seconds of retries
          setTimeout(() => setVideoStream(retryCount + 1), 100);
        } else {
          console.error('Video element not ready after 5 seconds');
          setError('Video element failed to initialize. Please refresh and try again.');
          setConnectionStatus('error');
        }
      };
      
      setVideoStream();
      setConnectionStatus('connected');
      setupWebRTCConnections();
      
    } catch (err) {
      console.error('Manual permission request failed:', err);
      
      let errorMessage = 'Unable to access camera/microphone. ';
      let detailedInstructions = '';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Permission denied. ';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>To fix this issue:</h4>
            <ol>
              <li>Look for the camera/microphone icon in your browser's address bar</li>
              <li>Click on it and select "Allow" for camera and microphone</li>
              <li>If you don't see the icon, check your browser's site settings</li>
              <li>Refresh the page and try again</li>
            </ol>
            <p><strong>Browser-specific instructions:</strong></p>
            <ul>
              <li><strong>Chrome:</strong> Click the lock icon → Site settings → Camera/Microphone → Allow</li>
              <li><strong>Firefox:</strong> Click the shield icon → Permissions → Camera/Microphone → Allow</li>
              <li><strong>Safari:</strong> Safari menu → Preferences → Websites → Camera/Microphone → Allow</li>
            </ul>
          </div>
        `;
      } else {
        errorMessage += err.message || 'Please check permissions and try again.';
      }
      
      setError(errorMessage + detailedInstructions);
      setConnectionStatus('error');
    }
  };

  useEffect(() => {
    try {
      if (user && roomId) {
        // Keep socket identity aligned with logged-in account (not stale chatUser)
        if (user.username && !user.isGuest) {
          try {
            const chatUser = JSON.parse(localStorage.getItem('chatUser') || '{}');
            if (chatUser.username !== user.username) {
              localStorage.setItem(
                'chatUser',
                JSON.stringify({ ...chatUser, username: user.username, email: user.email })
              );
            }
          } catch {
            // ignore
          }
        }

        if (!safeSocketService.isConnected()) {
          safeSocketService.connect();
        }
        const peerId = getLocalPeerId(user);
        socketService.joinRoom(roomId, {
          username: peerId,
          email: user?.email || peerId,
          id: peerId,
        });
        setTimeout(() => {
          setupSignaling();
          const waitForSocket = (attempt = 0) => {
            if (socketService.getSocketId()) {
              initializeVideoCall();
            } else if (attempt < 30) {
              setTimeout(() => waitForSocket(attempt + 1), 100);
            } else {
              setError('Could not connect to signaling server. Please refresh.');
              setConnectionStatus('error');
            }
          };
          waitForSocket();
        }, 100);
      }
    } catch (error) {
      console.error('VideoCall component error:', error);
      setComponentError('Video call component failed to initialize. Please refresh the page.');
    }

    return () => {
      try {
        cleanup();
        cleanupSignaling();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };
  }, [user, roomId]);

  const signalingHandlers = useRef({});

  const setupSignaling = () => {
    try {
      console.log('Setting up WebRTC signaling');

      const handlers = {
        'webrtc-offer': async (data) => {
          if (!isSignalForMe(data)) return;
          try {
            await handleIncomingOffer(data);
          } catch (error) {
            console.error('handleIncomingOffer failed:', error);
          }
        },
        'webrtc-answer': async (data) => {
          if (!isSignalForMe(data)) return;
          try {
            await handleIncomingAnswer(data);
          } catch (error) {
            console.error('handleIncomingAnswer failed:', error);
          }
        },
        'webrtc-ice-candidate': async (data) => {
          if (!isSignalForMe(data)) return;
          try {
            await handleIncomingIceCandidate(data);
          } catch (error) {
            console.error('handleIncomingIceCandidate failed:', error);
          }
        },
        'user-joined-video': (data) => {
          const peerSocketId = data.socketId;
          if (data.roomId !== roomId || !peerSocketId) return;
          if (peerSocketId === getMySocketId()) return;

          connectToPeer(peerSocketId, {
            socketId: peerSocketId,
            userId: data.userId,
            username: data.username,
            email: data.email,
          });
        },
        'video-participants': (data) => {
          if (data.roomId !== roomId || !Array.isArray(data.participants)) return;
          const mySocketId = getMySocketId();
          data.participants.forEach((p) => {
            if (!p.socketId || p.socketId === mySocketId) return;
            connectToPeer(p.socketId, p);
          });
        },
        'user-left-video': (data) => {
          if (data.roomId !== roomId) return;
          const leftSocketId = data.socketId;
          if (!leftSocketId) return;
          if (peerConnections.current[leftSocketId]) {
            peerConnections.current[leftSocketId].close();
            delete peerConnections.current[leftSocketId];
          }
          setRemoteStreams(prev => prev.filter(s => s.id !== leftSocketId));
        },
      };

      signalingHandlers.current = handlers;
      Object.entries(handlers).forEach(([event, fn]) => safeSocketService.on(event, fn));

      signalingReady.current = true;
    } catch (error) {
      console.error('Error setting up WebRTC signaling:', error);
      setError('Failed to setup video call signaling. Please refresh the page.');
    }
  };

  const cleanupSignaling = () => {
    try {
      Object.entries(signalingHandlers.current).forEach(([event, fn]) => {
        safeSocketService.off(event, fn);
      });
      signalingHandlers.current = {};
    } catch (error) {
      console.error('Error cleaning up WebRTC signaling:', error);
    }
  };

  // Ensure video stream is set when component mounts
  useEffect(() => {
    if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
      console.log('🎥 Setting video stream on mount - stream available:', !!localStream, 'element ready:', !!localVideoRef.current);
      setVideoStreamSafely(localStream);
    }
  }, [localStream, setVideoStreamSafely]);

  // Additional effect to handle video element availability
  useEffect(() => {
    const checkVideoElement = () => {
      if (localStream && localVideoRef.current && !localVideoRef.current.srcObject) {
        console.log('🎥 Video element available, setting stream - stream:', !!localStream, 'element:', !!localVideoRef.current);
        setVideoStreamSafely(localStream);
      }
    };

    // Check immediately
    checkVideoElement();

    // Also check after a short delay
    const timeoutId = setTimeout(checkVideoElement, 200);

    return () => clearTimeout(timeoutId);
  }, [localStream, setVideoStreamSafely]);

  const startCallWithStream = (stream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsVideoEnabled(stream.getVideoTracks().length > 0);
    setIsAudioEnabled(stream.getAudioTracks().length > 0);

    const setVideoStream = (retryCount = 0) => {
      if (localVideoRef.current) {
        setVideoStreamSafely(stream);
        return;
      }
      if (retryCount < 50) {
        setTimeout(() => setVideoStream(retryCount + 1), 100);
      } else if (stream.getVideoTracks().length > 0) {
        setError('Video element failed to initialize. Please refresh and try again.');
        setConnectionStatus('error');
      }
    };

    setVideoStream();
    setConnectionStatus('connected');
    setError('');
    setupWebRTCConnections();
  };

  const joinReceiveOnly = async () => {
    try {
      setError('');
      setConnectionStatus('connecting');
      localStreamRef.current = null;
      setLocalStream(null);
      setIsVideoEnabled(false);
      setIsAudioEnabled(false);
      setConnectionStatus('connected');
      setupWebRTCConnections();
    } catch (err) {
      console.error('Receive-only join failed:', err);
      setError('Could not join the call. Please refresh and try again.');
      setConnectionStatus('error');
    }
  };

  const initializeVideoCall = async () => {
    try {
      setConnectionStatus('connecting');
      setError(''); // Clear any previous errors
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser. Please use a modern browser with camera/microphone support.');
      }
      
      // Check if we're on HTTPS (required for getUserMedia in most browsers)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Camera and microphone access requires HTTPS. Please access the site via HTTPS.');
      }

      // Check current permission state
      try {
        const cameraPermission = await navigator.permissions.query({ name: 'camera' });
        const microphonePermission = await navigator.permissions.query({ name: 'microphone' });
        
        console.log('Camera permission state:', cameraPermission.state);
        console.log('Microphone permission state:', microphonePermission.state);
        
        if (cameraPermission.state === 'denied' || microphonePermission.state === 'denied') {
          throw new Error('Camera and microphone permissions have been denied. Please enable them in your browser settings and refresh the page.');
        }
      } catch (permError) {
        console.log('Permission query not supported or failed:', permError);
        // Continue anyway as permission query might not be supported
      }
      
      // Request permissions explicitly first
      console.log('Requesting camera and microphone permissions...');
      
      // Get user media with optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      startCallWithStream(stream);
      
    } catch (err) {
      if (err.name === 'NotReadableError') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          startCallWithStream(audioOnly);
          return;
        } catch (audioErr) {
          console.warn('Camera busy; audio-only also failed:', audioErr);
        }
      }
      if (err.name === 'NotAllowedError') {
        console.warn('Camera/mic denied — joining receive-only so signaling still works');
        await joinReceiveOnly();
        return;
      }

      console.error('Error accessing camera/microphone:', err);
      
      let errorMessage = 'Unable to access camera/microphone. ';
      let detailedInstructions = '';
      
      if (err.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found. ';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>To fix this issue:</h4>
            <ol>
              <li>Make sure your camera and microphone are connected</li>
              <li>Check if other applications can access your camera/microphone</li>
              <li>Try refreshing the page</li>
              <li>If using external devices, ensure they're properly connected</li>
            </ol>
          </div>
        `;
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Camera is in use (often another browser tab on the same PC). ';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>Testing with two browsers on one computer?</h4>
            <ol>
              <li>Keep camera on in <strong>one</strong> tab only</li>
              <li>Click <strong>Join without camera</strong> below to watch the other person</li>
              <li>Or close the other tab’s video call, then click Try Again</li>
            </ol>
          </div>
        `;
      } else if (err.name === 'OverconstrainedError') {
        errorMessage += 'Camera settings are not supported. ';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>To fix this issue:</h4>
            <ol>
              <li>Try refreshing the page</li>
              <li>Check if your camera supports the required settings</li>
              <li>Update your camera drivers</li>
              <li>Try using a different camera if available</li>
            </ol>
          </div>
        `;
      } else if (err.name === 'SecurityError') {
        errorMessage += 'Security error. ';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>To fix this issue:</h4>
            <ol>
              <li>Make sure you're accessing the site via HTTPS (https://)</li>
              <li>Check that your browser supports WebRTC</li>
              <li>Try refreshing the page</li>
              <li>If on localhost, ensure you're using http://localhost or https://localhost</li>
            </ol>
          </div>
        `;
      } else {
        errorMessage += err.message || 'Please check permissions and try again.';
        detailedInstructions = `
          <div style="text-align: left; margin-top: 15px;">
            <h4>General troubleshooting steps:</h4>
            <ol>
              <li>Refresh the page and try again</li>
              <li>Check your browser's camera/microphone permissions</li>
              <li>Ensure you're using a modern browser (Chrome, Firefox, Safari, Edge)</li>
              <li>Try using an incognito/private window</li>
              <li>Restart your browser</li>
            </ol>
          </div>
        `;
      }
      
      setError(errorMessage + detailedInstructions);
      setConnectionStatus('error');
    }
  };

  const setupWebRTCConnections = () => {
    setConnectionStatus('connected');
    announceVideoJoin();
  };

  const startWebRTCConnection = async (peerSocketId, participant = null, initiateOffer = true) => {
    const mySocketId = getMySocketId();
    if (!mySocketId) {
      console.warn('No socket id — skipping WebRTC connection');
      return null;
    }
    if (peerConnections.current[peerSocketId]) {
      return peerConnections.current[peerSocketId];
    }

    setRemoteStreams(prev =>
      prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'connecting' } : s))
    );

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    });

    if (peerConnections.current[peerSocketId]) {
      peerConnection.close();
      return peerConnections.current[peerSocketId];
    }
    peerConnections.current[peerSocketId] = peerConnection;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    } else {
      peerConnection.addTransceiver('video', { direction: 'recvonly' });
      peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    }

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => {
        const existing = prev.find(s => s.id === peerSocketId);
        if (existing) {
          return prev.map(s =>
            s.id === peerSocketId
              ? { ...s, stream: remoteStream, connectionStatus: 'connected' }
              : s
          );
        }
        return [
          ...prev,
          {
            id: peerSocketId,
            name: displayName(participant, participant?.username || 'Guest'),
            stream: remoteStream,
            isVideoEnabled: true,
            isAudioEnabled: true,
            connectionStatus: 'connected',
          },
        ];
      });
      setConnectionStatus('connected');
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'failed') {
        setRemoteStreams(prev =>
          prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'failed' } : s))
        );
      } else if (peerConnection.connectionState === 'disconnected') {
        setRemoteStreams(prev =>
          prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'disconnected' } : s))
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (
        peerConnection.iceConnectionState === 'connected' ||
        peerConnection.iceConnectionState === 'completed'
      ) {
        setRemoteStreams(prev =>
          prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'connected' } : s))
        );
        setConnectionStatus('connected');
      } else if (peerConnection.iceConnectionState === 'failed') {
        setTimeout(() => {
          if (peerConnections.current[peerSocketId]) {
            peerConnections.current[peerSocketId].restartIce();
          }
        }, 2000);
        setRemoteStreams(prev =>
          prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'ice-retrying' } : s))
        );
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && mySocketId) {
        safeSocketService.emit('webrtc-ice-candidate', {
          roomId,
          to: peerSocketId,
          from: mySocketId,
          candidate: event.candidate,
        });
      }
    };

    if (!initiateOffer) {
      return peerConnection;
    }

    const failTimeout = setTimeout(() => {
      if (
        peerConnection.connectionState !== 'connected' &&
        peerConnection.iceConnectionState !== 'connected' &&
        peerConnection.iceConnectionState !== 'completed'
      ) {
        setRemoteStreams(prev =>
          prev.map(s =>
            s.id === peerSocketId && !s.stream
              ? { ...s, connectionStatus: 'failed' }
              : s
          )
        );
      }
    }, 20000);

    peerConnection.addEventListener('connectionstatechange', () => {
      if (peerConnection.connectionState === 'connected') {
        clearTimeout(failTimeout);
      }
    });

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnection.setLocalDescription(offer);
      safeSocketService.emit('webrtc-offer', {
        roomId,
        to: peerSocketId,
        from: mySocketId,
        offer,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      setRemoteStreams(prev =>
        prev.map(s => (s.id === peerSocketId ? { ...s, connectionStatus: 'error' } : s))
      );
    }
  };

  const handleIncomingOffer = async (data) => {
    const peerSocketId = data.from;
    const mySocketId = getMySocketId();
    let peerConnection = peerConnections.current[peerSocketId];

    if (peerConnection?.signalingState === 'have-local-offer') {
      if (shouldInitiateOffer(mySocketId, peerSocketId)) {
        return;
      }
      try {
        await peerConnection.setLocalDescription({ type: 'rollback' });
      } catch (rollbackErr) {
        console.warn('Offer glare rollback failed:', rollbackErr?.message);
        peerConnection.close();
        delete peerConnections.current[peerSocketId];
        peerConnection = null;
      }
    }

    if (!peerConnection) {
      peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all',
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
      } else {
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
      }

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setRemoteStreams(prev => {
          const existing = prev.find(s => s.id === peerSocketId);
          if (existing) {
            return prev.map(s =>
              s.id === peerSocketId
                ? { ...s, stream: remoteStream, connectionStatus: 'connected' }
                : s
            );
          }
          return [
            ...prev,
            {
              id: peerSocketId,
              name: data.username || 'Guest',
              stream: remoteStream,
              isVideoEnabled: true,
              isAudioEnabled: true,
              connectionStatus: 'connected',
            },
          ];
        });
        setConnectionStatus('connected');
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && mySocketId) {
          safeSocketService.emit('webrtc-ice-candidate', {
            roomId,
            to: peerSocketId,
            from: mySocketId,
            candidate: event.candidate,
          });
        }
      };

      peerConnections.current[peerSocketId] = peerConnection;

      setRemoteStreams(prev => {
        if (prev.some(s => s.id === peerSocketId)) return prev;
        return [
          ...prev,
          {
            id: peerSocketId,
            name: data.username || 'Guest',
            stream: null,
            isVideoEnabled: true,
            isAudioEnabled: true,
            connectionStatus: 'connecting',
          },
        ];
      });
    }

    try {
      await peerConnection.setRemoteDescription(data.offer);
      await flushPendingCandidates(peerSocketId);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      safeSocketService.emit('webrtc-answer', {
        roomId,
        to: peerSocketId,
        from: mySocketId,
        answer,
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleIncomingAnswer = async (data) => {
    const peerSocketId = data.from;
    const peerConnection = peerConnections.current[peerSocketId];

    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(data.answer);
        await flushPendingCandidates(peerSocketId);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  };

  const handleIncomingIceCandidate = async (data) => {
    const peerSocketId = data.from;
    const peerConnection = peerConnections.current[peerSocketId];

    if (!peerConnection || !data.candidate) return;

    if (!peerConnection.remoteDescription) {
      queueIceCandidate(peerSocketId, data.candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      // Replace video track with screen share
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = localStreamRef.current.getVideoTracks()[0];
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
      
      setIsScreenSharing(true);
      
      // Stop screen share when user clicks stop
      videoTrack.onended = () => {
        setIsScreenSharing(false);
      };
    } catch (err) {
      console.error('Error sharing screen:', err);
      setError('Unable to share screen. Please try again.');
    }
  };

  const stopScreenShare = () => {
    try {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
      }
      setIsScreenSharing(false);
    } catch (err) {
      console.error('Error stopping screen share:', err);
    }
  };

  const leaveCall = () => {
    cleanup();
    onClose();
  };

  const cleanup = () => {
    // Clear connection timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      setConnectionTimeout(null);
    }
    
    // Notify other participants that we're leaving
    try {
      safeSocketService.emit('user-left-video', {
        roomId,
        socketId: getMySocketId(),
        userId: getLocalPeerId(user),
      });
    } catch (error) {
      console.error('Failed to emit user-left-video:', error);
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
    }
    
    // Close all peer connections
    Object.keys(peerConnections.current).forEach(userId => {
      const pc = peerConnections.current[userId];
      if (pc) {
        pc.close();
      }
    });
    peerConnections.current = {};
    hasAnnouncedVideo.current = false;
    signalingReady.current = false;
    
    // Clear state
    setLocalStream(null);
    setRemoteStreams([]);
    setConnectionStatus('disconnected');
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
    setIsScreenSharing(false);
    setError('');
  };

  if (!user) {
    return (
      <div className="video-call-overlay" onClick={onClose}>
        <div className="video-call-container" onClick={e => e.stopPropagation()}>
          <div className="error-message">
            Please wait for your session to load, or refresh the page.
          </div>
        </div>
      </div>
    );
  }

  if (componentError) {
    return (
      <div className="video-call-overlay" onClick={onClose}>
        <div className="video-call-container" onClick={e => e.stopPropagation()}>
          <div className="video-call-header">
            <h2>🎥 Video Call - Room {roomId}</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="error-message">
            {componentError}
          </div>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-primary"
              style={{ margin: '10px' }}
            >
              🔄 Refresh Page
            </button>
            <button 
              onClick={onClose} 
              className="btn-secondary"
              style={{ margin: '10px' }}
            >
              ❌ Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="video-call-overlay" onClick={onClose}>
      <div className="video-call-container" onClick={e => e.stopPropagation()}>
        {/* Google Meet-style Header */}
        <div className="meet-header">
          <div className="meet-header-left">
            <div className="meet-info">
              <h2>Video Call</h2>
              <span className="room-info">Room {roomId}</span>
            </div>
          </div>
          <div className="meet-header-right">
            <button className="meet-close-btn" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="meet-error">
            <div className="error-icon">⚠️</div>
            <div className="error-text" dangerouslySetInnerHTML={{ __html: error }}></div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
              <button type="button" onClick={joinReceiveOnly} className="meet-control-btn meet-primary">
                Join without camera
              </button>
              <button type="button" onClick={initializeVideoCall} className="meet-control-btn meet-secondary">
                Try again
              </button>
            </div>
          </div>
        )}

        {componentError && (
          <div className="meet-error">
            <div className="error-icon">❌</div>
            <div className="error-text">{componentError}</div>
          </div>
        )}


        {/* Connection Status */}
        {connectionStatus === 'connecting' && (
          <div className="meet-connecting">
            <div className="connecting-spinner"></div>
            <h3>Connecting to video call...</h3>
            <p>Please wait while we set up your video call</p>
            <p className="connection-details">
              {remoteStreams.length > 0 ? 
                `Found ${remoteStreams.length} participant(s). Establishing connections...` : 
                'Setting up your video call...'
              }
            </p>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="meet-connecting">
            <div className="error-icon">❌</div>
            <h3>Connection Failed</h3>
            <p>Unable to start video call. Please check your camera and microphone permissions.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
              <button onClick={requestPermissionsManually} className="meet-control-btn meet-primary">
                🎥 Request Camera Access
              </button>
              <button onClick={initializeVideoCall} className="meet-control-btn meet-secondary">
                🔄 Try Again
              </button>
              <button type="button" onClick={joinReceiveOnly} className="meet-control-btn meet-primary">
                Join without camera
              </button>
              <button onClick={() => window.location.reload()} className="meet-control-btn meet-secondary">
                🔄 Refresh Page
              </button>
            </div>
          </div>
        )}

        {(connectionStatus === 'connected' || connectionStatus === 'connecting') && (
          <div className="meet-content">
            {/* Main Video Grid */}
            <div className={`meet-video-grid ${remoteStreams.length === 0 ? 'solo-call' : ''}`}>
              {/* Local Video - Google Meet style */}
              <div className={`meet-participant local-participant ${remoteStreams.length === 0 ? 'solo-participant' : ''}`}>
                <div className="meet-video-container">
                  {localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="meet-video"
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover',
                      backgroundColor: '#000',
                      border: remoteStreams.length === 0 ? 'none' : '2px solid #4285f4'
                    }}
                    onCanPlay={() => {
                      if (localVideoRef.current && localStream) {
                        attachStreamToVideo(localVideoRef.current, localStream);
                      }
                    }}
                    onError={(e) => {
                      console.error('Local video error:', e);
                    }}
                  />
                  ) : (
                    <div className="meet-video-placeholder">
                      <div className="meet-avatar">You</div>
                      <div className="meet-participant-info">
                        <span className="meet-participant-name">No camera</span>
                      </div>
                    </div>
                  )}
                  <div className="meet-video-overlay">
                    <div className="participant-info">
                      <span className="participant-name">You</span>
                      <div className="participant-status">
                        {!isVideoEnabled && <span className="status-icon video-off">📹</span>}
                        {!isAudioEnabled && <span className="status-icon audio-off">🎤</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Solo call message */}
              {remoteStreams.length === 0 && connectionStatus === 'connected' && (
                <div className="solo-call-message">
                  <div className="solo-call-content">
                    <h3>You're in the call</h3>
                    <p>Waiting for others to join...</p>
                    <div className="solo-call-info">
                      <span>Share this room with others to start the video call</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Remote Videos */}
              {remoteStreams.map((participant, index) => (
                <div key={participant.id} className="meet-participant remote-participant">
                  <div className="meet-video-container">
                    {participant.stream ? (
                      <video
                        ref={(el) => {
                          remoteVideoRefs.current[index] = el;
                          if (el && participant.stream) {
                            attachStreamToVideo(el, participant.stream);
                          }
                        }}
                        autoPlay
                        playsInline
                        className="meet-video"
                        onLoadedMetadata={() => {}}
                        onError={(e) => console.error('Remote video error:', participant.name, e)}
                      />
                    ) : (
                      <div className="meet-video-placeholder">
                        <div className="meet-avatar">
                          {participant.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="meet-participant-info">
                          <span className="meet-participant-name">{participant.name}</span>
                          {participant.connectionStatus === 'connecting' && <div className="meet-connecting">Connecting...</div>}
                          {participant.connectionStatus === 'ready' && <div className="meet-ready">Ready</div>}
                        </div>
                      </div>
                    )}
                    <div className="meet-video-overlay">
                      <div className="participant-info">
                        <span className="participant-name">{participant.name}</span>
                        <div className="participant-status">
                          {!participant.isVideoEnabled && <span className="status-icon video-off">📹</span>}
                          {!participant.isAudioEnabled && <span className="status-icon audio-off">🎤</span>}
                          {participant.stream && <span className="status-icon connected">🟢</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Google Meet-style Controls */}
        <div className="meet-controls">
          <div className="meet-controls-left">
            <button
              onClick={() => {
                if (localStream) {
                  const videoTrack = localStream.getVideoTracks()[0];
                  if (videoTrack) {
                    videoTrack.enabled = !isVideoEnabled;
                    setIsVideoEnabled(!isVideoEnabled);
                  }
                }
              }}
              className={`meet-control-btn ${isVideoEnabled ? 'meet-active' : 'meet-inactive'}`}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z"></path>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </button>
            
            <button
              onClick={() => {
                if (localStream) {
                  const audioTrack = localStream.getAudioTracks()[0];
                  if (audioTrack) {
                    audioTrack.enabled = !isAudioEnabled;
                    setIsAudioEnabled(!isAudioEnabled);
                  }
                }
              }}
              className={`meet-control-btn ${isAudioEnabled ? 'meet-active' : 'meet-inactive'}`}
              title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>

            <button
              onClick={() => {
                if (isScreenSharing) {
                  stopScreenShare();
                } else {
                  startScreenShare();
                }
              }}
              className={`meet-control-btn ${isScreenSharing ? 'meet-active' : 'meet-inactive'}`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </button>
          </div>

          <div className="meet-controls-center">
            {/* Center controls can be added here if needed */}
          </div>

          <div className="meet-controls-right">
            <button onClick={onClose} className="meet-control-btn meet-end-call" title="End call">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoCall;
