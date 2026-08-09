const express = require('express');
const router = express.Router();
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Frontend language id -> JDoodle API parameters
const LANGUAGE_MAP = {
  nodejs: { language: 'nodejs', versionIndex: '0', local: 'nodejs' },
  javascript: { language: 'nodejs', versionIndex: '0', local: 'nodejs' },
  python: { language: 'python3', versionIndex: '3', local: 'python' },
  python3: { language: 'python3', versionIndex: '3', local: 'python' },
  java: { language: 'java', versionIndex: '3' },
  cpp: { language: 'cpp17', versionIndex: '0' },
  csharp: { language: 'csharp', versionIndex: '0' },
  php: { language: 'php', versionIndex: '0' },
  ruby: { language: 'ruby', versionIndex: '0' },
  swift: { language: 'swift', versionIndex: '0' },
  go: { language: 'go', versionIndex: '0' },
  typescript: { language: 'typescript', versionIndex: '0' },
  html: { language: 'html', versionIndex: '0' },
};

const PLACEHOLDER_IDS = new Set([
  'your_jdoodle_client_id',
  'your_jdoodle_client_secret',
]);

function isJdoodleConfigured() {
  const id = process.env.JDOODLE_CLIENT_ID;
  const secret = process.env.JDOODLE_CLIENT_SECRET;
  return Boolean(id && secret && !PLACEHOLDER_IDS.has(id) && !PLACEHOLDER_IDS.has(secret));
}

function resolveLanguage(language) {
  const key = (language || '').toLowerCase().trim();
  return LANGUAGE_MAP[key] || null;
}

function localExecutionEnabled() {
  return (
    process.env.USE_LOCAL_STORE === 'true' ||
    process.env.NODE_ENV === 'development'
  );
}

function runProcess(command, args, stdin = '', timeoutMs = 10000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (output) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        output: output.trim() || '(no output)',
        statusCode: 200,
        memory: '0',
        cpuTime: '0',
        source: 'local',
      });
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(
        'Execution timed out. If your program uses input(), add values in the Standard Input field.'
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      finish(err.message);
    });

    child.on('close', () => {
      const output = [stdout, stderr].filter(Boolean).join('\n');
      finish(output);
    });

    if (stdin) {
      const normalized = stdin.endsWith('\n') ? stdin : `${stdin}\n`;
      child.stdin.write(normalized);
    }
    child.stdin.end();
  });
}

function codeNeedsStdin(code) {
  return /\binput\s*\(/.test(code) || /\bscanf\s*\(/.test(code);
}

async function executeLocally(code, localKind, stdin = '') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jdoodle-local-'));

  try {
    if (localKind === 'nodejs') {
      const file = path.join(tmpDir, 'script.js');
      fs.writeFileSync(file, code, 'utf8');
      return await runProcess('node', [file], stdin);
    }

    if (localKind === 'python') {
      const file = path.join(tmpDir, 'script.py');
      fs.writeFileSync(file, code, 'utf8');
      const pythonCommands =
        process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
      for (const cmd of pythonCommands) {
        const result = await runProcess(cmd, [file], stdin);
        if (
          !result.output.includes('ENOENT') &&
          !result.output.includes('not recognized') &&
          !result.output.includes('No such file')
        ) {
          return result;
        }
      }
      return {
        output: 'Python is not installed. Install Python or add JDoodle API keys to backend/.env.',
        statusCode: 200,
        memory: '0',
        cpuTime: '0',
        source: 'local',
      };
    }

    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function notConfiguredResponse(language, code) {
  return {
    output:
      `Code execution service not configured.\n\n` +
      `To run ${language} and other languages:\n` +
      `1. Sign up at https://www.jdoodle.com/compiler-api/\n` +
      `2. Add JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET to backend/.env\n\n` +
      `Local dev fallback (Node.js / Python only) runs when USE_LOCAL_STORE=true.\n\n` +
      `Your code:\n${code}`,
    statusCode: 200,
    memory: '0',
    cpuTime: '0',
    configured: false,
  };
}

router.get('/status', (_req, res) => {
  const configured = isJdoodleConfigured();
  res.json({
    configured,
    mode: configured ? 'jdoodle' : localExecutionEnabled() ? 'local-fallback' : 'unconfigured',
    localFallback: localExecutionEnabled(),
    localLanguages: ['nodejs', 'python'],
    supportedLanguages: Object.keys(LANGUAGE_MAP),
  });
});

router.post('/execute', async (req, res) => {
  const { code, language, stdin = '' } = req.body;

  console.log(`Code execution requested - Language: ${language}`);

  if (!code || !language) {
    return res.status(400).json({
      error: 'Missing required fields: code and language are required',
      output: 'Error: Please provide both code and language parameters',
    });
  }

  const mapped = resolveLanguage(language);
  if (!mapped) {
    return res.status(400).json({
      error: `Unsupported language: ${language}`,
      output: `Language "${language}" is not supported. Try nodejs, python, java, cpp, csharp, php, ruby, swift, go, or typescript.`,
    });
  }

  if (!isJdoodleConfigured()) {
    if (mapped.local && localExecutionEnabled()) {
      if (codeNeedsStdin(code) && !String(stdin).trim()) {
        return res.json({
          output:
            'This program reads from stdin (input()).\n\n' +
            'Add your test input in the "Standard Input" box below the code, then click Run again.\n\n' +
            'Example for factorial: enter a number like 5',
          statusCode: 200,
          memory: '0',
          cpuTime: '0',
          source: 'local',
          needsStdin: true,
        });
      }

      try {
        console.log(`Running ${mapped.local} locally (JDoodle keys not set)`);
        const result = await executeLocally(code, mapped.local, stdin);
        if (result) {
          return res.json(result);
        }
      } catch (err) {
        console.error('Local execution error:', err.message);
        return res.status(500).json({
          error: err.message,
          output: `Local execution failed: ${err.message}`,
        });
      }
    }

    console.log('JDoodle API credentials not configured');
    return res.json(notConfiguredResponse(language, code));
  }

  try {
    console.log('Calling JDoodle API...');
    const jdoodleRes = await axios.post(
      'https://api.jdoodle.com/v1/execute',
      {
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET,
        script: code,
        stdin,
        language: mapped.language,
        versionIndex: mapped.versionIndex,
      },
      { timeout: 30000 }
    );

    const data = jdoodleRes.data;
    console.log('JDoodle API response status:', data?.statusCode);

    if (data.statusCode && data.statusCode >= 400) {
      return res.json({
        ...data,
        source: 'jdoodle',
        output: data.output || data.error || 'Execution failed',
      });
    }

    res.json({ ...data, source: 'jdoodle' });
  } catch (err) {
    const apiError = err.response?.data?.error || err.response?.data?.message || err.message;
    console.error('JDoodle API error:', apiError);

    if (mapped.local && localExecutionEnabled()) {
      try {
        const result = await executeLocally(code, mapped.local, stdin);
        if (result) {
          return res.json({ ...result, fallback: true });
        }
      } catch {
        /* use API error below */
      }
    }

    res.status(500).json({
      error: apiError,
      output: `Error executing code: ${apiError}`,
    });
  }
});

module.exports = router;
