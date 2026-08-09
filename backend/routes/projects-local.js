const express = require('express');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'projects-store.json');

let projects = [];
let projectFiles = [];

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      projects = data.projects || [];
      projectFiles = data.projectFiles || [];
    }
  } catch (error) {
    console.error('Error loading projects store:', error.message);
    projects = [];
    projectFiles = [];
  }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ projects, projectFiles }, null, 2)
    );
  } catch (error) {
    console.error('Error saving projects store:', error.message);
  }
}

loadStore();

// Helper function to generate unique IDs
const generateId = () => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

// Helper function to format timestamps
const formatTimestamp = (date = new Date()) => {
  return date.toISOString();
};

// Helper function to check and add collaborator if needed
async function ensureCollaborator(project, userId) {
  const isCollaborator = project.collaborators.some(collab => 
    collab.userId === userId || collab.email === userId
  );

  if (!isCollaborator) {
    console.log(`Adding user ${userId} as collaborator to project ${project.projectId}`);
    
    // Add user as collaborator
    project.collaborators.push({
      userId: userId,
      username: userId,
      email: userId,
      role: 'editor',
      joinedAt: formatTimestamp()
    });
    
    return true; // User was added as collaborator
  }
  
  return false; // User was already a collaborator
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/javascript', 'text/css', 'text/html', 'application/json', 'text/plain'];
    const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.json', '.md', '.txt'];
    
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExt) || allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Create a new project
router.post('/create', async (req, res) => {
  try {
    const { name, description, roomId, createdBy, projectType = 'react', roomMembers = [] } = req.body;

    if (!name || !roomId || !createdBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, roomId, createdBy'
      });
    }

    const projectId = generateId();
    const timestamp = formatTimestamp();

    // Start with creator as owner
    const collaborators = [{
      userId: createdBy,
      username: createdBy,
      email: createdBy,
      role: 'owner',
      joinedAt: timestamp
    }];

    // Add room members as editors if provided
    if (roomMembers && roomMembers.length > 0) {
      roomMembers.forEach(member => {
        if (member.username !== createdBy) { // Don't add creator twice
          collaborators.push({
            userId: member.username || member.email,
            username: member.username || member.email,
            email: member.email || member.username,
            role: 'editor',
            joinedAt: timestamp
          });
        }
      });
    }

    const project = {
      projectId,
      name,
      description: description || '',
      roomId,
      createdBy,
      projectType,
      collaborators,
      settings: {
        allowFileUpload: true,
        allowFileEdit: true,
        allowCompilation: true,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedFileTypes: ['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json', 'md', 'txt']
      },
      compilation: {
        status: 'idle',
        lastCompiled: null,
        buildOutput: null,
        errorLog: null,
        previewUrl: null
      },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    projects.push(project);
    saveStore();

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: project
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating project',
      error: error.message
    });
  }
});

// Get projects for a room
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { status = 'active' } = req.query;

    const roomProjects = projects.filter(p => p.roomId === roomId && p.status === status)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      success: true,
      projects: roomProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching projects',
      error: error.message
    });
  }
});

// Get project details with files
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const files = projectFiles.filter(f => f.projectId === projectId)
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    res.json({
      success: true,
      project: {
        ...project,
        files
      }
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project',
      error: error.message
    });
  }
});

// Paste code to project
router.post('/:projectId/files/paste', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { fileName, filePath, fileType, content, uploadedBy, lastModifiedBy, metadata } = req.body;

    if (!fileName || !content || !uploadedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fileName, content, uploadedBy'
      });
    }

    // Check if project exists and user has permission
    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Ensure user is a collaborator (add if not)
    await ensureCollaborator(project, uploadedBy);

    const fileId = generateId();
    const projectFile = {
      fileId,
      projectId,
      fileName,
      filePath: filePath || `/${fileName}`,
      fileType,
      content,
      uploadedBy,
      lastModifiedBy: lastModifiedBy || uploadedBy,
      metadata: metadata || {
        size: content.length,
        encoding: 'utf8',
        mimeType: getMimeType(fileType)
      },
      createdAt: formatTimestamp(),
      updatedAt: formatTimestamp()
    };

    projectFiles.push(projectFile);
    saveStore();

    res.status(201).json({
      success: true,
      message: 'Code pasted and saved successfully',
      file: projectFile
    });
  } catch (error) {
    console.error('Error pasting code:', error);
    res.status(500).json({
      success: false,
      message: 'Error pasting code',
      error: error.message
    });
  }
});

