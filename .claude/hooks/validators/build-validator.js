#!/usr/bin/env node

/**
 * Build Validator (Stop Hook)
 *
 * Runs TypeScript compilation check after agent finishes work.
 * Ensures no type errors were introduced.
 *
 * Exit 0 = build OK
 * Exit 2 = build failed, stderr fed back to Claude
 */

const { execSync } = require('child_process');
const fs = require('fs');

function main() {
  let inputData;
  try {
    inputData = JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    process.exit(0);
  }

  const toolName = inputData.tool_name || '';
  const toolInput = inputData.tool_input || {};
  const filePath = toolInput.file_path || toolInput.content || '';

  // Only validate TypeScript files
  if (filePath && !filePath.endsWith('.ts')) {
    process.exit(0);
  }

  try {
    execSync('npx tsc --noEmit --pretty 2>&1', {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: process.cwd(),
    });

    process.exit(0);
  } catch (error) {
    const output = error.stdout || error.message || '';

    // Extract only the first 5 errors to keep feedback concise
    const lines = output.split('\n');
    const errorLines = lines.filter(
      (line) => line.includes('error TS') || line.includes('Error:'),
    );
    const relevantErrors = errorLines.slice(0, 5).join('\n');

    process.stderr.write(
      `BUILD FAILED: TypeScript compilation errors detected.\n\n${relevantErrors}\n`,
    );

    if (errorLines.length > 5) {
      process.stderr.write(`\n... and ${errorLines.length - 5} more errors.\n`);
    }

    process.stderr.write('\nFix these TypeScript errors before proceeding.\n');
    process.exit(2);
  }
}

main();
