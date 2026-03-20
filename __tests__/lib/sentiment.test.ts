import { detectSentiment } from "@/lib/langchain/tools/sw4-triage";

describe("detectSentiment", () => {
  it("detects angry sentiment from legal threat language", () => {
    expect(detectSentiment("I will sue you, this is fraud")).toBe("angry");
    expect(detectSentiment("contacting my lawyer about this scam")).toBe("angry");
    expect(detectSentiment("reporting to BBB, worst company ever")).toBe("angry");
  });

  it("detects frustrated sentiment from complaint language", () => {
    expect(detectSentiment("this is ridiculous, I've been waiting forever")).toBe("frustrated");
    expect(detectSentiment("still waiting, no response from anyone")).toBe("frustrated");
    expect(detectSentiment("this is unacceptable and disappointing")).toBe("frustrated");
    expect(detectSentiment("I am so fed up with this terrible service")).toBe("frustrated");
  });

  it("detects happy sentiment from positive language", () => {
    expect(detectSentiment("thank you so much, great job!")).toBe("happy");
    expect(detectSentiment("I love my new PC, it's perfect")).toBe("happy");
    expect(detectSentiment("amazing build, I'd recommend Ironside to anyone")).toBe("happy");
  });

  it("returns neutral for standard inquiries", () => {
    expect(detectSentiment("Where is my order #12345?")).toBe("neutral");
    expect(detectSentiment("Can I upgrade the RAM in my build?")).toBe("neutral");
    expect(detectSentiment("I need to return this item")).toBe("neutral");
  });

  it("prioritizes angry over frustrated", () => {
    // "fraud" is angry, "ridiculous" is frustrated — angry wins
    expect(detectSentiment("this is ridiculous fraud")).toBe("angry");
  });
});
