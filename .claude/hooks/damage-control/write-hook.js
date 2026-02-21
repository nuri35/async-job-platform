#!/usr/bin/env node

/**
 * Damage Control - Write Tool Hook
 *
 * PreToolUse hook for Write (file_create) operations.
 * Checks against: zeroAccessPaths, readOnlyPaths
 *
 * stdin:  { "tool_name": "Write", "tool_input": { "file_path": "..." } }
 * exit 0: allow
 * exit 2: block
 */

const {
  loadPatterns,
  readStdin,
  matchesProtectedPath,
  blockResponse,
  allowResponse,
  logEvent,
} = require('./shared');

async function main() {
  const patterns = loadPatterns();
  const input = await readStdin();

  const filePath = input?.tool_input?.file_path;
  if (!filePath) {
    allowResponse();
    return;
  }

  const blockReasons = [];

  // Zero access — no operations at all
  const zeroMatches = matchesProtectedPath(filePath, patterns.zeroAccessPaths);
  if (zeroMatches.length > 0) {
    blockReasons.push(
      ...zeroMatches.map((p) => `zero-access path: ${p} (target: ${filePath})`),
    );
  }

  // Read-only — no write operations
  const readOnlyMatches = matchesProtectedPath(
    filePath,
    patterns.readOnlyPaths,
  );
  if (readOnlyMatches.length > 0) {
    blockReasons.push(
      ...readOnlyMatches.map(
        (p) => `read-only path: ${p} (target: ${filePath})`,
      ),
    );
  }

  if (blockReasons.length > 0) {
    logEvent('write', filePath, 'BLOCKED', blockReasons);
    blockResponse(blockReasons);
    return;
  }

  logEvent('write', filePath, 'ALLOWED');
  allowResponse();
}

main().catch((error) => {
  console.error(`[damage-control:write] Error: ${error.message}`);
  process.exit(0);
});
