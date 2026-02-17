// .claude/hooks/prompt-guard.js
// UserPromptSubmit Hook — Logging + Blocking + Warning + Subagent Routing
// Location: .claude/hooks/prompt-guard.js

const fs = require('fs');
const path = require('path');

// ─── Directory Config ────────────────────────────────────────────
const LOG_DIR = path.join(process.cwd(), 'logs', 'claude');
const SESSIONS_DIR = path.join(LOG_DIR, 'sessions');

// ─── Blocked Prompt Patterns ─────────────────────────────────────
const BLOCKED_PATTERNS = [
  // Database destruction
  {
    pattern: /DROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\s+/i,
    reason: 'DROP command blocked — risk of database structure deletion',
  },
  {
    pattern: /TRUNCATE\s+(TABLE\s+)?\w+/i,
    reason: 'TRUNCATE blocked — all table data will be deleted',
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*;/i,
    reason: 'DELETE without WHERE blocked — all rows will be deleted',
  },
  {
    pattern: /ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN/i,
    reason: 'DROP COLUMN blocked — risk of data loss',
  },

  // Filesystem destruction
  {
    pattern: /rm\s+(-rf|-fr)\s+[\/~]/i,
    reason: 'rm -rf on root/home directory blocked',
  },
  {
    pattern: /rmdir\s+\/s\s+\/q/i,
    reason: 'Windows recursive delete blocked',
  },
  {
    pattern: /del\s+\/s\s+\/q\s+[A-Z]:\\/i,
    reason: 'Windows drive deletion blocked',
  },
  {
    pattern: /format\s+[A-Z]:/i,
    reason: 'Disk format blocked',
  },

  // Sensitive file operations
  {
    pattern: /cat\s+.*\.env(?:\.|$|\s)/i,
    reason: '.env file read blocked — secret leak risk',
  },
  {
    pattern: /echo\s+.*>\s*\.env/i,
    reason: '.env file write blocked',
  },
  {
    pattern: /curl\s+.*\|\s*(bash|sh|zsh)/i,
    reason: 'Remote script execution blocked',
  },

  // Dangerous git commands
  {
    pattern: /git\s+push\s+.*--force(?!\-with-lease)/i,
    reason: 'git push --force blocked — use --force-with-lease instead',
  },
  {
    pattern: /git\s+reset\s+--hard\s+HEAD~?\d*/i,
    reason: 'git reset --hard blocked — risk of commit loss',
  },
  {
    pattern: /git\s+clean\s+-fd/i,
    reason: 'git clean -fd blocked — untracked files will be deleted',
  },

  // Production environment risks
  {
    pattern: /NODE_ENV\s*=\s*production.*&&.*rm/i,
    reason: 'Deletion in production environment blocked',
  },
  {
    pattern: /prisma\s+migrate\s+reset/i,
    reason: 'Prisma migrate reset blocked — all data will be deleted',
  },
  {
    pattern: /prisma\s+db\s+push\s+--force-reset/i,
    reason: 'Prisma force reset blocked',
  },

  // Network safety
  {
    pattern: /npm\s+publish(?!\s+--dry-run)/i,
    reason: 'npm publish blocked — accidental publish risk (add --dry-run)',
  },
  {
    pattern: /docker\s+system\s+prune\s+-a/i,
    reason: 'Docker system prune -a blocked — all images will be deleted',
  },
];

// ─── Warning Patterns (no block, injects context) ───────────────
const WARNING_PATTERNS = [
  {
    pattern: /DELETE\s+FROM\s+\w+\s+WHERE\b/i,
    warning: 'DELETE FROM ... WHERE detected — verify the condition carefully',
  },
  {
    pattern: /UPDATE\s+\w+\s+SET\b/i,
    warning: 'UPDATE SET detected — verify the WHERE clause',
  },
  {
    pattern: /migration|migrate/i,
    warning:
      "Migration operation detected — make sure you're not in production",
  },
  {
    pattern: /seed|seeder/i,
    warning:
      "Seed operation detected — verify which environment you're targeting",
  },
];

