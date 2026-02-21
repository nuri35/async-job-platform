#!/usr/bin/env node

/**
 * Damage Control - Edit Tool Hook
 *
 * PreToolUse hook for Edit (str_replace) operations.
 * Checks against: zeroAccessPaths, readOnlyPaths
 *
 * stdin:  { "tool_name": "Edit", "tool_input": { "file_path": "..." } }
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

  // Zero access — no read, write, edit, delete
  const zeroMatches = matchesProtectedPath(filePath, patterns.zeroAccessPaths);
  if (zeroMatches.length > 0) {
    blockReasons.push(
      ...zeroMatches.map((p) => `zero-access path: ${p} (target: ${filePath})`),
    );
  }

  // Read-only — no modifications
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
    logEvent('edit', filePath, 'BLOCKED', blockReasons);
    blockResponse(blockReasons);
    return;
  }

  logEvent('edit', filePath, 'ALLOWED');
  allowResponse();
}

main().catch((error) => {
  console.error(`[damage-control:edit] Error: ${error.message}`);
  process.exit(0);
});
