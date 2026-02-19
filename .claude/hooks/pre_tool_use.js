#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DANGEROUS_RM_PATTERNS = [
  /\brm\s+.*-[a-z]*r[a-z]*f/i,
  /\brm\s+.*-[a-z]*f[a-z]*r/i,
  /\brm\s+--recursive\s+--force/i,
  /\brm\s+--force\s+--recursive/i,
  /\brm\s+-r\s+.*-f/i,
  /\brm\s+-f\s+.*-r/i,
];

const DANGEROUS_PATHS = [
  /^\//,
  /\/\*/,
  /~/,
  /~\//,
  /\$HOME/,
  /\.\./,
  /\*/,
  /\.\s*$/,
];

const ENV_FILE_PATTERNS = [
  /\.env\b(?!\.sample|\.example)/,
  /cat\s+.*\.env\b(?!\.sample|\.example)/,
  /echo\s+.*>\s*\.env\b(?!\.sample|\.example)/,
  /touch\s+.*\.env\b(?!\.sample|\.example)/,
  /cp\s+.*\.env\b(?!\.sample|\.example)/,
  /mv\s+.*\.env\b(?!\.sample|\.example)/,
];

function isDangerousRmCommand(command) {
  const normalized = command.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const pattern of DANGEROUS_RM_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  if (/\brm\s+.*-[a-z]*r/i.test(normalized)) {
    for (const pathPattern of DANGEROUS_PATHS) {
      if (pathPattern.test(normalized)) return true;
    }
  }

  return false;
}

function isEnvFileAccess(toolName, toolInput) {
  const fileTools = ['Read', 'Edit', 'MultiEdit', 'Write'];

  if (fileTools.includes(toolName)) {
    const filePath = toolInput.file_path || '';
    if (/\.env\b(?!\.sample|\.example)/.test(filePath)) return true;
  }

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    for (const pattern of ENV_FILE_PATTERNS) {
      if (pattern.test(command)) return true;
    }
  }

  return false;
}

function logToolUsage(inputData) {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    const logPath = path.join(logDir, 'pre_tool_use.json');

    fs.mkdirSync(logDir, { recursive: true });

    let logData = [];
    if (fs.existsSync(logPath)) {
      try {
        logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch {
        logData = [];
      }
    }

    logData.push(inputData);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  } catch {
    // Logging failure should not block tool execution
  }
}
function main() {
  let inputData;
  try {
    inputData = JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    process.exit(0);
  }

  const toolName = inputData.tool_name || '';
  const toolInput = inputData.tool_input || {};

  if (isEnvFileAccess(toolName, toolInput)) {
    process.stderr.write(
      'BLOCKED: Access to .env files containing sensitive data is prohibited\n',
    );
    process.stderr.write('Use .env.sample for template files instead\n');
    process.exit(2);
  }

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (isDangerousRmCommand(command)) {
      process.stderr.write(
        'BLOCKED: Dangerous rm command detected and prevented\n',
      );
      process.exit(2);
    }
  }

  logToolUsage(inputData);
  process.exit(0);
}

main();
