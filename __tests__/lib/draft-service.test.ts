const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardConfig: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import { saveDraft, getDraft, clearDraft } from "@/lib/services/draft.service";

describe("draft.service", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({});
  });

  it("saves a draft for a ticket", async () => {
    mockFindUnique.mockResolvedValue(null);

    await saveDraft(123, "Hello customer");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.key).toBe("reply_drafts");
    expect(call.update.value["123"]).toBe("Hello customer");
  });

  it("skips saving empty drafts", async () => {
    await saveDraft(123, "   ");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("retrieves a saved draft", async () => {
    mockFindUnique.mockResolvedValue({
      value: { "456": "Draft reply text" },
    });

    const draft = await getDraft(456);
    expect(draft).toBe("Draft reply text");
  });

  it("returns null for unknown ticket", async () => {
    mockFindUnique.mockResolvedValue({
      value: { "456": "Some draft" },
    });

    const draft = await getDraft(999);
    expect(draft).toBeNull();
  });

  it("clears a draft for a ticket", async () => {
    mockFindUnique.mockResolvedValue({
      value: { "100": "old draft", "200": "keep this" },
    });

    await clearDraft(100);

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.value).not.toHaveProperty("100");
    expect(call.update.value["200"]).toBe("keep this");
  });

  it("preserves other drafts when saving", async () => {
    mockFindUnique.mockResolvedValue({
      value: { "100": "existing draft" },
    });

    await saveDraft(200, "new draft");

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.value["100"]).toBe("existing draft");
    expect(call.update.value["200"]).toBe("new draft");
  });
});