// ─── Subagent Routing (keyword detection → subagent delegation) ─
const SUBAGENT_ROUTES = [
  {
    // Complex feature requests → prompt-engineer enriches before coding
    keywords: [
      /\b(module|feature|endpoint|api|crud|service)\b/i,
      /\b(implement|create|build|add|design)\b/i,
    ],
    minKeywordMatches: 2,
    minPromptLength: 30,
    subagent: 'prompt-engineer',
    instruction: [
      'Before implementing this request, delegate to the **prompt-engineer** subagent to enrich the prompt.',
      '',
      'The subagent should:',
      "1. Identify ambiguous or missing details in the user's prompt",
      '2. Suggest NestJS module structure (new module or existing?)',
      '3. List required files (Controller, Service, DTO, Entity, Module)',
      '4. Identify edge cases and error scenarios',
      '5. Add security and validation requirements',
      '6. Suggest performance and scalability considerations',
      '',
      'Stack context for the subagent:',
      '- Backend: NestJS + TypeScript (monorepo)',
      '- ORM: Prisma + PostgreSQL',
      '- Queue: BullMQ + Redis + RabbitMQ',
      '- Patterns: Repository, DTOs with class-validator, Guards, Interceptors',
      '- Principles: SOLID, Clean Code, Early Returns',
      '',
      "After receiving the subagent's analysis:",
      '- If architecture decisions are needed, ASK the user first',
      '- Then write production-ready code based on the enriched prompt',
    ].join('\n'),
  },
  {
    // Debug/error requests → structured debugging approach
    keywords: [
      /\b(bug|error|fix|debug|broken|crash|fail)\b/i,
      /\b(not working|issue|problem|exception|stacktrace)\b/i,
    ],
    minKeywordMatches: 1,
    minPromptLength: 15,
    subagent: 'debugger',
    instruction: [
      'This looks like a debugging request. Follow a structured approach:',
      '',
      '1. Read the relevant error logs and stack traces first',
      '2. Identify the root cause, not just the symptom',
      '3. Check if the issue is in the code, config, or environment',
      '4. Propose a fix that addresses the root cause',
      '5. Add error handling to prevent recurrence',
      '6. Suggest a test case that would catch this bug',
    ].join('\n'),
  },
  {
    // Architecture/design questions → think deeper before answering
    keywords: [
      /\b(architecture|design|pattern|structure|refactor)\b/i,
      /\b(scalab|performance|optimize|best practice)\b/i,
    ],
    minKeywordMatches: 1,
    minPromptLength: 20,
    subagent: 'architect',
    instruction: [
      'This is an architecture/design question. Think deeply before responding:',
      '',
      '1. Consider multiple approaches with trade-offs',
      '2. Evaluate against SOLID principles',
      '3. Consider scalability implications',
      '4. Think about testing and maintainability',
      '5. Present options to the user before implementing',
      '6. Reference established patterns (Repository, CQRS, Event-Driven, etc.)',
    ].join('\n'),
  },
  {
    // Testing requests → test-driven approach
    keywords: [
      /\b(test|spec|coverage|jest|e2e|unit test|integration test)\b/i,
      /\b(write tests|add tests|test for|testing)\b/i,
    ],
    minKeywordMatches: 1,
    minPromptLength: 15,
    subagent: 'tester',
    instruction: [
      'This is a testing request. Follow test-driven best practices:',
      '',
      '1. Identify what needs to be tested (unit, integration, e2e)',
      '2. Write descriptive test names that explain the expected behavior',
      '3. Follow AAA pattern (Arrange, Act, Assert)',
      '4. Mock external dependencies (database, queues, APIs)',
      '5. Cover happy path, edge cases, and error scenarios',
      '6. Use NestJS testing utilities (Test.createTestingModule)',
    ].join('\n'),
  },
];

// ─── Helper Functions ───────────────────────────────────────────

