import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../config';
import '../styles/components/AdminPanel.css';

function AdminPanel({ roomId, onClose, isVisible }) {
  const { user, authUser } = useAuth();
  const [activeTab, setActiveTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [roomInfo, setRoomInfo] = useState({
    name: '',
    color: '#007bff',
    settings: {}
  });
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [permissions, setPermissions] = useState({});
  const [showInviteAdmin, setShowInviteAdmin] = useState(false);
  const [inviteAdminEmail, setInviteAdminEmail] = useState('');
  const [inviteAdminUsername, setInviteAdminUsername] = useState('');

  // Helper function to get user identifier consistently
  const getUserIdentifier = () =>
    user?.username || user?.email || authUser?.username || authUser?.email || 'Anonymous';

  // Load room members and admin info
  useEffect(() => {
    if (isVisible && roomId) {
      loadRoomInfo();
      loadPermissions();
    }
  }, [isVisible, roomId]);

  const loadRoomInfo = async () => {
    setLoading(true);
    setError('');
    try {
      const apiUrl = getApiUrl();
      const username = getUserIdentifier();
      console.log('Loading room info for:', roomId, 'as user:', username);
      
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/members?username=${username}`);
      console.log('AdminPanel response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('AdminPanel data received:', data);
        setMembers(data.members || []);
        setAdmins(data.admins || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('AdminPanel error response:', errorData);
        setError(`Failed to load room information: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('AdminPanel error:', err);
      setError(`Error loading room information: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: getUserIdentifier() })
      });

      if (response.ok) {
        setSuccess('Message deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to delete message');
      }
    } catch (err) {
      setError('Error deleting message');
    }
  };

  const removeMember = async (username) => {
    if (window.confirm(`Are you sure you want to remove ${username} from this room?`)) {
      try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/rooms/${roomId}/members/${username}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username: getUserIdentifier() })
        });

        if (response.ok) {
          setSuccess(`${username} removed from room`);
          loadRoomInfo(); // Refresh the list
          setTimeout(() => setSuccess(''), 3000);
        } else {
          setError('Failed to remove member');
        }
      } catch (err) {
        setError('Error removing member');
      }
    }
  };

  const promoteToAdmin = async (username) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: username,
          adminUsername: getUserIdentifier()
        })
      });

      if (response.ok) {
        setSuccess(`${username} promoted to admin`);
        loadRoomInfo(); // Refresh the list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to promote user');
      }
    } catch (err) {
      setError('Error promoting user');
    }
  };

  const demoteAdmin = async (username) => {
    if (window.confirm(`Are you sure you want to demote ${username} from admin?`)) {
      try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/rooms/${roomId}/admins/${username}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username: getUserIdentifier() })
        });

        if (response.ok) {
          setSuccess(`${username} demoted from admin`);
          loadRoomInfo(); // Refresh the list
          setTimeout(() => setSuccess(''), 3000);
        } else {
          setError('Failed to demote admin');
        }
      } catch (err) {
        setError('Error demoting admin');
      }
    }
  };

  // Load user permissions
  const loadPermissions = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/permissions/${getUserIdentifier()}`);
      
      if (response.ok) {
        const data = await response.json();
        setPermissions(data.permissions);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
    }
  };

  // Update room name
  const updateRoomName = async () => {
    if (!newRoomName.trim()) {
      setError('Room name cannot be empty');
      return;
    }

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/name`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: getUserIdentifier(),
          newName: newRoomName.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRoomInfo(prev => ({ ...prev, name: data.newName }));
        setSuccess('Room name updated successfully');
        setEditingRoomName(false);
        setNewRoomName('');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update room name');
      }
    } catch (err) {
      setError('Error updating room name');
    }
  };

  // Update room color
  const updateRoomColor = async (color) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/color`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: getUserIdentifier(),
          color: color
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRoomInfo(prev => ({ ...prev, color: data.color }));
        setSuccess('Room color updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update room color');
      }
    } catch (err) {
      setError('Error updating room color');
    }
  };

  // Update room settings
  const updateRoomSettings = async (newSettings) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: getUserIdentifier(),
          settings: newSettings
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRoomInfo(prev => ({ ...prev, settings: data.settings }));
        setSuccess('Room settings updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update room settings');
      }
    } catch (err) {
      setError('Error updating room settings');
    }
  };

  // Invite new member as admin
  const inviteMemberAsAdmin = async () => {
    if (!inviteAdminEmail.trim() || !inviteAdminUsername.trim()) {
      setError('Please provide both email and username');
      return;
    }

    try {
      const apiUrl = getApiUrl();
      
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}/invite-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: inviteAdminUsername,
          email: inviteAdminEmail,
          invitedBy: getUserIdentifier()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(data.message || `${inviteAdminUsername} invited as admin successfully`);
        setInviteAdminEmail('');
        setInviteAdminUsername('');
        setShowInviteAdmin(false);
        loadRoomInfo(); // Refresh the list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to invite admin');
      }
    } catch (err) {
      setError('Error inviting member as admin');
    }
  };

  if (!isVisible) return null;

  return (
    <div className="admin-panel-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-panel-header">
          <h2>Room Administration</h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="admin-tabs">
          <button 
            className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Members ({members.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'customize' ? 'active' : ''}`}
            onClick={() => setActiveTab('customize')}
          >
            Customize
          </button>
          <button 
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        <div className="admin-content">
          {activeTab === 'members' && (
            <div className="members-section">
              <h3>Room Members</h3>
              {loading ? (
                <div className="loading">Loading members...</div>
              ) : (
                <div className="members-list">
                  {members.map((member, index) => (
                    <div key={index} className="member-item">
                      <div className="member-info">
                        <div className="member-avatar">
                          {member.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-details">
                          <span className="member-name">{member.username}</span>
                          <div className="member-badges">
                            {member.isCreator && <span className="badge creator">Creator</span>}
                            {member.isAdmin && <span className="badge admin">Admin</span>}
                          </div>
                        </div>
                      </div>
                      <div className="member-actions">
                        {!member.isCreator && member.username !== (user.username || user.email) && (
                          <>
                            {!member.isAdmin ? (
                              <button 
                                className="action-button promote"
                                onClick={() => promoteToAdmin(member.username)}
                              >
                                Promote to Admin
                              </button>
                            ) : (
                              <button 
                                className="action-button demote"
                                onClick={() => demoteAdmin(member.username)}
                              >
                                Demote Admin
                              </button>
                            )}
                            <button 
                              className="action-button remove"
                              onClick={() => removeMember(member.username)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite Admin Section */}
              {permissions.canManageAdmins && (
                <div className="invite-admin-section">
                  <div className="section-header">
                    <h4>Invite New Admin</h4>
                    <button 
                      className="invite-admin-toggle"
                      onClick={() => setShowInviteAdmin(!showInviteAdmin)}
                    >
                      {showInviteAdmin ? 'Cancel' : 'Invite Admin'}
                    </button>
                  </div>

                  {showInviteAdmin && (
                    <div className="invite-admin-form">
                      <div className="form-group">
                        <label>Username</label>
                        <input
                          type="text"
                          value={inviteAdminUsername}
                          onChange={(e) => setInviteAdminUsername(e.target.value)}
                          placeholder="Enter username"
                          className="invite-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          value={inviteAdminEmail}
                          onChange={(e) => setInviteAdminEmail(e.target.value)}
                          placeholder="Enter email address"
                          className="invite-input"
                        />
                      </div>
                      <div className="form-actions">
                        <button 
                          className="invite-button"
                          onClick={inviteMemberAsAdmin}
                          disabled={!inviteAdminUsername.trim() || !inviteAdminEmail.trim()}
                        >
                          Invite as Admin
                        </button>
                        <button 
                          className="cancel-button"
                          onClick={() => {
                            setShowInviteAdmin(false);
                            setInviteAdminEmail('');
                            setInviteAdminUsername('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'customize' && (
            <div className="customize-section">
              <h3>Room Customization</h3>
              
              {/* Room Name */}
              <div className="customize-item">
                <label>Room Name</label>
                {editingRoomName ? (
                  <div className="edit-room-name">
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder="Enter new room name"
                      className="room-name-input"
                    />
                    <div className="edit-actions">
                      <button 
                        className="save-button"
                        onClick={updateRoomName}
                        disabled={!permissions.canEditRoomSettings}
                      >
                        Save
                      </button>
                      <button 
                        className="cancel-button"
                        onClick={() => {
                          setEditingRoomName(false);
                          setNewRoomName('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="room-name-display">
                    <span className="current-room-name">{roomInfo.name || roomId}</span>
                    <button 
                      className="edit-button"
                      onClick={() => {
                        setNewRoomName(roomInfo.name || roomId);
                        setEditingRoomName(true);
                      }}
                      disabled={!permissions.canEditRoomSettings}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Room Color */}
              <div className="customize-item">
                <label>Room Color</label>
                <div className="color-picker-section">
                  <div className="current-color">
                    <span>Current: </span>
                    <div 
                      className="color-preview" 
                      style={{ backgroundColor: roomInfo.color }}
                    ></div>
                    <span className="color-value">{roomInfo.color}</span>
                  </div>
                  <div className="color-options">
                    {[
                      '#007bff', '#28a745', '#dc3545', '#ffc107', 
                      '#17a2b8', '#6f42c1', '#e83e8c', '#fd7e14',
                      '#20c997', '#6c757d', '#343a40', '#f8f9fa'
                    ].map(color => (
                      <button
                        key={color}
                        className={`color-option ${roomInfo.color === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateRoomColor(color)}
                        disabled={!permissions.canEditRoomSettings}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Color Input */}
              <div className="customize-item">
                <label>Custom Color</label>
                <div className="custom-color-input">
                  <input
                    type="color"
                    value={roomInfo.color}
                    onChange={(e) => updateRoomColor(e.target.value)}
                    disabled={!permissions.canEditRoomSettings}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={roomInfo.color}
                    onChange={(e) => setRoomInfo(prev => ({ ...prev, color: e.target.value }))}
                    onBlur={() => updateRoomColor(roomInfo.color)}
                    disabled={!permissions.canEditRoomSettings}
                    className="color-text-input"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {!permissions.canEditRoomSettings && (
                <div className="permission-notice">
                  <p>You don't have permission to customize this room.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-section">
              <h3>Room Settings</h3>
              <div className="settings-form">
                <div className="setting-item">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={roomInfo.settings.allowMemberInvites !== false}
                      onChange={(e) => updateRoomSettings({ allowMemberInvites: e.target.checked })}
                      disabled={!permissions.canEditRoomSettings}
                    />
                    Allow members to invite others
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={roomInfo.settings.allowMessageDeletion !== false}
                      onChange={(e) => updateRoomSettings({ allowMessageDeletion: e.target.checked })}
                      disabled={!permissions.canEditRoomSettings}
                    />
                    Allow message deletion
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={roomInfo.settings.allowMemberRemoval !== false}
                      onChange={(e) => updateRoomSettings({ allowMemberRemoval: e.target.checked })}
                      disabled={!permissions.canEditRoomSettings}
                    />
                    Allow member removal
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={roomInfo.settings.requireAdminApproval === true}
                      onChange={(e) => updateRoomSettings({ requireAdminApproval: e.target.checked })}
                      disabled={!permissions.canEditRoomSettings}
                    />
                    Require admin approval for new members
                  </label>
                </div>
                
                {!permissions.canEditRoomSettings && (
                  <div className="permission-notice">
                    <p>You don't have permission to modify room settings.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
