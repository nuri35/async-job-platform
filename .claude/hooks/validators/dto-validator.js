#!/usr/bin/env node

/**
 * DTO Validator (PostToolUse Hook)
 *
 * Validates that DTOs have proper class-validator decorators.
 * Ensures every property has validation, optional fields are marked,
 * and nested objects use @ValidateNested + @Type.
 *
 * Exit 0 = valid
 * Exit 2 = missing validation, stderr fed back to Claude
 */

const fs = require('fs');
const path = require('path');

const VALIDATOR_DECORATORS = [
  '@IsString',
  '@IsNumber',
  '@IsInt',
  '@IsBoolean',
  '@IsEmail',
  '@IsEnum',
  '@IsArray',
  '@IsDate',
  '@IsDateString',
  '@IsUUID',
  '@IsNotEmpty',
  '@IsOptional',
  '@IsPositive',
  '@IsUrl',
  '@IsObject',
  '@ValidateNested',
  '@Min',
  '@Max',
  '@MinLength',
  '@MaxLength',
  '@Matches',
  '@ArrayMinSize',
  '@ArrayMaxSize',
  '@IsIn',
];

function extractProperties(content) {
  const properties = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match property declarations like: name: string; or name?: string;
    const propMatch = line.match(
      /^(?:readonly\s+)?(\w+)(\?)?(?:!)?:\s*([^;=]+)/,
    );

    if (propMatch) {
      const name = propMatch[1];
      const isOptionalMark = !!propMatch[2];
      const type = propMatch[3].trim();

      // Skip common non-property lines
      if (
        [
          'constructor',
          'return',
          'const',
          'let',
          'var',
          'class',
          'import',
          'export',
          'private',
          'protected',
          'public',
        ].includes(name)
      ) {
        continue;
      }

      // Get context above this property (decorators)
      const contextStart = Math.max(0, i - 15);
      const context = lines.slice(contextStart, i).join('\n');

      properties.push({
        name,
        type,
        isOptionalMark,
        lineNumber: i + 1,
        context,
      });
    }
  }

  return properties;
}

function validateProperties(properties, filePath) {
  const errors = [];
  const fileName = path.basename(filePath);

  for (const prop of properties) {
    const { name, type, isOptionalMark, context } = prop;

    // Check for at least one validator decorator
    const hasValidator = VALIDATOR_DECORATORS.some((dec) =>
      context.includes(dec),
    );

    if (!hasValidator) {
      errors.push(
        `[${fileName}] Property "${name}" (type: ${type}) has no class-validator decorator. ` +
          `Add appropriate validation like @IsString(), @IsNumber(), @IsNotEmpty(), etc.`,
      );
    }

    // Check optional consistency
    if (isOptionalMark && !context.includes('@IsOptional')) {
      errors.push(
        `[${fileName}] Property "${name}" is marked with "?" but missing @IsOptional() decorator`,
      );
    }

    if (!isOptionalMark && context.includes('@IsOptional')) {
      errors.push(
        `[${fileName}] Property "${name}" has @IsOptional() but is not marked with "?". Add "?" or remove @IsOptional()`,
      );
    }

    // Check nested objects need @ValidateNested + @Type
    const isNestedObject =
      /^[A-Z]\w+(Dto|DTO)/.test(type) ||
      (type.includes('[]') && /^[A-Z]/.test(type));

    if (isNestedObject) {
      if (!context.includes('@ValidateNested')) {
        errors.push(
          `[${fileName}] Property "${name}" (type: ${type}) is a nested object. Add @ValidateNested() decorator`,
        );
      }
      if (!context.includes('@Type(')) {
        errors.push(
          `[${fileName}] Property "${name}" (type: ${type}) is a nested object. Add @Type(() => ${type.replace('[]', '')}) decorator from class-transformer`,
        );
      }
    }

    // Check arrays have @IsArray
    if (type.includes('[]') && !context.includes('@IsArray')) {
      errors.push(
        `[${fileName}] Property "${name}" is an array type but missing @IsArray() decorator`,
      );
    }

    // Check enums have @IsEnum
    if (
      context.includes('@ApiProperty') &&
      context.includes('enum:') &&
      !context.includes('@IsEnum')
    ) {
      errors.push(
        `[${fileName}] Property "${name}" has enum in @ApiProperty but missing @IsEnum() decorator`,
      );
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

  // Only validate DTO files
  if (!filePath || !filePath.includes('.dto.') || !filePath.endsWith('.ts')) {
    process.exit(0);
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    process.exit(0);
  }

  // Skip if file doesn't look like a DTO class
  if (!content.includes('class ')) {
    process.exit(0);
  }

  const properties = extractProperties(content);

  if (properties.length === 0) {
    process.exit(0);
  }

  const errors = validateProperties(properties, filePath);

  if (errors.length > 0) {
    process.stderr.write(
      `DTO VALIDATION FAILED:\n\n${errors.join('\n')}\n\nFix these validation issues. Every DTO property must have proper class-validator decorators.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
