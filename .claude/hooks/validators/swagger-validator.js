#!/usr/bin/env node

/**
 * Swagger Validator (PostToolUse Hook)
 *
 * Validates that controllers and DTOs have proper Swagger decorators.
 * Runs after every Write/Edit on .ts files.
 *
 * Controller checks: @ApiTags, @ApiOperation, @ApiResponse
 * DTO checks: @ApiProperty with description
 *
 * Exit 0 = valid
 * Exit 2 = missing decorators, stderr fed back to Claude
 */

const fs = require('fs');
const path = require('path');

const CONTROLLER_REQUIRED = {
  classLevel: [
    {
      pattern: /@ApiTags\(/,
      name: '@ApiTags',
      message: 'Controller class must have @ApiTags decorator',
    },
    {
      pattern: /@Controller\(/,
      name: '@Controller',
      message: 'Must be a valid NestJS controller',
    },
  ],
  methodLevel: [
    {
      pattern: /@ApiOperation\(/,
      name: '@ApiOperation',
      message: 'Every endpoint method must have @ApiOperation with summary',
    },
    {
      pattern: /@ApiResponse\(/,
      name: '@ApiResponse',
      message:
        'Every endpoint method must have at least one @ApiResponse (200/201 and 400)',
    },
  ],
};

const HTTP_METHODS = /@(Get|Post|Put|Patch|Delete)\(/;

function validateController(content, filePath) {
  const errors = [];
  const fileName = path.basename(filePath);

  // Class-level checks
  for (const check of CONTROLLER_REQUIRED.classLevel) {
    if (!check.pattern.test(content)) {
      errors.push(`[${fileName}] Missing ${check.name}: ${check.message}`);
    }
  }

  // Method-level checks - find each HTTP method and check decorators above it
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (HTTP_METHODS.test(line)) {
      // Look back up to 15 lines for decorators
      const contextStart = Math.max(0, i - 15);
      const methodContext = lines.slice(contextStart, i + 1).join('\n');

      // Extract method name from the line after HTTP decorator
      let methodName = 'unknown';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const match = lines[j].match(/(?:async\s+)?(\w+)\s*\(/);
        if (match) {
          methodName = match[1];
          break;
        }
      }

      for (const check of CONTROLLER_REQUIRED.methodLevel) {
        if (!check.pattern.test(methodContext)) {
          errors.push(
            `[${fileName}] Method "${methodName}" is missing ${check.name}: ${check.message}`,
          );
        }
      }
    }
  }

  // Check that @ApiResponse includes at least success and error responses
  const apiResponseMatches = content.match(
    /@ApiResponse\(\{[^}]*status:\s*(\d+)/g,
  );
  if (apiResponseMatches) {
    const statuses = apiResponseMatches.map((m) => {
      const match = m.match(/status:\s*(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });

    const hasSuccess = statuses.some((s) => s >= 200 && s < 300);
    const hasError = statuses.some((s) => s >= 400);

    if (!hasSuccess) {
      errors.push(
        `[${fileName}] Missing success @ApiResponse (2xx status code)`,
      );
    }
    if (!hasError) {
      errors.push(
        `[${fileName}] Missing error @ApiResponse (4xx status code). Add at least @ApiResponse({ status: 400 })`,
      );
    }
  }

  return errors;
}

function validateDto(content, filePath) {
  const errors = [];
  const fileName = path.basename(filePath);

  // Find all class properties (lines with field declarations)
  const propertyPattern = /^\s+(?:readonly\s+)?(\w+)[\?!]?\s*:\s*\w+/gm;
  let match;

  const lines = content.split('\n');

  while ((match = propertyPattern.exec(content)) !== null) {
    const propertyName = match[1];
    const propertyLine = content.substring(0, match.index).split('\n').length;

    // Skip constructor parameters and method parameters
    if (
      propertyName === 'constructor' ||
      propertyName === 'return' ||
      propertyName === 'const' ||
      propertyName === 'let'
    ) {
      continue;
    }

    // Look back up to 10 lines for @ApiProperty
    const contextStart = Math.max(0, propertyLine - 10);
    const propertyContext = lines.slice(contextStart, propertyLine).join('\n');

    if (!/@ApiProperty\(/.test(propertyContext)) {
      errors.push(
        `[${fileName}] Property "${propertyName}" is missing @ApiProperty decorator`,
      );
    } else {
      // Check if @ApiProperty has description
      const apiPropMatch = propertyContext.match(
        /@ApiProperty\(\{([^}]*)\}\)/s,
      );
      if (apiPropMatch) {
        if (!/description\s*:/.test(apiPropMatch[1])) {
          errors.push(
            `[${fileName}] Property "${propertyName}" @ApiProperty is missing 'description' field`,
          );
        }
      }
    }
  }

  return errors;
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
  const filePath = toolInput.file_path || '';

  // Only validate .ts files
  if (!filePath || !filePath.endsWith('.ts')) {
    process.exit(0);
  }

  // Determine file type
  const isController = filePath.includes('.controller.');
  const isDto = filePath.includes('.dto.');

  // Skip if not a controller or DTO
  if (!isController && !isDto) {
    process.exit(0);
  }

  // Read the file
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    // File might not exist yet during Write preview
    process.exit(0);
  }

  let errors = [];

  if (isController) {
    errors = validateController(content, filePath);
  } else if (isDto) {
    errors = validateDto(content, filePath);
  }

  if (errors.length > 0) {
    process.stderr.write(
      `SWAGGER VALIDATION FAILED:\n\n${errors.join('\n')}\n\nFix these Swagger documentation issues before proceeding.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
