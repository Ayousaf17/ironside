# Testing & CI Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Jest test suite with Docker Postgres and GitHub Actions CI so every PR gets automated lint + test checks before merge.

**Architecture:** Jest with next/jest transformer for TypeScript/path aliases. Unit tests mock Prisma client. Integration tests hit a real Postgres (Docker in CI, local docker-compose for dev). Two GitHub Actions workflows: lint (ESLint + tsc) and test (Postgres service + Jest).

**Tech Stack:** Jest, @types/jest, next/jest, Docker Postgres 16, GitHub Actions, Bun

---

### Task 1: Install Jest + Configure

**Files:**
- Modify: `package.json` (add deps + scripts)
- Create: `jest.config.ts`

**Step 1: Install Jest dependencies**

Run:
```bash
bun add -d jest @types/jest ts-jest
```

**Step 2: Create jest.config.ts**

```typescript
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  setupFilesAfterSetup: ["<rootDir>/__tests__/setup.ts"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  clearMocks: true,
};

export default createJestConfig(config);
```

**Step 3: Add test scripts to package.json**

Add to `scripts`:
```json
"test": "jest",
"test:watch": "jest --watch",
"typecheck": "tsc --noEmit"
```

**Step 4: Run Jest to verify config loads**

Run: `bun run test`
Expected: "No tests found" (not a config error)

**Step 5: Commit**

```bash
git add jest.config.ts package.json bun.lock
git commit -m "feat: add Jest config with next/jest"
```

---

### Task 2: Create Test Setup + Prisma Mock

**Files:**
- Create: `__tests__/setup.ts`
- Create: `__tests__/helpers/prisma-mock.ts`

**Step 1: Create global test setup**

`__tests__/setup.ts`:
```typescript
// Global test setup — loads test environment variables
import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });
```

**Step 2: Create Prisma mock helper**

`__tests__/helpers/prisma-mock.ts`:
```typescript
// Mocks the Prisma client for unit tests that don't need a real DB.
// Usage: import { prismaMock } from "../helpers/prisma-mock";

import { PrismaClient } from "@prisma/client";

jest.mock("@/lib/prisma", () => {
  const mockPrisma = {
    apiLog: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    performanceMetric: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
    },
    pulseCheck: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
    },
    agentBehaviorLog: {
      create: jest.fn().mockResolvedValue({ id: "test-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $disconnect: jest.fn(),
  };
  return { prisma: mockPrisma };
});

// Re-export the mocked prisma for test assertions
export function getPrismaMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("@/lib/prisma");
  return prisma as unknown as {
    apiLog: { create: jest.Mock; findMany: jest.Mock };
    performanceMetric: { create: jest.Mock };
    pulseCheck: { create: jest.Mock };
    agentBehaviorLog: { create: jest.Mock; findMany: jest.Mock };
    $disconnect: jest.Mock;
  };
}
```

**Step 3: Create .env.test**

`.env.test`:
```env
# Test environment — committed to repo (no real secrets)
DATABASE_URL="postgresql://postgres:password@localhost:5432/ironside_test?schema=public"
OPENROUTER_API_KEY="sk-test-fake-key"
SLACK_BOT_TOKEN="xoxb-test-fake-token"
SLACK_SIGNING_SECRET=""
SLACK_CHANNEL_ID="C-TEST"
GORGIAS_MOCK="true"
```

**Step 4: Update .gitignore to allow .env.test**

Add after the `!.env.example` line:
```
!.env.test
```

**Step 5: Commit**

```bash
git add __tests__/setup.ts __tests__/helpers/prisma-mock.ts .env.test .gitignore
git commit -m "feat: add test setup, Prisma mock helper, and .env.test"
```

---

### Task 3: Event Parser Unit Tests

**Files:**
- Create: `__tests__/lib/gorgias/events.test.ts`

**Step 1: Write failing tests for parseGorgiasEvent**

