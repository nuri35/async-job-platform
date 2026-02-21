/**
 * Damage Control - Shared Utilities
 *
 * Common functions used by all PreToolUse hooks.
 * Zero external dependencies — pure Node.js.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Config Loading ──────────────────────────────────────────────

const PATTERNS_PATH = path.join(__dirname, 'patterns.json');

function loadPatterns() {
  try {
    const raw = fs.readFileSync(PATTERNS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[damage-control] Failed to load patterns: ${error.message}`);
    process.exit(1);
  }
}

// ─── Stdin Reading ───────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error(`Invalid JSON from stdin: ${error.message}`));
      }
    });
    process.stdin.on('error', reject);

    // Timeout after 3 seconds to avoid hanging
    setTimeout(() => reject(new Error('stdin read timeout')), 3000);
  });
}

// ─── Path Utilities ──────────────────────────────────────────────

function expandHome(filePath) {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function normalizePath(filePath) {
  return path.resolve(expandHome(filePath));
}

/**
 * Check if a target path matches any protected path pattern.
 * Supports: exact paths, directory prefixes (ending with /),
 * and glob-style ** prefix patterns.
 */
function matchesProtectedPath(targetPath, protectedPaths) {
  const normalizedTarget = normalizePath(targetPath);
  const matches = [];

  for (const protectedPath of protectedPaths) {
    // Glob pattern: **/.env, **/node_modules/ etc.
    if (protectedPath.startsWith('**/')) {
      const suffix = protectedPath.slice(3);
      const baseName = path.basename(normalizedTarget);
      const relativeParts = normalizedTarget.split(path.sep);

      const isMatch = suffix.endsWith('/')
        ? relativeParts.some((part) => part === suffix.slice(0, -1))
        : baseName === suffix ||
          normalizedTarget.endsWith(suffix) ||
          relativeParts.some((part) => part === suffix);

      if (isMatch) {
        matches.push(protectedPath);
      }
      continue;
    }

    // Directory pattern (ending with /)
    const expanded = expandHome(protectedPath);
    const normalizedProtected = path.resolve(expanded);

    if (protectedPath.endsWith('/')) {
      if (normalizedTarget.startsWith(normalizedProtected)) {
        matches.push(protectedPath);
      }
    } else {
      // Exact file match
      if (normalizedTarget === normalizedProtected) {
        matches.push(protectedPath);
      }
    }
  }

  return matches;
}

// ─── Bash Command Path Extraction ────────────────────────────────

/**
 * Extract file paths referenced in a bash command.
 * Handles common patterns like: cat ~/.ssh/id_rsa, vim /etc/hosts, etc.
 */
function extractPathsFromCommand(command) {
  const paths = [];

  // Match absolute paths and home-relative paths
  const pathRegex = /(?:~\/[\w./-]+|\/[\w./-]+)/g;
  const matches = command.match(pathRegex);

  if (matches) {
    paths.push(...matches);
  }

  // Match relative paths that look like file operations
  const relativeRegex =
    /(?:cat|less|head|tail|vim|nano|code|mv|cp|rm|chmod|chown|touch|mkdir)\s+(?:(?:-\w+\s+)*)([.\w][\w./-]*)/g;
  let match;
  while ((match = relativeRegex.exec(command)) !== null) {
    if (match[1] && !match[1].startsWith('-')) {
      paths.push(match[1]);
    }
  }

  // Match redirect targets
  const redirectRegex = />{1,2}\s*([\w.~/-]+)/g;
  while ((match = redirectRegex.exec(command)) !== null) {
    paths.push(match[1]);
  }

  return [...new Set(paths)];
}

// ─── Pattern Matching ────────────────────────────────────────────

/**
 * Check a bash command against block/ask patterns.
 * Returns: { blocked: [...], ask: [...] }
 */
function matchBashPatterns(command, patterns) {
  const result = { blocked: [], ask: [] };

  for (const entry of patterns.bashToolPatterns.block || []) {
    const regex = new RegExp(entry.pattern, 'i');
    if (regex.test(command)) {
      result.blocked.push(entry.reason);
    }
  }

  for (const entry of patterns.bashToolPatterns.ask || []) {
    const regex = new RegExp(entry.pattern, 'i');
    if (regex.test(command)) {
      result.ask.push(entry.reason);
    }
  }

  return result;
}

// ─── Response Helpers ────────────────────────────────────────────

function blockResponse(reasons) {
  const message = `🛑 BLOCKED by damage-control:\n${reasons.map((r) => `  • ${r}`).join('\n')}`;
  process.stderr.write(message);
  process.exit(2);
}

function askResponse(reasons) {
  const response = {
    decision: 'ask',
    message: `⚠️  Confirmation needed:\n${reasons.map((r) => `  • ${r}`).join('\n')}\n\nDo you want to proceed?`,
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

function allowResponse() {
  process.exit(0);
}

// ─── Logging ─────────────────────────────────────────────────────

const LOGS_DIR = path.join(__dirname, 'logs');

function logEvent(hookName, toolInput, decision, reasons = []) {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `${today}.jsonl`);

    const entry = {
      timestamp: new Date().toISOString(),
      hook: hookName,
      decision,
      reasons,
      input:
        typeof toolInput === 'string'
          ? toolInput
          : JSON.stringify(toolInput).slice(0, 200),
    };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {
    // Logging failure should never block the hook
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  loadPatterns,
  readStdin,
  normalizePath,
  matchesProtectedPath,
  extractPathsFromCommand,
  matchBashPatterns,
  blockResponse,
  askResponse,
  allowResponse,
  logEvent,
};
