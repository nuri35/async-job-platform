#!/usr/bin/env node

/**
 * Damage Control - Bash Tool Hook
 *
 * PreToolUse hook for Bash commands.
 * Checks against: bashToolPatterns, zeroAccessPaths, readOnlyPaths, noDeletePaths
 *
 * stdin:  { "tool_name": "Bash", "tool_input": { "command": "..." } }
 * exit 0: allow
 * exit 2: block (stderr message shown to Claude)
 * exit 0 + JSON stdout: ask for confirmation
 */

const {
  loadPatterns,
  readStdin,
  matchBashPatterns,
  matchesProtectedPath,
  extractPathsFromCommand,
  blockResponse,
  askResponse,
  allowResponse,
  logEvent,
} = require('./shared');

async function main() {
  const patterns = loadPatterns();
  const input = await readStdin();

  const command = input?.tool_input?.command;
  if (!command) {
    allowResponse();
    return;
  }

  const allBlockReasons = [];
  const allAskReasons = [];

  // ─── Layer 1: Bash Pattern Matching ──────────────────────────
  const patternResult = matchBashPatterns(command, patterns);
  allBlockReasons.push(...patternResult.blocked);
  allAskReasons.push(...patternResult.ask);

  // ─── Layer 2: Path Protection ────────────────────────────────
  const paths = extractPathsFromCommand(command);

  for (const filePath of paths) {
    // Zero access — full block
    const zeroMatches = matchesProtectedPath(
      filePath,
      patterns.zeroAccessPaths,
    );
    if (zeroMatches.length > 0) {
      allBlockReasons.push(
        ...zeroMatches.map(
          (p) => `zero-access path: ${p} (target: ${filePath})`,
        ),
      );
    }

    // Read-only — block writes, edits, deletes
    const isWriteOperation =
      /\b(mv|cp|chmod|chown|tee)\b/.test(command) ||
      />/.test(command) ||
      />>/.test(command) ||
      /\bsed\s+-i/.test(command);

    if (isWriteOperation) {
      const readOnlyMatches = matchesProtectedPath(
        filePath,
        patterns.readOnlyPaths,
      );
      if (readOnlyMatches.length > 0) {
        allBlockReasons.push(
          ...readOnlyMatches.map(
            (p) => `read-only path: ${p} (target: ${filePath})`,
          ),
        );
      }
    }

    // No-delete — block only rm/unlink operations
    const isDeleteOperation = /\b(rm|unlink|rmdir)\b/.test(command);
    if (isDeleteOperation) {
      const noDeleteMatches = matchesProtectedPath(
        filePath,
        patterns.noDeletePaths,
      );
      if (noDeleteMatches.length > 0) {
        allBlockReasons.push(
          ...noDeleteMatches.map(
            (p) => `no-delete path: ${p} (target: ${filePath})`,
          ),
        );
      }
    }
  }

  // ─── Decision ────────────────────────────────────────────────

  // Block reasons take priority over ask reasons
  if (allBlockReasons.length > 0) {
    logEvent('bash', command, 'BLOCKED', allBlockReasons);
    blockResponse(allBlockReasons);
    return;
  }

  if (allAskReasons.length > 0) {
    logEvent('bash', command, 'ASK', allAskReasons);
    askResponse(allAskReasons);
    return;
  }

  logEvent('bash', command, 'ALLOWED');
  allowResponse();
}

main().catch((error) => {
  console.error(`[damage-control:bash] Error: ${error.message}`);
  // On error, allow the command to proceed (fail-open)
  process.exit(0);
});