`__tests__/lib/gorgias/events.test.ts`:
```typescript
import { parseGorgiasEvent } from "@/lib/gorgias/events";

describe("parseGorgiasEvent", () => {
  describe("ticket-message-created", () => {
    it("logs a reply when agent sends an email message", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Track Order #9001",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [{ name: "order-status" }],
        },
        message: {
          id: 9999,
          channel: "email",
          from_agent: true,
          body_text: "Hi, your order is in the build queue.",
          sender: { type: "agent", email: "spencer@ironsidecomputers.com" },
          created_datetime: "2026-02-28T15:00:00Z",
        },
        created_datetime: "2026-02-28T15:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe("spencer@ironsidecomputers.com");
      expect(entries[0].action).toBe("reply");
      expect(entries[0].ticketId).toBe(12345);
      expect(entries[0].category).toBe("track_order");
    });

    it("logs an internal note when channel is internal-note", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Broken GPU", tags: [] },
        message: {
          id: 8888,
          channel: "internal-note",
          from_agent: true,
          body_text: "Escalating to Mackenzie.",
          sender: { type: "agent", email: "danni-jean@ironsidecomputers.com" },
          created_datetime: "2026-02-28T16:00:00Z",
        },
        created_datetime: "2026-02-28T16:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("internal_note");
    });

    it("logs macro_used when message has macro_id in meta", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Return Request", tags: [] },
        message: {
          id: 7777,
          channel: "email",
          from_agent: true,
          body_text: "Here is our return policy...",
          sender: { type: "agent", email: "gabe@ironsidecomputers.com" },
          created_datetime: "2026-02-28T17:00:00Z",
          meta: { macro_id: 42 },
        },
        created_datetime: "2026-02-28T17:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("macro_used");
      expect(entries[0].macroIdUsed).toBe(42);
    });

    it("skips customer messages (from_agent=false)", () => {
      const payload = {
        type: "ticket-message-created",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Help", tags: [] },
        message: {
          id: 6666,
          channel: "email",
          from_agent: false,
          body_text: "I need help!",
          sender: { type: "customer", email: "customer@gmail.com" },
          created_datetime: "2026-02-28T18:00:00Z",
        },
        created_datetime: "2026-02-28T18:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });

  describe("ticket-updated", () => {
    it("logs close when status changes to closed", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Order Verification",
          assignee_user: { email: "mackenzie@ironsidecomputers.com" },
          tags: [],
        },
        changes: {
          status: { from: "open", to: "closed" },
        },
        created_datetime: "2026-02-28T19:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("close");
      expect(entries[0].reopened).toBe(false);
    });

    it("logs reopen when status changes from closed to open", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Order Verification",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [],
        },
        changes: {
          status: { from: "closed", to: "open" },
        },
        created_datetime: "2026-02-28T19:30:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("reopen");
      expect(entries[0].reopened).toBe(true);
    });

    it("logs assign when assignee changes", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "GPU Issue", tags: [] },
        changes: {
          assignee_user: {
            from: { email: "spencer@ironsidecomputers.com" },
            to: { email: "mackenzie@ironsidecomputers.com" },
          },
        },
        created_datetime: "2026-02-28T20:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("assign");
      expect(entries[0].agent).toBe("mackenzie@ironsidecomputers.com");
    });

    it("returns empty when no changes object", () => {
      const payload = {
        type: "ticket-updated",
        ticket_id: 12345,
        ticket: { id: 12345, subject: "Something", tags: [] },
        created_datetime: "2026-02-28T21:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });

  describe("ticket-created", () => {
    it("logs ticket_created with assignee and category", () => {
      const payload = {
        type: "ticket-created",
        ticket_id: 12345,
        ticket: {
          id: 12345,
          subject: "Where is my order?",
          assignee_user: { email: "spencer@ironsidecomputers.com" },
          tags: [{ name: "order-status" }],
        },
        created_datetime: "2026-02-28T12:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("ticket_created");
      expect(entries[0].category).toBe("track_order");
    });
  });

  describe("unknown event type", () => {
    it("returns empty for unrecognized event types", () => {
      const payload = {
        type: "satisfaction-survey-completed",
        ticket_id: 12345,
        created_datetime: "2026-02-28T22:00:00Z",
      };

      const entries = parseGorgiasEvent(payload);
      expect(entries).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests**

Run: `bun run test`
Expected: All tests PASS (parseGorgiasEvent is pure logic, no mocks needed)

**Step 3: Commit**

```bash
git add __tests__/lib/gorgias/events.test.ts
git commit -m "test: add unit tests for Gorgias event parser"
```

---

### Task 4: Slack Route Unit Tests

**Files:**
- Create: `__tests__/api/slack-incoming.test.ts`

These test the filtering logic (bot rejection, retry skipping, empty messages) without invoking LangChain or real Slack. We import the route handler and pass it mock Request objects.

**Step 1: Write tests**

`__tests__/api/slack-incoming.test.ts`:
```typescript
// Mock all heavy dependencies BEFORE importing the route
jest.mock("@/lib/langchain/router-agent", () => ({
  createRouterAgent: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({
      messages: [{ content: "Mock response" }],
    }),
  })),
}));
jest.mock("@/lib/slack/client", () => ({
  sendSlackMessage: jest.fn().mockResolvedValue(undefined),
}));