function ensureDirectories() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch {
    // Silently continue
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

// ─── Prompt Logging ─────────────────────────────────────────────

function logToDaily(entry) {
  try {
    const dailyFile = path.join(LOG_DIR, `${getDateString()}.json`);

    let logs = [];
    if (fs.existsSync(dailyFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
      } catch {
        logs = [];
      }
    }

    logs.push(entry);
    fs.writeFileSync(dailyFile, JSON.stringify(logs, null, 2));
  } catch {
    // Silently continue if logging fails
  }
}

function logToSession(sessionId, entry) {
  try {
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);

    let sessionData = {
      session_id: sessionId,
      started_at: getTimestamp(),
      prompts: [],
    };

    if (fs.existsSync(sessionFile)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      } catch {
        sessionData = {
          session_id: sessionId,
          started_at: getTimestamp(),
          prompts: [],
        };
      }
    }

    sessionData.prompts.push(entry);
    sessionData.last_prompt_at = getTimestamp();
    sessionData.total_prompts = sessionData.prompts.length;

    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
  } catch {
    // Silently continue if session logging fails
  }
}

// ─── Prompt Checks ──────────────────────────────────────────────

function checkBlocked(prompt) {
  return BLOCKED_PATTERNS.find((item) => item.pattern.test(prompt)) || null;
}

function checkWarnings(prompt) {
  return WARNING_PATTERNS.filter((item) => item.pattern.test(prompt));
}

function checkSubagentRoute(prompt) {
  for (const route of SUBAGENT_ROUTES) {
    if (prompt.length < route.minPromptLength) continue;

    const matchCount = route.keywords.filter((kw) => kw.test(prompt)).length;

    if (matchCount >= route.minKeywordMatches) {
      return route;
    }
  }
  return null;
}

// ─── Main ───────────────────────────────────────────────────────

let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    ensureDirectories();

    const data = JSON.parse(input);
    const sessionId = data.session_id || 'unknown';
    const prompt = data.prompt || '';

    const logEntry = {
      timestamp: getTimestamp(),
      session_id: sessionId,
      prompt: prompt,
      prompt_length: prompt.length,
    };

    // ── Step 1: Block dangerous prompts ──────────────────────
    const blocked = checkBlocked(prompt);
    if (blocked) {
      logEntry.status = 'BLOCKED';
      logEntry.reason = blocked.reason;
      logToDaily(logEntry);
      logToSession(sessionId, logEntry);

      process.stderr.write(`\n⛔ BLOCKED: ${blocked.reason}\n`);
      process.exit(2);
    }

    // ── Step 2: Check warnings ───────────────────────────────
    const warnings = checkWarnings(prompt);

    // ── Step 3: Check subagent routing ───────────────────────
    const route = checkSubagentRoute(prompt);

    // ── Step 4: Build additionalContext ──────────────────────
    const contextParts = [];

    if (warnings.length > 0) {
      const warningText = warnings.map((w) => `⚠️ ${w.warning}`).join('\n');
      contextParts.push(
        `[Prompt Guard — Warnings]:\n${warningText}\nProceed with caution.`,
      );
    }

    if (route) {
      contextParts.push(
        `[Prompt Guard — ${route.subagent} subagent routing]:\n${route.instruction}`,
      );
    }

    // ── Step 5: Log and output ───────────────────────────────
    logEntry.status = warnings.length > 0 ? 'WARNING' : route ? 'ROUTED' : 'OK';

    if (warnings.length > 0) {
      logEntry.warnings = warnings.map((w) => w.warning);
    }
    if (route) {
      logEntry.routed_to = route.subagent;
    }

    logToDaily(logEntry);
    logToSession(sessionId, logEntry);

    if (contextParts.length > 0) {
      const output = {
        additionalContext: contextParts.join('\n\n---\n\n'),
      };
      process.stdout.write(JSON.stringify(output));
    }

    process.exit(0);
  } catch {
    // Never block Claude on hook errors
    process.exit(0);
  }
});