// Upload file to project
router.post('/:projectId/files/upload', upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { uploadedBy } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check if project exists and user has permission
    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Ensure user is a collaborator (add if not)
    await ensureCollaborator(project, uploadedBy);

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const fileType = getFileType(fileExt);
    const fileId = generateId();

    const projectFile = {
      fileId,
      projectId,
      fileName: req.file.originalname,
      filePath: `/${req.file.originalname}`,
      fileType,
      content: req.file.buffer.toString('utf8'),
      uploadedBy,
      lastModifiedBy: uploadedBy,
      metadata: {
        size: req.file.size,
        encoding: req.file.encoding,
        mimeType: req.file.mimetype
      },
      createdAt: formatTimestamp(),
      updatedAt: formatTimestamp()
    };

    projectFiles.push(projectFile);
    saveStore();

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: projectFile
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
});

// Update file content
router.put('/:projectId/files/:fileId', async (req, res) => {
  try {
    const { projectId, fileId } = req.params;
    const { content, lastModifiedBy } = req.body;

    if (!content || !lastModifiedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: content, lastModifiedBy'
      });
    }

    // Check if project exists and user has permission
    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Ensure user is a collaborator (add if not)
    await ensureCollaborator(project, lastModifiedBy);

    const fileIndex = projectFiles.findIndex(f => f.fileId === fileId && f.projectId === projectId);
    if (fileIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    projectFiles[fileIndex].content = content;
    projectFiles[fileIndex].lastModifiedBy = lastModifiedBy;
    projectFiles[fileIndex].updatedAt = formatTimestamp();
    saveStore();

    res.json({
      success: true,
      message: 'File updated successfully',
      file: projectFiles[fileIndex]
    });
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating file',
      error: error.message
    });
  }
});

// Delete file from project
router.delete('/:projectId/files/:fileId', async (req, res) => {
  try {
    const { projectId, fileId } = req.params;

    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    const before = projectFiles.length;
    projectFiles = projectFiles.filter(
      (f) => !(f.projectId === projectId && f.fileId === fileId)
    );

    if (projectFiles.length === before) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    saveStore();

    res.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message,
    });
  }
});

// Compile project
router.post('/:projectId/compile', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { compiledBy } = req.body;

    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Update compilation status
    project.compilation.status = 'compiling';
    project.compilation.lastCompiled = formatTimestamp();

    // Get all files for compilation
    const files = projectFiles.filter(f => f.projectId === projectId);
    
    // Simulate compilation process
    const compilationResult = await compileProject(project, files);

    // Update compilation result
    project.compilation.status = compilationResult.success ? 'success' : 'error';
    project.compilation.buildOutput = compilationResult.output;
    project.compilation.errorLog = compilationResult.error;
    project.compilation.previewUrl = compilationResult.previewUrl;

    if (!compilationResult.success) {
      return res.status(400).json({
        success: false,
        message: compilationResult.error || 'Compilation failed',
        compilation: compilationResult,
      });
    }

    saveStore();

    res.json({
      success: true,
      message: 'Project compiled successfully',
      compilation: compilationResult,
    });
  } catch (error) {
    console.error('Error compiling project:', error);
    res.status(500).json({
      success: false,
      message: 'Error compiling project',
      error: error.message
    });
  }
});

// Helper function to determine file type
function getFileType(extension) {
  const typeMap = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.md': 'other',
    '.txt': 'other'
  };
  return typeMap[extension] || 'other';
}

// Helper function to get MIME type
function getMimeType(fileType) {
  const mimeMap = {
    'javascript': 'application/javascript',
    'jsx': 'application/javascript',
    'typescript': 'application/typescript',
    'tsx': 'application/typescript',
    'css': 'text/css',
    'html': 'text/html',
    'json': 'application/json',
    'other': 'text/plain'
  };
  return mimeMap[fileType] || 'text/plain';
}

