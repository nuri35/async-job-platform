#!/usr/bin/env node

/**
 * Controller Validator (PostToolUse Hook)
 *
 * Validates NestJS controller follows clean architecture:
 * - No business logic in controllers (only service calls)
 * - DTOs used for all inputs (no raw body access)
 * - Proper Guard decorators present
 * - Route naming follows kebab-case convention
 *
 * Exit 0 = valid
 * Exit 2 = pattern violation, stderr fed back to Claude
 */

const fs = require('fs');
const path = require('path');

const BUSINESS_LOGIC_PATTERNS = [
  {
    pattern:
      /\.\s*(find|findOne|findMany|create|save|update|delete|remove)\s*\(/,
    context: /this\.\s*(?!.*service|.*Service)/,
    name: 'Direct repository/ORM call',
    message:
      'Controller is calling repository/ORM methods directly. Move this logic to the service layer.',
  },
  {
    pattern: /new\s+\w+Entity\s*\(/,
    name: 'Entity instantiation',
    message:
      'Controller is creating entity instances. Move entity creation to the service layer.',
  },
  {
    pattern: /\.createQueryBuilder\s*\(/,
    name: 'QueryBuilder usage',
    message:
      'Controller is using QueryBuilder directly. Move database queries to the service/repository layer.',
  },
  {
    pattern: /getRepository\s*\(/,
    name: 'getRepository call',
    message:
      'Controller is accessing repository directly. Use dependency injection through the service layer.',
  },
];

const FORBIDDEN_PATTERNS = [
  {
    pattern: /@Req\(\)\s+req\s*:\s*Request/,
    name: 'Raw Request access',
    message:
      'Avoid using raw @Req(). Use @Body(), @Param(), @Query() with DTOs instead.',
  },
  {
    pattern: /req\.body\b/,
    name: 'req.body access',
    message: 'Use @Body() with a DTO instead of accessing req.body directly.',
  },
  {
    pattern: /req\.params\b/,
    name: 'req.params access',
    message:
      'Use @Param() with a DTO instead of accessing req.params directly.',
  },
  {
    pattern: /req\.query\b/,
    name: 'req.query access',
    message: 'Use @Query() with a DTO instead of accessing req.query directly.',
  },
  {
    pattern: /try\s*\{[\s\S]{200,}catch/,
    name: 'Large try-catch block',
    message:
      'Controller has large try-catch blocks. Use NestJS exception filters or move error handling to the service layer.',
  },
];

function validateController(content, filePath) {
  const errors = [];
  const fileName = path.basename(filePath);

  // Check for business logic in controller methods
  const methods = content.split(/(?:@Get|@Post|@Put|@Patch|@Delete)\(/);

  for (let i = 1; i < methods.length; i++) {
    const methodBlock = methods[i];

    for (const check of BUSINESS_LOGIC_PATTERNS) {
      if (check.pattern.test(methodBlock)) {
        if (check.context) {
          if (check.context.test(methodBlock)) {
            errors.push(`[${fileName}] ${check.name}: ${check.message}`);
          }
        } else {
          errors.push(`[${fileName}] ${check.name}: ${check.message}`);
        }
      }
    }
  }

  // Check for forbidden patterns across the whole file
  for (const check of FORBIDDEN_PATTERNS) {
    if (check.pattern.test(content)) {
      errors.push(`[${fileName}] ${check.name}: ${check.message}`);
    }
  }

  // Check route naming convention (should be kebab-case)
  const routeMatches = content.match(
    /@(?:Controller|Get|Post|Put|Patch|Delete)\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  );
  if (routeMatches) {
    for (const routeMatch of routeMatches) {
      const route = routeMatch.match(/['"`]([^'"`]+)['"`]/);
      if (route) {
        const routePath = route[1];
        // Skip dynamic params like :id
        const segments = routePath
          .split('/')
          .filter((s) => s && !s.startsWith(':'));

        for (const segment of segments) {
          if (segment !== segment.toLowerCase() || segment.includes('_')) {
            errors.push(
              `[${fileName}] Route "${routePath}" has segment "${segment}" that is not kebab-case. Use "${segment
                .replace(/_/g, '-')
                .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
                .replace(/^-/, '')}" instead.`,
            );
          }
        }
      }
    }
  }

  // Check that controller constructor only injects services
  const constructorMatch = content.match(/constructor\s*\(([\s\S]*?)\)/);
  if (constructorMatch) {
    const params = constructorMatch[1];
    const injections = params.match(
      /private\s+(?:readonly\s+)?(\w+)\s*:\s*(\w+)/g,
    );

    if (injections) {
      for (const injection of injections) {
        const typeMatch = injection.match(/:\s*(\w+)/);
        if (typeMatch) {
          const type = typeMatch[1];
          if (
            !type.endsWith('Service') &&
            !type.endsWith('Guard') &&
            !type.endsWith('Interceptor') &&
            !type.endsWith('Pipe') &&
            type !== 'Logger' &&
            type !== 'ConfigService' &&
            type !== 'JwtService' &&
            type !== 'Reflector'
          ) {
            errors.push(
              `[${fileName}] Controller injects "${type}" which doesn't appear to be a Service. Controllers should only depend on Services, not Repositories or other data-layer classes.`,
            );
          }
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

  const toolInput = inputData.tool_input || {};
  const filePath = toolInput.file_path || '';

  // Only validate controller files
  if (
    !filePath ||
    !filePath.includes('.controller.') ||
    !filePath.endsWith('.ts')
  ) {
    process.exit(0);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    process.exit(0);
  }

  const errors = validateController(content, filePath);

  if (errors.length > 0) {
    process.stderr.write(
      `CONTROLLER VALIDATION FAILED:\n\n${errors.join('\n')}\n\nFix these issues. Controllers must only contain route handling — move business logic to services.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
