// api.js
import { getApiUrl } from '../config';

export { getApiUrl };
export const API_BASE_URL = getApiUrl();

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      message: data.message || `Request failed (${response.status})`,
      ...data,
    };
  }
  return data;
}

// Real API functions that call your backend
export const api = {
  // Auth
  login: async (credentials) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error logging in:', error);
      return { success: false, message: 'Failed to connect to server' };
    }
  },

  register: async (userData) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error registering:', error);
      return { success: false, message: 'Failed to connect to server' };
    }
  },

  // Users
  getCurrentUser: async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return { success: false, message: 'No authentication token' };
      }

      const response = await fetch(`${getApiUrl()}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error fetching current user:', error);
      return { success: false, message: 'Failed to fetch user profile' };
    }
  },

  updateProfile: async (formData) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return { success: false, message: 'No authentication token' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating profile:', error);
      return { success: false, message: 'Failed to update profile' };
    }
  },

  changePassword: async (passwordData) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return { success: false, message: 'No authentication token' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(passwordData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error changing password:', error);
      return { success: false, message: 'Failed to change password' };
    }
  },

  forgotPassword: async (email) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error requesting password reset:', error);
      return { success: false, message: 'Failed to connect to server' };
    }
  },

  validateResetToken: async (token) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/reset-password/${token}`);
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error validating reset token:', error);
      return { success: false, message: 'Failed to connect to server' };
    }
  },

  resetPassword: async ({ token, newPassword }) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error resetting password:', error);
      return { success: false, message: 'Failed to connect to server' };
    }
  },

  // Rooms - Real API calls to your backend
  createRoom: async (roomData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(roomData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating room:', error);
      return { success: false, message: 'Failed to create room' };
    }
  },

  getRooms: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching rooms:', error);
      return { success: false, rooms: [] };
    }
  },

  joinRoom: async (roomId, password) => {
    try {
      const username = localStorage.getItem('preferredUsername') || 'Guest';
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error joining room:', error);
      return { success: false, message: 'Failed to join room' };
    }
  },

  leaveRoom: async (roomId) => {
    try {
      // Client-side logic - just remove from local storage
      return { success: true, message: 'Successfully left room' };
    } catch (error) {
      console.error('Error leaving room:', error);
      return { success: false, message: 'Failed to leave room' };
    }
  },

  getRoom: async (roomName, username) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomName}?username=${username}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching room:', error);
      return { success: false, message: 'Failed to fetch room' };
    }
  },

  // Messages
  getMessages: async (roomId, username) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/messages?username=${username}`);
      const messages = await response.json();
      return messages;
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  },

  sendMessage: async (roomId, messageData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
      return { success: false, message: 'Failed to send message' };
    }
  },

  deleteMessage: async (roomId, messageId, username) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error deleting message:', error);
      return { success: false, message: 'Failed to delete message' };
    }
  },

  // Meetings
  createMeeting: async (meetingData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meetingData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating meeting:', error);
      return { success: false, message: 'Failed to create meeting' };
    }
  },

  getMeetingsByRoom: async (roomId, status) => {
    try {
      const url = status
        ? `${API_BASE_URL}/api/meetings/room/${roomId}?status=${status}`
        : `${API_BASE_URL}/api/meetings/room/${roomId}`;
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      console.error('Error fetching meetings:', error);
      return [];
    }
  },

  getMeetingById: async (meetingId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching meeting:', error);
      return { success: false, message: 'Failed to fetch meeting' };
    }
  },

  updateMeetingStatus: async (meetingId, status) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating meeting status:', error);
      return { success: false, message: 'Failed to update meeting status' };
    }
  },

  deleteMeeting: async (meetingId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      return { success: false, message: 'Failed to delete meeting' };
    }
  },

  notifyMeeting: async (meetingId, notificationData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error sending meeting notification:', error);
      return { success: false, message: 'Failed to send notification' };
    }
  },

  // Projects
  createProject: async (projectData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error creating project:', error);
      return { success: false, message: 'Failed to create project' };
    }
  },

  getProjectsByRoom: async (roomId, status = 'active') => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/room/${roomId}?status=${status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching projects:', error);
      return { success: false, projects: [] };
    }
  },

  getProject: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching project:', error);
      return { success: false, message: 'Failed to fetch project' };
    }
  },

  pasteCodeToProject: async (projectId, fileData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files/paste`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileData),
      });
      return await response.json();
    } catch (error) {
      console.error('Error pasting code:', error);
      return { success: false, message: 'Failed to paste code' };
    }
  },

  uploadFileToProject: async (projectId, file, uploadedBy) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', uploadedBy);

      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files/upload`, {
        method: 'POST',
        body: formData,
      });
      return await response.json();
    } catch (error) {
      console.error('Error uploading file:', error);
      return { success: false, message: 'Failed to upload file' };
    }
  },

  updateProjectFile: async (projectId, fileId, content, lastModifiedBy) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, lastModifiedBy }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating file:', error);
      return { success: false, message: 'Failed to update file' };
    }
  },

  compileProject: async (projectId, compiledBy) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ compiledBy }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error compiling project:', error);
      return { success: false, message: 'Failed to compile project' };
    }
  },

  getProjectPreview: (projectId) => {
    return `${API_BASE_URL}/api/projects/${projectId}/preview`;
  },

  // JDoodle - Code Execution
  executeCode: async (codeData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jdoodle/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(codeData),
      });
      return await parseJsonResponse(response);
    } catch (error) {
      console.error('Error executing code:', error);
      return { success: false, message: 'Failed to execute code', error: error.message };
    }
  },

  // Admin Functions
  getRoomMembers: async (roomId, username) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/members?username=${username}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching room members:', error);
      return { success: false, message: 'Failed to fetch members' };
    }
  },

  removeMember: async (roomId, targetUsername, adminUsername) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/members/${targetUsername}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: adminUsername }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error removing member:', error);
      return { success: false, message: 'Failed to remove member' };
    }
  },

  promoteToAdmin: async (roomId, targetUsername, adminUsername) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: targetUsername, adminUsername }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error promoting user:', error);
      return { success: false, message: 'Failed to promote user' };
    }
  },

  demoteAdmin: async (roomId, targetUsername, adminUsername) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/admins/${targetUsername}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: adminUsername }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error demoting admin:', error);
      return { success: false, message: 'Failed to demote admin' };
    }
  },

  inviteAdmin: async (roomId, username, email, invitedBy) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/invite-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, invitedBy }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error inviting admin:', error);
      return { success: false, message: 'Failed to invite admin' };
    }
  },

  updateRoomSettings: async (roomId, username, settings) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, settings }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating room settings:', error);
      return { success: false, message: 'Failed to update settings' };
    }
  },

  updateRoomName: async (roomId, username, newName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/name`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, newName }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating room name:', error);
      return { success: false, message: 'Failed to update room name' };
    }
  },

  updateRoomColor: async (roomId, username, color) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/color`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, color }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error updating room color:', error);
      return { success: false, message: 'Failed to update room color' };
    }
  },

  getRoomPermissions: async (roomId, username) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/permissions/${username}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching permissions:', error);
      return { success: false, message: 'Failed to fetch permissions' };
    }
  },

  // Health check
  healthCheck: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { success: false, message: 'Backend is not responding' };
    }
  }
};