import { getPrismaMock } from "../helpers/prisma-mock";

// Must import route AFTER mocks are set up
import { POST } from "@/app/api/webhooks/slack/incoming/route";
import { NextRequest } from "next/server";

function makeRequest(body: object, headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest("http://localhost:3001/api/webhooks/slack/incoming", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
  return req;
}

describe("POST /api/webhooks/slack/incoming", () => {
  beforeEach(() => {
    const mock = getPrismaMock();
    mock.apiLog.create.mockClear();
    mock.performanceMetric.create.mockClear();
  });

  it("responds to Slack URL verification challenge", async () => {
    const req = makeRequest({
      type: "url_verification",
      challenge: "test-challenge-123",
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.challenge).toBe("test-challenge-123");
  });

  it("ignores retry requests (x-slack-retry-num header)", async () => {
    const req = makeRequest(
      { event: { text: "hello", channel: "C123" } },
      { "x-slack-retry-num": "1" }
    );
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("retry");
  });

  it("ignores bot messages (bot_id present)", async () => {
    const req = makeRequest({
      event: { text: "hello", bot_id: "B123", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("bot_or_system_event");
  });

  it("ignores subtype messages (message_changed, etc)", async () => {
    const req = makeRequest({
      event: { text: "hello", subtype: "message_changed", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("bot_or_system_event");
  });

  it("ignores empty messages", async () => {
    const req = makeRequest({
      event: { text: "   ", channel: "C123" },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(json.ignored).toBe("empty_message");
  });
});
```

**Step 2: Run tests**

Run: `bun run test`
Expected: All pass

**Step 3: Commit**

```bash
git add __tests__/api/slack-incoming.test.ts
git commit -m "test: add Slack route unit tests for bot/retry/empty filtering"
```

---

### Task 5: Gorgias Webhook Integration Test

**Files:**
- Create: `__tests__/api/gorgias-webhook.test.ts`

This tests the full webhook endpoint including Prisma writes. Uses the Prisma mock for now (integration tests against real DB happen in CI).

**Step 1: Write tests**

`__tests__/api/gorgias-webhook.test.ts`:
```typescript
import { getPrismaMock } from "../helpers/prisma-mock";

import { POST, GET } from "@/app/api/webhooks/gorgias/events/route";

function makeRequest(body: object): Request {
  return new Request("http://localhost:3001/api/webhooks/gorgias/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/webhooks/gorgias/events", () => {
  beforeEach(() => {
    const mock = getPrismaMock();
    mock.agentBehaviorLog.create.mockClear();
    mock.apiLog.create.mockClear();
  });

  it("parses and logs an agent reply event", async () => {
    const mock = getPrismaMock();
    const req = makeRequest({
      type: "ticket-message-created",
      ticket_id: 12345,
      ticket: {
        id: 12345,
        subject: "Track Order",
        assignee_user: { email: "spencer@ironsidecomputers.com" },
        tags: [{ name: "order-status" }],
      },
      message: {
        id: 9999,
        channel: "email",
        from_agent: true,
        body_text: "Your order is building.",
        sender: { type: "agent", email: "spencer@ironsidecomputers.com" },
        created_datetime: "2026-02-28T15:00:00Z",
      },
      created_datetime: "2026-02-28T15:00:00Z",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.logged).toBe(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledTimes(1);
    expect(mock.agentBehaviorLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agent: "spencer@ironsidecomputers.com",
          action: "reply",
          ticketId: 12345,
        }),
      })
    );
  });

  it("silently acknowledges customer messages (no agent action)", async () => {
    const mock = getPrismaMock();
    const req = makeRequest({
      type: "ticket-message-created",
      ticket_id: 12345,
      ticket: { id: 12345, subject: "Help", tags: [] },
      message: {
        id: 5555,
        channel: "email",
        from_agent: false,
        body_text: "I need help",
        sender: { type: "customer" },
        created_datetime: "2026-02-28T15:00:00Z",
      },
      created_datetime: "2026-02-28T15:00:00Z",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.logged).toBe(0);
    expect(mock.agentBehaviorLog.create).not.toHaveBeenCalled();
  });

  it("returns 500 on invalid JSON", async () => {
    const req = new Request("http://localhost:3001/api/webhooks/gorgias/events", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/webhooks/gorgias/events", () => {
  it("returns health check with tracked events", async () => {
    const res = await GET();
    const json = await res.json();

    expect(json.status).toBe("active");
    expect(json.service).toBe("ironside-behavior-logger");
    expect(json.events_tracked).toContain("ticket-created");
    expect(json.events_tracked).toContain("ticket-updated");
    expect(json.events_tracked).toContain("ticket-message-created");
  });
});
```

**Step 2: Run tests**

Run: `bun run test`
Expected: All pass

**Step 3: Commit**

```bash
git add __tests__/api/gorgias-webhook.test.ts
git commit -m "test: add Gorgias webhook endpoint tests"
```

---

### Task 6: GitHub Actions — Lint Workflow

**Files:**
- Create: `.github/workflows/lint.yml`

**Step 1: Create lint workflow**

`.github/workflows/lint.yml`:
```yaml
name: Lint

on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate Prisma client
        run: bunx prisma generate

      - name: ESLint
        run: bun run lint

      - name: TypeScript compile check
        run: bunx tsc --noEmit
```

**Step 2: Commit**

```bash
git add .github/workflows/lint.yml
git commit -m "ci: add lint workflow (ESLint + TypeScript) on PRs"
```

---

### Task 7: GitHub Actions — Test Workflow

**Files:**
- Create: `.github/workflows/test.yml`

**Step 1: Create test workflow**

`.github/workflows/test.yml`:
```yaml
name: Test

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: ironside_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: "postgresql://postgres:password@localhost:5432/ironside_test?schema=public"
      OPENROUTER_API_KEY: "sk-test-fake-key"
      SLACK_BOT_TOKEN: "xoxb-test-fake-token"
      SLACK_SIGNING_SECRET: ""
      SLACK_CHANNEL_ID: "C-TEST"
      GORGIAS_MOCK: "true"

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Generate Prisma client
        run: bunx prisma generate

      - name: Run database migrations
        run: bunx prisma migrate deploy

      - name: Run tests
        run: bun run test
```

**Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow with Docker Postgres on PRs"
```

---

### Task 8: Update peter-fullstack Skill

**Files:**
- Modify: `/Users/ayu/.claude/skills/peter-fullstack/SKILL.md`

**Step 1: Add Layer 7 to the 6 Layers table**

Add after the existing Layer 6 row:
```
7. Testing/CI   (n8n has no testing)        __tests__/, .github/workflows/
```

**Step 2: Add Layer 7 explanation section**

After the Layer 6 explanation, add:

```markdown
**Layer 7 — Testing & CI (automated safety net)**
- n8n has no testing — you manually test workflows by clicking "Execute"
- In code: Jest tests run automatically on every PR
- `__tests__/` folder contains test files that mirror your source structure
- `.github/workflows/` contains GitHub Actions that run lint + tests
- Mocked Prisma tests (Layer 4 mock) = fast, test pure logic without a DB
- Integration tests (Layer 5 real) = Docker Postgres, test actual DB reads/writes
- This is Peter's "understand the framework" — CI catches mistakes before production
```

**Step 3: Update the file tree**

Add these entries to the file system section:
```
__tests__/                    ← LAYER 7 (Testing)
├── helpers/
│   └── prisma-mock.ts        ← Fake Prisma for unit tests (Layer 4 mock)
├── lib/gorgias/
│   └── events.test.ts        ← Event parser tests (Layer 3)
└── api/
    ├── slack-incoming.test.ts ← Slack route tests (Layer 2)
    └── gorgias-webhook.test.ts← Webhook route tests (Layer 2)

.github/workflows/            ← LAYER 7 (CI)
├── lint.yml                  ← ESLint + TypeScript check on every PR
└── test.yml                  ← Jest + Docker Postgres on every PR
```

**Step 4: Update Local vs Production table**

Add CI column:
```
                LOCAL               PRODUCTION          CI (GitHub Actions)
Testing         bun run test        (not run)           Jest + Docker Postgres
Lint            bun run lint        (not run)           ESLint + tsc --noEmit
Database        Docker Postgres     Supabase            Docker Postgres (service)
```

**Step 5: Commit**

```bash
git add /Users/ayu/.claude/skills/peter-fullstack/SKILL.md
git commit -m "docs: add Layer 7 (Testing & CI) to peter-fullstack skill"
```

---

### Task 9: Final Verification

**Step 1: Run full test suite locally**

Run: `bun run test`
Expected: All tests pass

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

**Step 5: Push to feature branch and open PR**

```bash
git push origin feature/testing-ci-pipeline
```

Then open PR — the two GitHub Actions workflows should trigger and both pass.
