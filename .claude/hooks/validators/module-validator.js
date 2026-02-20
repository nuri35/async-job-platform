#!/usr/bin/env node

/**
 * Module Validator (Stop Hook)
 *
 * Validates that newly created/modified controllers and services
 * are properly registered in their parent NestJS module.
 *
 * Checks:
 * - Controller is in module's 'controllers' array
 * - Service is in module's 'providers' array
 * - Required imports are present in the module file
 *
 * Exit 0 = valid
 * Exit 2 = missing registration, stderr fed back to Claude
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findModuleFile(filePath) {
  // Given a controller/service path, find the corresponding module file
  // e.g., src/jobs/jobs.controller.ts -> src/jobs/jobs.module.ts
  const dir = path.dirname(filePath);
  const files = fs.readdirSync(dir);
  const moduleFile = files.find((f) => f.endsWith('.module.ts'));

  if (moduleFile) {
    return path.join(dir, moduleFile);
  }

  // Check parent directory
  const parentDir = path.dirname(dir);
  try {
    const parentFiles = fs.readdirSync(parentDir);
    const parentModule = parentFiles.find((f) => f.endsWith('.module.ts'));
    if (parentModule) {
      return path.join(parentDir, parentModule);
    }
  } catch {
    // Parent directory might not exist
  }

  return null;
}

function extractClassName(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/export\s+class\s+(\w+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function validateModuleRegistration(errors) {
  // Find recently modified .controller.ts and .service.ts files
  let recentFiles = [];

  try {
    // Get files modified in the last 5 minutes
    const result = execSync(
      'find . -name "*.controller.ts" -o -name "*.service.ts" | head -50',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    if (result) {
      recentFiles = result.split('\n').filter(Boolean);
    }
  } catch {
    // find command might not work on Windows, try alternative
    try {
      const result = execSync('dir /s /b *.controller.ts *.service.ts 2>nul', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      if (result) {
        recentFiles = result
          .split('\n')
          .filter(Boolean)
          .map((f) => f.trim());
      }
    } catch {
      process.exit(0);
    }
  }

  for (const filePath of recentFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const isController = normalizedPath.includes('.controller.');
    const isService =
      normalizedPath.includes('.service.') &&
      !normalizedPath.includes('.spec.');

    if (!isController && !isService) continue;

    const className = extractClassName(filePath);
    if (!className) continue;

    const moduleFile = findModuleFile(filePath);
    if (!moduleFile) {
      errors.push(
        `No module file found for "${path.basename(filePath)}". Create a module or register in an existing one.`,
      );
      continue;
    }

    let moduleContent;
    try {
      moduleContent = fs.readFileSync(moduleFile, 'utf-8');
    } catch {
      continue;
    }

    const moduleName = path.basename(moduleFile);

    // Check if class is imported in module
    if (!moduleContent.includes(className)) {
      const arrayName = isController ? 'controllers' : 'providers';
      errors.push(
        `[${moduleName}] "${className}" is not registered. Add it to the '${arrayName}' array and import it.`,
      );
      continue;
    }

    // Check if it's in the correct array
    if (isController) {
      const controllersMatch = moduleContent.match(
        /controllers\s*:\s*\[([\s\S]*?)\]/,
      );
      if (controllersMatch && !controllersMatch[1].includes(className)) {
        errors.push(
          `[${moduleName}] "${className}" is imported but not in the 'controllers' array.`,
        );
      }
    }

    if (isService) {
      const providersMatch = moduleContent.match(
        /providers\s*:\s*\[([\s\S]*?)\]/,
      );
      if (providersMatch && !providersMatch[1].includes(className)) {
        errors.push(
          `[${moduleName}] "${className}" is imported but not in the 'providers' array.`,
        );
      }
    }
  }
}

function main() {
  let inputData;
  try {
    inputData = JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    process.exit(0);
  }

  const errors = [];
  validateModuleRegistration(errors);

  if (errors.length > 0) {
    process.stderr.write(
      `MODULE REGISTRATION FAILED:\n\n${errors.join('\n')}\n\nEnsure all controllers and services are properly registered in their module.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
