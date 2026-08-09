// Configuration file for the application
// This centralizes all configuration values

const DEFAULT_API_URL = 'http://localhost:5000';

const trimTrailingSlash = (url) => url.replace(/\/$/, '');

/**
 * Get API base URL from environment or use default (localhost until deploy)
 */
export const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return trimTrailingSlash(process.env.REACT_APP_API_URL);
  }
  return trimTrailingSlash(DEFAULT_API_URL);
};

/**
 * Get Socket.IO URL from environment or use API URL as default
 */
export const getSocketUrl = () => {
  return process.env.REACT_APP_SOCKET_URL || getApiUrl();
};

/**
 * Application configuration
 */
export const config = {
  // API Configuration
  apiUrl: getApiUrl(),
  socketUrl: getSocketUrl(),
  
  // Application Settings
  appName: process.env.REACT_APP_NAME || 'AWS Collaboration Platform',
  environment: process.env.REACT_APP_ENV || 'production',
  isDebug: process.env.REACT_APP_DEBUG === 'true',
  
  // Feature Flags
  features: {
    enableAuth: process.env.REACT_APP_ENABLE_AUTH !== 'false',
    enableVideoCalls: process.env.REACT_APP_ENABLE_VIDEO_CALLS !== 'false',
    enableCodeExecution: process.env.REACT_APP_ENABLE_CODE_EXECUTION !== 'false',
    enableProjects: process.env.REACT_APP_ENABLE_PROJECTS !== 'false',
  },
  
  // File Upload Settings
  maxFileSize: parseInt(process.env.REACT_APP_MAX_FILE_SIZE || '5', 10) * 1024 * 1024, // Convert MB to bytes
  
  // AWS Configuration (if needed)
  aws: {
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
  },
  
  // Timeouts and Intervals
  socketTimeout: 20000,
  socketReconnectionDelay: 1000,
  socketReconnectionAttempts: 5,
  
  // API Request Settings
  apiTimeout: 30000,
  
  // UI Settings
  messagesPerPage: 50,
  typingIndicatorTimeout: 3000,
  
  // Video Call Settings
  videoCallSettings: {
    maxParticipants: 50,
    allowScreenShare: true,
    allowChat: true,
  },
  
  // Code Editor Settings
  codeEditor: {
    theme: 'vs-dark',
    fontSize: 14,
    tabSize: 2,
    autoSave: true,
    autoSaveDelay: 1000,
  },
};

/**
 * Check if running in development mode
 */
export const isDevelopment = () => {
  return config.environment === 'development' || process.env.NODE_ENV === 'development';
};

/**
 * Check if running in production mode
 */
export const isProduction = () => {
  return config.environment === 'production' || process.env.NODE_ENV === 'production';
};

/**
 * Log configuration on load (only in development)
 */
if (isDevelopment() || config.isDebug) {
  console.log('🔧 Application Configuration:', {
    apiUrl: config.apiUrl,
    socketUrl: config.socketUrl,
    environment: config.environment,
    features: config.features,
  });
}

export default config;

