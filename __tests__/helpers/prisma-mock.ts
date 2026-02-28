// Mocks the Prisma client for unit tests that don't need a real DB.
// Usage: import { getPrismaMock } from "../helpers/prisma-mock";

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
