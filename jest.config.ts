import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  clearMocks: true,
};

export default config;
