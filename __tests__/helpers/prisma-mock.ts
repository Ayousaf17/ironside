// Mocks the repo layer for unit tests that don't need a real DB.
// Route handlers now use services/repos instead of Prisma directly.
// Individual test files mock the specific services they need.
//
// This shared helper mocks the underlying Prisma client for any test
// that still needs it (e.g., testing repo functions themselves).

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
    agentSession: {
      create: jest.fn().mockResolvedValue({ id: "test-session-id" }),
      update: jest.fn().mockResolvedValue({ id: "test-session-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    agentRequest: {
      create: jest.fn().mockResolvedValue({ id: "test-request-id" }),
    },
    agentToolCall: {
      create: jest.fn().mockResolvedValue({ id: "test-tool-call-id" }),
    },
    agentOutcome: {
      create: jest.fn().mockResolvedValue({ id: "test-outcome-id" }),
    },
    aiTokenUsage: {
      create: jest.fn().mockResolvedValue({ id: "test-token-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $disconnect: jest.fn(),
  };
  return { prisma: mockPrisma };
});

export function getPrismaMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { prisma } = require("@/lib/prisma");
  return prisma as unknown as {
    apiLog: { create: jest.Mock; findMany: jest.Mock };
    performanceMetric: { create: jest.Mock };
    pulseCheck: { create: jest.Mock };
    agentBehaviorLog: { create: jest.Mock; findMany: jest.Mock };
    agentSession: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    agentRequest: { create: jest.Mock };
    agentToolCall: { create: jest.Mock };
    agentOutcome: { create: jest.Mock };
    aiTokenUsage: { create: jest.Mock; findMany: jest.Mock };
    $disconnect: jest.Mock;
  };
}
