import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import socketService from '../services/socketService';
import { getApiUrl } from '../config';
import '../styles/components/CollaborativeEditor.css';

const getUserId = (u) => {
  if (u && !u.isGuest) {
    if (u.username) return u.username;
    if (u.email) return u.email;
  }
  return u?.email || u?.username || u?.id || 'anonymous';
};
const getFileId = (f) => f?.fileId || f?._id || f?.id;

const getFileTypeFromName = (fileName) => {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    css: 'css',
    html: 'html',
    htm: 'html',
    json: 'json',
    md: 'other',
    txt: 'other',
  };
  return map[ext] || 'other';
};

const normalizeParticipant = (p) => {
  if (typeof p === 'string') {
    return { username: p, email: p };
  }
  return {
    username: p?.username || p?.email || 'member',
    email: p?.email || p?.username || 'member',
  };
};

const downloadBlob = (filename, content, mimeType = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function CollaborativeEditor({ roomId, onClose, participants = [] }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [compilationStatus, setCompilationStatus] = useState('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const previewUrlRef = useRef(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showCodePaste, setShowCodePaste] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('nodejs');
  const [fileName, setFileName] = useState('');
  const [showSyntaxHighlighting, setShowSyntaxHighlighting] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showSideScroller, setShowSideScroller] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  
  // Live collaborative editing state
  const [editingUsers, setEditingUsers] = useState(new Map()); // userId -> { position, selection, color, timestamp }
  const [userCursors, setUserCursors] = useState(new Map()); // userId -> cursor info
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Map()); // userId -> typing info
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  
  const fileInputRef = useRef(null);
  const contentRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const cursorUpdateTimeoutRef = useRef(null);
  const newProjectInputRef = useRef(null);
  const selectedProjectRef = useRef(null);
  const selectedFileRef = useRef(null);
  const userRef = useRef(null);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);

  const setPreviewFromHtml = useCallback((html) => {
    if (previewUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPreviewHtml(html);
    setShowPreview(true);
  }, []);

  const closePreview = useCallback(() => {
    if (previewUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setPreviewUrl('');
    setPreviewHtml('');
    setShowPreview(false);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
    selectedFileRef.current = selectedFile;
    userRef.current = user;
    autoSaveEnabledRef.current = autoSaveEnabled;
  }, [selectedProject, selectedFile, user, autoSaveEnabled]);

  useEffect(() => {
    if (roomId) {
      loadProjects();
    }
  }, [roomId]);

  useEffect(() => {
    const unsubscribe = socketService.onConnectionChange(setSocketConnected);
    return unsubscribe;
  }, []);

  const reconnectSocket = useCallback(() => {
    socketService.connect();
    if (roomId && user) {
      socketService.joinRoom(roomId, {
        username: getUserId(user),
        email: user.email,
        id: user.id,
      });
    }
    setSocketConnected(socketService.isConnected());
  }, [roomId, user]);

  useEffect(() => {
    if (!roomId || !user) return;

    reconnectSocket();

    const onFileContentUpdated = (data) => {
      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;
      const currentUser = userRef.current;
      const fileId = getFileId(file);

      if (
        data.projectId === proj?.projectId &&
        data.fileId === fileId &&
        data.userId !== getUserId(currentUser)
      ) {
        setFileContent(data.content);
        setLastSaved(new Date());
        setFileVersion((prev) => prev + 1);
      }
    };

    const onUserCursorUpdated = (data) => {
      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;
      const currentUser = userRef.current;
      const fileId = getFileId(file);

      if (
        data.projectId === proj?.projectId &&
        data.fileId === fileId &&
        data.userId !== getUserId(currentUser)
      ) {
        setUserCursors((prev) => {
          const next = new Map(prev);
          next.set(data.userId, {
            position: data.position,
            selection: data.selection,
            timestamp: data.timestamp,
          });
          return next;
        });
      }
    };

    const onUserSelectionUpdated = (data) => {
      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;
      const currentUser = userRef.current;

      if (
        data.projectId === proj?.projectId &&
        data.fileId === getFileId(file) &&
        data.userId !== getUserId(currentUser)
      ) {
        setEditingUsers((prev) => {
          const next = new Map(prev);
          next.set(data.userId, {
            selection: data.selection,
            color: data.color,
            timestamp: data.timestamp,
          });
          return next;
        });
      }
    };

    const onUserStoppedEditingFile = (data) => {
      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;

      if (
        data.projectId === proj?.projectId &&
        data.fileId === getFileId(file)
      ) {
        setUserCursors((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
        setEditingUsers((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      }
    };

    const onUserCodeTyping = (data) => {
      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;
      const currentUser = userRef.current;

      if (
        data.projectId === proj?.projectId &&
        data.fileId === getFileId(file) &&
        data.userId !== getUserId(currentUser)
      ) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          if (data.isTyping) {
            next.set(data.userId, {
              timestamp: data.timestamp,
              fileId: data.fileId,
            });
          } else {
            next.delete(data.userId);
          }
          return next;
        });
      }
    };

    socketService.onFileContentUpdated(onFileContentUpdated);
    socketService.onUserCursorUpdated(onUserCursorUpdated);
    socketService.onUserSelectionUpdated(onUserSelectionUpdated);
    socketService.onUserStoppedEditingFile(onUserStoppedEditingFile);
    socketService.onUserCodeTyping(onUserCodeTyping);

    return () => {
      socketService.off('file-content-updated', onFileContentUpdated);
      socketService.off('user-cursor-updated', onUserCursorUpdated);
      socketService.off('user-selection-updated', onUserSelectionUpdated);
      socketService.off('user-stopped-editing-file', onUserStoppedEditingFile);
      socketService.off('user-code-typing', onUserCodeTyping);

      const proj = selectedProjectRef.current;
      const file = selectedFileRef.current;
      const currentUser = userRef.current;
      if (proj && file && currentUser) {
        socketService.leaveFileEdit({
          roomId,
          projectId: proj.projectId,
          fileId: getFileId(file),
          userId: getUserId(currentUser),
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (cursorUpdateTimeoutRef.current) clearTimeout(cursorUpdateTimeoutRef.current);
    };
  }, [roomId, user, reconnectSocket]);

  // Handle scroll events for scroll buttons
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const scrollTop = contentRef.current.scrollTop;
        const scrollHeight = contentRef.current.scrollHeight;
        const clientHeight = contentRef.current.clientHeight;
        
        // Show scroll to top button when scrolled down
        setShowScrollToTop(scrollTop > 200);
        
        // Show side scroller when content is scrollable
        setShowSideScroller(scrollHeight > clientHeight);
        
        // Calculate scroll progress
        const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
        setScrollProgress(Math.min(100, Math.max(0, progress)));
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      // Use passive event listener for better performance
      contentElement.addEventListener('scroll', handleScroll, { passive: true });
      return () => contentElement.removeEventListener('scroll', handleScroll);
    }
  }, [selectedProject, files]);

  // Fix scroll position when content changes
  useEffect(() => {
    if (contentRef.current && selectedFile) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [selectedFile]);

  const loadProjects = async () => {
    if (!roomId) return;
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/room/${roomId}`);
      const data = await response.json();

      if (data.success) {
        setProjects(data.projects || []);
      } else {
        setError(data.message || 'Failed to load projects');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Cannot reach server. Is the backend running on port 5000?');
    }
  };

  const openNewProjectModal = () => {
    setError('');
    setSuccess('');
    setNewProjectName('');
    setShowNewProjectModal(true);
    setTimeout(() => newProjectInputRef.current?.focus(), 50);
  };

  const createProject = async (e) => {
    e?.preventDefault();
    const projectName = newProjectName.trim();
    if (!projectName) {
      setError('Please enter a project name');
      return;
    }

    if (!roomId) {
      setError('Room ID is missing — rejoin the room and try again');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      const roomMembers = (participants || []).map(normalizeParticipant);

      const response = await fetch(`${apiUrl}/api/projects/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          description: `Collaborative project for room ${roomId}`,
          roomId,
          createdBy: getUserId(user),
          projectType: 'react',
          roomMembers,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowNewProjectModal(false);
        setNewProjectName('');
        setSuccess(`Project "${projectName}" created!`);
        setProjects((prev) => [data.project, ...prev.filter((p) => p.projectId !== data.project.projectId)]);
        setSelectedProject(data.project);
        setFiles([]);
        setSelectedFile(null);
        setFileContent('');
        await loadProjectFiles(data.project.projectId);
      } else {
        setError(data.message || 'Failed to create project');
      }
    } catch (err) {
      setError('Failed to create project. Check that the backend is running.');
      console.error('Error creating project:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectFiles = async (projectId) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/${projectId}`);
      const data = await response.json();
      
      if (data.success) {
        setFiles(data.project.files || []);
        if (data.project.files && data.project.files.length > 0) {
          setSelectedFile(data.project.files[0]);
          setFileContent(data.project.files[0].content);
        }
      }
    } catch (err) {
      console.error('Error loading project files:', err);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedProject) {
      setError('Please select a project and file to upload');
      return;
    }

    // Validate file type
    const allowedTypes = ['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.json', '.md', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      setError(`File type ${fileExtension} is not supported. Allowed types: ${allowedTypes.join(', ')}`);
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setError('File size must be less than 1MB');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', getUserId(user));
      formData.append('lastModifiedBy', getUserId(user));

      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/files/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSuccess(`File "${file.name}" uploaded successfully!`);
        loadProjectFiles(selectedProject.projectId);
        // Clear the file input
        event.target.value = '';
      } else {
        setError(data.message || 'Failed to upload file');
      }
    } catch (err) {
      setError(`Failed to upload file: ${err.message}`);
      console.error('Error uploading file:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (file) => {
    console.log('🔍 File selected:', file);
    console.log('File ID:', file?._id);
    console.log('File name:', file?.fileName);
    console.log('File type:', file?.fileType);
    console.log('All file properties:', Object.keys(file || {}));
    
    // Check if file has _id, if not, try to use id or generate one
    let fileId = file?._id;
    if (!fileId) {
      fileId = file?.id || file?.fileId || `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('⚠️ File missing _id, using generated ID:', fileId);
    }
    
    // Leave current file editing session if any
    if (selectedFile && selectedProject && user) {
      console.log('Leaving current file editing session...');
      socketService.leaveFileEdit({
        roomId,
        projectId: selectedProject.projectId,
        fileId: selectedFile._id || selectedFile.id || selectedFile.fileId,
        userId: user.email || user.username
      });
    }

    setSelectedFile(file);
    setFileContent(file.content);

    // Join new file editing session
    if (file && selectedProject && user && socketService.isConnected()) {
      console.log('Joining new file editing session...', {
        roomId,
        projectId: selectedProject.projectId,
        fileId: fileId,
        userId: user.email || user.username
      });
      
      socketService.joinFileEdit({
        roomId,
        projectId: selectedProject.projectId,
        fileId: fileId,
        userId: user.email || user.username
      });
    } else {
      console.log('Cannot join file editing session:', {
        file: !!file,
        selectedProject: !!selectedProject,
        user: !!user,
        socketConnected: socketService.isConnected(),
        fileId: fileId
      });
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!selectedProject || !fileId) {
      setError('No file selected for deletion');
      return;
    }

    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Delete failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSuccess('File deleted successfully!');
        loadProjectFiles(selectedProject.projectId);
        // Clear selection if deleted file was selected
        if (selectedFile && getFileId(selectedFile) === fileId) {
          setSelectedFile(null);
          setFileContent('');
        }
      } else {
        setError(data.message || 'Failed to delete file');
      }
    } catch (err) {
      setError(`Failed to delete file: ${err.message}`);
      console.error('Error deleting file:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSave = async () => {
    if (!selectedFile || !selectedProject) {
      setError('No file selected to save');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      const fileId = getFileId(selectedFile);
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: fileContent,
          lastModifiedBy: getUserId(user)
        })
      });

      if (!response.ok) {
        throw new Error(`Save failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSuccess('File saved successfully!');
        setLastSaved(new Date());
        loadProjectFiles(selectedProject.projectId);
      } else {
        setError(data.message || 'Failed to save file');
      }
    } catch (err) {
      setError(`Failed to save file: ${err.message}`);
      console.error('Error saving file:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate user color based on userId
  const getUserColor = useCallback((userId) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, []);

  const persistFileContent = async (projectId, fileId, content) => {
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/projects/${projectId}/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          lastModifiedBy: getUserId(userRef.current),
        }),
      });
      setLastSaved(new Date());
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  };

  const debouncedSendContentChange = useCallback((data) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (data && socketService.isConnected()) {
        socketService.sendFileContentChange(data);
      }
      if (autoSaveEnabledRef.current && data?.projectId && data?.fileId) {
        persistFileContent(data.projectId, data.fileId, data.content);
      }
    }, 400);
  }, []);

  // Debounced function to send cursor position
  const debouncedSendCursorPosition = useCallback((position, selection) => {
    if (cursorUpdateTimeoutRef.current) {
      clearTimeout(cursorUpdateTimeoutRef.current);
    }
    
    cursorUpdateTimeoutRef.current = setTimeout(() => {
      if (selectedProject && selectedFile && user && socketService.isConnected()) {
        const fileId = selectedFile._id || selectedFile.id || selectedFile.fileId;
        if (fileId) {
          socketService.sendCursorPosition({
            roomId,
            projectId: selectedProject.projectId,
            fileId: fileId,
            userId: getUserId(user),
            position,
            selection
          });
        }
      }
    }, 100); // 100ms debounce for cursor updates
  }, [selectedProject, selectedFile, user, roomId]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      if (selectedProject && selectedFile && user && socketService.isConnected()) {
        const fileId = selectedFile._id || selectedFile.id || selectedFile.fileId;
        if (fileId) {
          socketService.sendCodeTyping({
            roomId,
            projectId: selectedProject.projectId,
            fileId: fileId,
            userId: getUserId(user),
            isTyping: true
          });
        }
      }
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (selectedProject && selectedFile && user && socketService.isConnected()) {
        const fileId = selectedFile._id || selectedFile.id || selectedFile.fileId;
        if (fileId) {
          socketService.sendCodeTyping({
            roomId,
            projectId: selectedProject.projectId,
            fileId: fileId,
            userId: getUserId(user),
            isTyping: false
          });
        }
      }
    }, 1000);
  }, [isTyping, selectedProject, selectedFile, user, roomId]);

  const handleFileContentChange = (content) => {
    console.log('📝 File content changed:', content.length, 'characters');
    console.log('📁 Selected file:', selectedFile);
    console.log('📁 Selected file ID:', selectedFile?._id);
    console.log('📁 Selected project:', selectedProject);
    console.log('👤 User:', user);
    setFileContent(content);
    
    // Get file ID with fallback
    const fileId = selectedFile?._id || selectedFile?.id || selectedFile?.fileId;
    console.log('📁 Using file ID:', fileId);
    
    // Send live update to other users
    if (selectedProject && selectedFile && user && socketService.isConnected() && fileId) {
      console.log('📤 Sending content change to other users...', {
        roomId,
        projectId: selectedProject.projectId,
        fileId: fileId,
        userId: user.email || user.username
      });
      
      debouncedSendContentChange({
        roomId,
        projectId: selectedProject.projectId,
        fileId: fileId,
        content: content,
        userId: getUserId(user),
        timestamp: Date.now()
      });
    } else {
      console.log('❌ Cannot send content change:', {
        selectedProject: !!selectedProject,
        selectedFile: !!selectedFile,
        user: !!user,
        socketConnected: socketService.isConnected(),
        fileId: fileId
      });
    }
    
    // Handle typing indicator
    handleTyping();
    
    // Auto-save if enabled
    if (autoSaveEnabled) {
      // Auto-save will be handled by the debounced function above
    }
  };

  // Handle cursor position changes
  const handleCursorChange = (event) => {
    const textarea = event.target;
    const position = textarea.selectionStart;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    
    console.log('🎯 Cursor position changed:', position, selection);
    console.log('📁 Selected file ID:', selectedFile?._id);
    console.log('📁 Selected project ID:', selectedProject?.projectId);
    console.log('👤 User:', user?.email || user?.username);
    
    // Get file ID with fallback
    const fileId = selectedFile?._id || selectedFile?.id || selectedFile?.fileId;
    console.log('📁 Using file ID:', fileId);
    
    if (selectedProject && selectedFile && user && fileId) {
      console.log('📤 Sending cursor position...');
      debouncedSendCursorPosition(position, selection);
    } else {
      console.log('❌ Cannot send cursor position:', {
        selectedProject: !!selectedProject,
        selectedFile: !!selectedFile,
        user: !!user,
        fileId: fileId
      });
    }
  };

  // Handle selection changes
  const handleSelectionChange = (event) => {
    const textarea = event.target;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    
    if (selectedProject && selectedFile && user && socketService.isConnected()) {
      socketService.sendUserSelection({
        roomId,
        projectId: selectedProject.projectId,
        fileId: getFileId(selectedFile),
        userId: getUserId(user),
        selection,
        color: getUserColor(getUserId(user))
      });
    }
  };

  const saveFileContent = async () => {
    if (!selectedFile || !selectedProject) return;

    setLoading(true);
    setError('');

    try {
      const apiUrl = getApiUrl();
      const fileId = getFileId(selectedFile);
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: fileContent,
          lastModifiedBy: getUserId(user)
        })
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('File saved successfully!');
        setLastSaved(new Date());
        loadProjectFiles(selectedProject.projectId);
      } else {
        setError(data.message || 'Failed to save file');
      }
    } catch (err) {
      setError('Failed to save file');
      console.error('Error saving file:', err);
    } finally {
      setLoading(false);
    }
  };

  const compileProject = async () => {
    if (!selectedProject) {
      setError('Please select a project first');
      return;
    }

    if (files.length === 0) {
      setError('No files to compile. Please upload some files first.');
      return;
    }

    setCompilationStatus('compiling');
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          compiledBy: user?.email || user?.username
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setCompilationStatus('error');
        setError(data.compilation?.error || data.message || 'Compilation failed');
        return;
      }

      if (data.compilation?.success && data.compilation.output) {
        setPreviewFromHtml(data.compilation.output);
        setCompilationStatus('success');
        setSuccess('Compiled! Preview is shown below the editor.');
      } else {
        setCompilationStatus('error');
        setError(
          data.compilation?.error ||
            'Compilation failed. Add an index.html or .js file to your project.'
        );
      }
    } catch (err) {
      setCompilationStatus('error');
      setError(`Failed to compile project: ${err.message}`);
      console.error('Error compiling project:', err);
    }
  };

  const handleCodePaste = () => {
    setShowCodePaste(true);
    setPastedCode('');
    setFileName('');
    setSelectedLanguage('javascript');
  };

  const getFileContentForDownload = (file) => {
    if (selectedFile && getFileId(file) === getFileId(selectedFile)) {
      return fileContent;
    }
    return file.content || '';
  };

  const downloadCurrentFile = () => {
    if (!selectedFile) {
      setError('Select a file to download');
      return;
    }
    downloadBlob(selectedFile.fileName, fileContent);
    setSuccess(`Downloaded ${selectedFile.fileName}`);
  };

  const exportProject = async () => {
    if (!selectedProject) {
      setError('Select a project first');
      return;
    }

    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}`);
      const data = await response.json();
      const projectFiles = data.success ? data.project.files || files : files;

      if (projectFiles.length === 0) {
        setError('No files in this project to export');
        return;
      }

      const exportPayload = {
        name: selectedProject.name,
        projectId: selectedProject.projectId,
        roomId,
        exportedAt: new Date().toISOString(),
        files: projectFiles.map((file) => ({
          fileName: file.fileName,
          fileType: file.fileType,
          content: getFileContentForDownload(file),
        })),
      };

      const safeName = selectedProject.name.replace(/[^\w.-]+/g, '_');
      downloadBlob(
        `${safeName}-export.json`,
        JSON.stringify(exportPayload, null, 2),
        'application/json;charset=utf-8'
      );

      for (let i = 0; i < projectFiles.length; i += 1) {
        const file = projectFiles[i];
        await new Promise((resolve) => setTimeout(resolve, i * 250));
        downloadBlob(file.fileName, getFileContentForDownload(file));
      }

      setSuccess(
        `Exported ${projectFiles.length} file(s) + ${safeName}-export.json to your Downloads folder`
      );
    } catch (err) {
      setError('Could not export project');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const scrollToPreview = () => {
    const previewPanel = document.querySelector('.preview-panel');
    if (previewPanel) {
      previewPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const savePastedCode = async () => {
    if (!pastedCode.trim() || !fileName.trim() || !selectedProject) {
      setError('Please provide code, filename, and select a project');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = getApiUrl();
      
      // Create a file object for the pasted code
      const fileData = {
        projectId: selectedProject.projectId,
        fileName: fileName,
        filePath: `/${fileName}`,
        fileType: getFileTypeFromName(fileName) || selectedLanguage,
        content: pastedCode,
        uploadedBy: getUserId(user),
        lastModifiedBy: getUserId(user),
        metadata: {
          size: pastedCode.length,
          encoding: 'utf8',
          mimeType: getMimeType(selectedLanguage)
        }
      };

      const response = await fetch(`${apiUrl}/api/projects/${selectedProject.projectId}/files/paste`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fileData)
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('Code pasted and saved successfully!');
        setShowCodePaste(false);
        setPastedCode('');
        setFileName('');
        loadProjectFiles(selectedProject.projectId);
      } else {
        setError(data.message || 'Failed to save pasted code');
      }
    } catch (err) {
      setError('Failed to save pasted code');
      console.error('Error saving pasted code:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMimeType = (language) => {
    const mimeTypes = {
      'nodejs': 'text/javascript',
      'css': 'text/css',
      'html': 'text/html',
      'json': 'application/json'
    };
    return mimeTypes[language] || 'text/plain';
  };

  const getFileExtension = (language) => {
    const extensions = {
      'nodejs': '.js',
      'css': '.css',
      'html': '.html',
      'json': '.json'
    };
    return extensions[language] || '.txt';
  };

  const handleLanguageChange = (language) => {
    setSelectedLanguage(language);
    if (!fileName || fileName === '') {
      setFileName(`file${getFileExtension(language)}`);
    } else if (!fileName.includes('.')) {
      setFileName(`${fileName}${getFileExtension(language)}`);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="collaborative-editor-overlay" onClick={onClose}>
      <div className="collaborative-editor-container" onClick={e => e.stopPropagation()}>
        <div className="collaborative-editor-header">
          <h2>🚀 Collaborative Code Editor</h2>
          <div className="header-controls">
            <div className={`collaborative-status ${socketConnected ? 'connected' : 'disconnected'}`}>
              <div className="status-indicator"></div>
              <span>{socketConnected ? 'Live Collaboration Active' : 'Disconnected'}</span>
              <span style={{ fontSize: '10px', marginLeft: '10px' }}>
                Socket: {socketConnected ? '✅' : '❌'} | 
                Room: {roomId ? '✅' : '❌'} | 
                User: {user ? '✅' : '❌'}
              </span>
            </div>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>
        
        <div className="collaborative-editor-content" ref={contentRef}>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          <div className="editor-workspace">
            <aside className="editor-sidebar">
              <div className="sidebar-section projects-panel">
                <div className="sidebar-section-header">
                  <h3>Projects</h3>
                  <button
                    type="button"
                    onClick={openNewProjectModal}
                    className="sidebar-btn"
                    disabled={loading}
                  >
                    + New
                  </button>
                </div>

                <div className="sidebar-scroll">
            {projects.length === 0 && !loading && (
              <p className="sidebar-empty">
                No projects yet. Click <strong>+ New</strong>.
              </p>
            )}

            <div className="projects-list">
              {projects.map((project) => (
                <div 
                  key={project.projectId}
                  className={`project-item ${selectedProject?.projectId === project.projectId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedProject(project);
                    loadProjectFiles(project.projectId);
                  }}
                >
                  <div className="project-name">{project.name}</div>
                  <div className="project-meta">
                    {(project.collaborators || []).length} collaborator{(project.collaborators || []).length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
                </div>
              </div>

              <div className="sidebar-section files-panel">
                <div className="sidebar-section-header">
                  <h3>Files</h3>
                </div>
                <div className="sidebar-scroll">
                  {!selectedProject && <p className="sidebar-empty">Select a project.</p>}
                  {selectedProject && files.length === 0 && !loading && (
                    <p className="sidebar-empty">No files. Use Paste or Upload.</p>
                  )}
                  {selectedProject && (
                <div className="files-list">
                  {files.map((file) => (
                    <div
                      key={getFileId(file)}
                      className={`file-item ${getFileId(selectedFile) === getFileId(file) ? 'active' : ''}`}
                    >
                      <div className="file-content" onClick={() => handleFileSelect(file)}>
                        <div className="file-icon">
                          {file.fileType === 'javascript' ? '📜' : 
                           file.fileType === 'css' ? '🎨' : 
                           file.fileType === 'html' ? '🌐' : '📄'}
                        </div>
                        <div className="file-info">
                          <div className="file-name">{file.fileName}</div>
                          <div className="file-meta">
                            {file.fileType} • {file.metadata?.size ? Math.round(file.metadata.size / 1024) + 'KB' : 'Unknown size'}
                          </div>
                        </div>
                      </div>
                      <div className="file-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFileDelete(getFileId(file));
                          }}
                          className="delete-btn"
                          title="Delete file"
                          disabled={loading}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                  )}
                </div>
              </div>
            </aside>

            <main className="editor-main">
              {!selectedProject ? (
                <div className="editor-welcome">
                  <p><strong>Select or create a project</strong> in the left sidebar.</p>
                </div>
              ) : (
                <>
                  <div className="editor-toolbar">
                    <span className="file-name-badge">
                      {selectedProject.name}
                      {selectedFile ? ` / ${selectedFile.fileName}` : ''}
                    </span>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".js,.jsx,.ts,.tsx,.css,.html,.json,.md,.txt"
                      style={{ display: 'none' }}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary" disabled={loading}>Upload</button>
                    <button type="button" onClick={handleCodePaste} className="btn-secondary" disabled={loading}>Paste</button>
                    <button type="button" onClick={compileProject} className="btn-primary" disabled={loading || compilationStatus === 'compiling'}>
                      {compilationStatus === 'compiling' ? 'Compiling...' : 'Compile'}
                    </button>
                    {selectedFile && (
                      <button type="button" onClick={handleFileSave} className="btn-save" disabled={loading}>Save</button>
                    )}
                    {selectedFile && (
                      <button type="button" onClick={downloadCurrentFile} className="btn-secondary" disabled={loading}>
                        Download file
                      </button>
                    )}
                    <button type="button" onClick={exportProject} className="btn-secondary" disabled={loading || !selectedProject || files.length === 0}>
                      Export project
                    </button>
                  </div>

                  {!selectedFile ? (
                    <div className="editor-welcome">
                      <p>Pick a file from the sidebar, or paste/upload code.</p>
                    </div>
                  ) : (
                  <div className="file-editor">
                    <div className="editor-header">
                      <div className="editor-controls">
                        {/* User presence indicators */}
                        <div className="user-presence">
                          {Array.from(editingUsers.keys()).map(userId => (
                            <div 
                              key={userId} 
                              className="user-indicator"
                              style={{ backgroundColor: getUserColor(userId) }}
                              title={`${userId} is editing`}
                            >
                              {userId.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {Array.from(typingUsers.keys()).map(userId => (
                            <div 
                              key={`typing-${userId}`} 
                              className="typing-indicator"
                              title={`${userId} is typing...`}
                            >
                              ✏️
                            </div>
                          ))}
                        </div>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={autoSaveEnabled}
                            onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                          />
                          Auto-save
                        </label>
                        {lastSaved && (
                          <span className="last-saved">
                            Last saved: {lastSaved.toLocaleTimeString()}
                          </span>
                        )}
                        {hasConflicts && (
                          <span className="conflict-warning" title="Potential conflicts detected">
                            ⚠️ Conflicts
                          </span>
                        )}
                        <span className="debug-info" style={{ fontSize: '10px', color: '#666' }}>
                          Cursors: {userCursors.size} | Users: {editingUsers.size}
                        </span>
                        <button 
                          onClick={handleFileSave}
                          className="btn-save"
                          disabled={loading}
                        >
                          💾 Save
                        </button>
                        <button 
                          onClick={() => {
                            console.log('Testing collaborative features...');
                            console.log('Socket connected:', socketService.isConnected());
                            console.log('Selected project:', selectedProject?.projectId);
                            console.log('Selected file:', selectedFile?._id);
                            console.log('User:', user?.email);
                            console.log('Room ID:', roomId);
                            
                            // Force reconnect if not connected
                            if (!socketService.isConnected()) {
                              console.log('Forcing socket reconnection...');
                              socketService.connect();
                            }
                            
                            // Test sending a cursor position
                            if (selectedProject && selectedFile && user) {
                              socketService.sendCursorPosition({
                                roomId,
                                projectId: selectedProject.projectId,
                                fileId: selectedFile._id,
                                userId: getUserId(user),
                                position: 10,
                                selection: { start: 10, end: 10 }
                              });
                              console.log('Test cursor position sent');
                              
                              // Also simulate receiving a cursor from another user
                              setTimeout(() => {
                                console.log('Simulating cursor from another user...');
                                setUserCursors(prev => {
                                  const newCursors = new Map(prev);
                                  newCursors.set('test-user', {
                                    position: 25,
                                    selection: { start: 25, end: 25 },
                                    timestamp: Date.now()
                                  });
                                  console.log('Added test cursor:', newCursors);
                                  return newCursors;
                                });
                                
                                // Also simulate editing users
                                setEditingUsers(prev => {
                                  const newUsers = new Map(prev);
                                  newUsers.set('test-user', {
                                    selection: { start: 25, end: 30 },
                                    color: '#FF6B6B',
                                    timestamp: Date.now()
                                  });
                                  console.log('Added test editing user:', newUsers);
                                  return newUsers;
                                });
                                
                                // Simulate typing
                                setTypingUsers(prev => {
                                  const newTyping = new Map(prev);
                                  newTyping.set('test-user', {
                                    timestamp: Date.now(),
                                    fileId: selectedFile._id
                                  });
                                  console.log('Added test typing user:', newTyping);
                                  return newTyping;
                                });
                              }, 1000);
                            }
                          }}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          🧪 Test
                        </button>
                        <button 
                          onClick={reconnectSocket}
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          🔄 Reconnect
                        </button>
                      </div>
                    </div>
                    <div className="editor-container">
                      <textarea
                        ref={textareaRef}
                        value={fileContent}
                        onChange={(e) => handleFileContentChange(e.target.value)}
                        onSelect={handleSelectionChange}
                        onKeyUp={handleCursorChange}
                        onMouseUp={handleCursorChange}
                        className="code-editor"
                        placeholder="Start coding..."
                        spellCheck={false}
                      />
                      {/* User cursors overlay */}
                      <div className="cursors-overlay">
                        {console.log('Rendering cursors:', Array.from(userCursors.entries()))}
                        {Array.from(userCursors.entries()).map(([userId, cursorInfo]) => {
                          // Calculate approximate cursor position
                          const lines = fileContent.split('\n');
                          let currentPos = 0;
                          let lineIndex = 0;
                          let charIndex = 0;
                          
                          for (let i = 0; i < lines.length; i++) {
                            if (currentPos + lines[i].length >= cursorInfo.position) {
                              lineIndex = i;
                              charIndex = cursorInfo.position - currentPos;
                              break;
                            }
                            currentPos += lines[i].length + 1; // +1 for newline
                          }
                          
                          const top = lineIndex * 21; // Approximate line height
                          const left = charIndex * 8.4; // Approximate character width
                          
                          return (
                            <div
                              key={userId}
                              className="user-cursor"
                              style={{
                                top: `${top}px`,
                                left: `${left}px`,
                                backgroundColor: getUserColor(userId)
                              }}
                              title={`${userId}'s cursor`}
                            >
                              <div className="cursor-line"></div>
                              <div className="cursor-label">{userId}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  )}

                  {showPreview && previewHtml && (
                    <div className="preview-panel">
                      <div className="preview-panel-header">
                        <h3>Live Preview</h3>
                        <div className="preview-panel-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              if (previewUrl) {
                                window.open(previewUrl, '_blank');
                              } else if (selectedProject) {
                                window.open(
                                  `${getApiUrl()}/api/projects/${selectedProject.projectId}/preview`,
                                  '_blank'
                                );
                              }
                            }}
                          >
                            Open tab
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={closePreview}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <iframe
                        srcDoc={previewHtml}
                        className="preview-iframe"
                        title="Project Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                      />
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>

        {/* New Project Modal */}
        {showNewProjectModal && (
          <div
            className="code-paste-overlay"
            onClick={() => !loading && setShowNewProjectModal(false)}
          >
            <div
              className="code-paste-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="code-paste-header">
                <h3>New project</h3>
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="close-btn"
                  disabled={loading}
                >
                  ×
                </button>
              </div>
              <form className="code-paste-content" onSubmit={createProject}>
                <div className="form-group">
                  <label htmlFor="new-project-name">Project name</label>
                  <input
                    id="new-project-name"
                    ref={newProjectInputRef}
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Team Snippets"
                    className="form-input"
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="paste-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowNewProjectModal(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Creating...' : 'Create project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Code Paste Modal */}
        {showCodePaste && (
          <div className="code-paste-overlay">
            <div className="code-paste-modal">
              <div className="code-paste-header">
                <h3>📝 Paste Code</h3>
                <button 
                  onClick={() => setShowCodePaste(false)}
                  className="close-btn"
                >
                  ×
                </button>
              </div>

              <div className="code-paste-content">
                <div className="paste-form">
                  <div className="form-group">
                    <label>File Name:</label>
                    <input
                      type="text"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="Enter filename (e.g., script.js)"
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>Language:</label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      className="form-select"
                    >
                      <option value="nodejs">JavaScript</option>
                      <option value="css">CSS</option>
                      <option value="html">HTML</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Code:</label>
                    <div className="code-editor-container">
                      {showSyntaxHighlighting ? (
                        <SyntaxHighlighter
                          language={selectedLanguage}
                          style={tomorrow}
                          className="code-highlighter"
                          showLineNumbers={true}
                          wrapLines={true}
                        >
                          {pastedCode || '// Paste your code here...'}
                        </SyntaxHighlighter>
                      ) : (
                        <textarea
                          value={pastedCode}
                          onChange={(e) => setPastedCode(e.target.value)}
                          placeholder="Paste your code here..."
                          className="code-textarea"
                          rows={15}
                        />
                      )}
                    </div>
                    <div className="editor-controls">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={showSyntaxHighlighting}
                          onChange={(e) => setShowSyntaxHighlighting(e.target.checked)}
                        />
                        Syntax Highlighting
                      </label>
                    </div>
                  </div>

                  <div className="paste-actions">
                    <button 
                      onClick={savePastedCode}
                      className="btn-primary"
                      disabled={loading || !pastedCode.trim() || !fileName.trim()}
                    >
                      {loading ? '⏳ Saving...' : '💾 Save Code'}
                    </button>
                    <button 
                      onClick={() => setShowCodePaste(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scroll Progress Indicator */}
        <div className={`scroll-progress ${showSideScroller ? 'visible' : ''}`}>
          <div 
            className="scroll-progress-bar" 
            style={{ width: `${scrollProgress}%` }}
          ></div>
        </div>

        {/* Scroll to Top Button */}
        <button
          className={`scroll-to-top ${showScrollToTop ? 'visible' : ''}`}
          onClick={scrollToTop}
          title="Scroll to top"
        >
          ↑
        </button>

        {/* Side Scroller */}
        <div className={`side-scroller ${showSideScroller ? 'visible' : ''}`}>
          <button
            className="scroll-button"
            onClick={() => scrollToSection('project-section')}
            title="Go to Projects"
          >
            📁
          </button>
          <button
            className="scroll-button"
            onClick={() => scrollToSection('files-section')}
            title="Go to Files"
          >
            📄
          </button>
          <button
            className="scroll-button"
            onClick={scrollToPreview}
            title="Go to Preview"
          >
            👀
          </button>
        </div>
        </div>
      </div>
  );
}

export default CollaborativeEditor;