// Preview endpoint to serve compiled HTML
router.get('/:projectId/preview', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Get project and files
    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).send('Project not found');
    }
    
    const files = projectFiles.filter(f => f.projectId === projectId);
    if (files.length === 0) {
      return res.status(404).send('No files found in project');
    }
    
    // Compile the project
    const compilation = await compileProject(project, files);
    
    if (!compilation.success) {
      return res.status(400).send(`Compilation Error: ${compilation.error}`);
    }

    if (project.compilation?.buildOutput) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(project.compilation.buildOutput);
    }
    
    res.setHeader('Content-Type', 'text/html');
    res.send(compilation.output);
    
  } catch (error) {
    console.error('Error serving preview:', error);
    res.status(500).send('Error serving preview');
  }
});

// Serve individual project files (CSS, JS, etc.)
router.get('/:projectId/:filename', async (req, res) => {
  try {
    const { projectId, filename } = req.params;

    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      return res.status(404).send('Project not found');
    }

    const file = projectFiles.find(f => f.projectId === projectId && f.fileName === filename);

    if (!file) {
      return res.status(404).send('File not found');
    }

    // Set appropriate content type based on file extension
    const ext = filename.split('.').pop().toLowerCase();
    let contentType = 'text/plain';
    
    switch (ext) {
      case 'css':
        contentType = 'text/css';
        break;
      case 'js':
        contentType = 'application/javascript';
        break;
      case 'html':
        contentType = 'text/html';
        break;
      case 'json':
        contentType = 'application/json';
        break;
      default:
        contentType = 'text/plain';
    }

    res.setHeader('Content-Type', contentType);
    res.send(file.content);

  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).send('Error serving file');
  }
});

function fileKind(file) {
  const name = (file.fileName || '').toLowerCase();
  if (file.fileType === 'html' || name.endsWith('.html') || name.endsWith('.htm')) {
    return 'html';
  }
  if (file.fileType === 'css' || name.endsWith('.css')) return 'css';
  if (
    file.fileType === 'javascript' ||
    file.fileType === 'jsx' ||
    file.fileType === 'nodejs' ||
    name.endsWith('.js') ||
    name.endsWith('.jsx')
  ) {
    return 'js';
  }
  return 'other';
}

// Helper function to compile project
async function compileProject(project, files) {
  try {
    const htmlFiles = files.filter((f) => fileKind(f) === 'html');
    const cssFiles = files.filter((f) => fileKind(f) === 'css');
    const jsFiles = files.filter((f) => fileKind(f) === 'js');

    let htmlBody = '';
    if (htmlFiles.length > 0) {
      htmlBody = htmlFiles.map((f) => f.content).join('\n');
    } else if (jsFiles.length > 0 || cssFiles.length > 0) {
      htmlBody = '<div id="app"><h1>Preview</h1><p>Compiled from your project files.</p></div>';
    } else {
      return {
        success: false,
        error: 'Add at least one .html, .js, or .css file to compile.',
        output: '',
        previewUrl: null,
      };
    }

    // Combine CSS files
    const combinedCSS = cssFiles.map(f => f.content).join('\n');
    
    // Combine JS files
    const combinedJS = jsFiles.map(f => f.content).join('\n');

    // Create compiled HTML with proper structure
    const compiledHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        ${combinedCSS}
    </style>
</head>
<body>
    <div class="container">
        ${htmlBody}
    </div>
    <script>
        // Add error handling for JavaScript
        try {
            ${combinedJS}
        } catch (error) {
            console.error('JavaScript Error:', error);
            document.body.innerHTML += '<div style="color: red; padding: 10px; background: #ffe6e6; border: 1px solid red; margin: 10px; border-radius: 4px;">JavaScript Error: ' + error.message + '</div>';
        }
    </script>
</body>
</html>
    `;

    // Generate preview URL (in production, this would be a real URL)
    const previewUrl = `/api/projects/${project.projectId}/preview`;

    return {
      success: true,
      output: compiledHTML,
      error: null,
      previewUrl
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error.message,
      previewUrl: null
    };
  }
}

module.exports = router;
