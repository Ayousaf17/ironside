// Confidence scoring for AI classifications
// Compares AI-assigned category vs human-assigned category (from behavior logs)

// Category patterns from SW4 triage tool — reused for consistency
const STRONG_SIGNAL_PATTERNS: Record<string, RegExp[]> = {
  spam: [
    /business loan/i, /pre-?approv/i, /bulk\s*(hardware|order)/i,
    /seo|marketing/i, /phish/i, /auto-close/i,
  ],
  track_order: [/order status/i, /where is my order/i, /track/i, /shipping update/i],
  order_verification: [/verif/i, /id.*proof/i],
  report_issue: [/water cooling/i, /leak/i, /wifi/i, /driver/i, /doa/i, /broken/i, /not working/i],
  return_exchange: [/return/i, /exchange/i, /refund/i, /rma/i],
};

export function calculateConfidence(
  subject: string,
  messageText: string,
  category: string
): number {
  const combined = `${subject} ${messageText}`.toLowerCase();
  const patterns = STRONG_SIGNAL_PATTERNS[category];

  if (!patterns) return 0.5; // Unknown category = medium confidence

  let matchCount = 0;
  for (const p of patterns) {
    if (p.test(combined)) matchCount++;
  }

  if (matchCount >= 3) return 0.95;
  if (matchCount >= 2) return 0.85;
  if (matchCount >= 1) return 0.7;
  return 0.4; // No pattern matches but category was assigned
}

export function compareAiVsHuman(
  aiCategory: string | null,
  humanCategory: string | null
): { matches: boolean | null; aiCategory: string | null; humanCategory: string | null } {
  if (!aiCategory || !humanCategory) {
    return { matches: null, aiCategory, humanCategory };
  }
  return {
    matches: aiCategory.toLowerCase() === humanCategory.toLowerCase(),
    aiCategory,
    humanCategory,
  };
}
