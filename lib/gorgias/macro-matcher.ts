/**
 * Text similarity-based macro detection.
 *
 * The Gorgias API doesn't populate the `macros` array on messages,
 * so we detect macro usage by comparing agent response text against
 * known macro templates. A match means the agent used that macro
 * (possibly with minor edits).
 *
 * Uses normalized Jaccard similarity on word n-grams for fast,
 * language-agnostic matching that tolerates personalization edits.
 */

interface MacroTemplate {
  id: number;
  name: string;
  bodyText: string;
  usage: number;
}

interface MacroMatch {
  macroId: number;
  macroName: string;
  similarity: number;
}

// Minimum similarity threshold to consider a match
const MATCH_THRESHOLD = 0.4;

// Normalize text for comparison: lowercase, strip whitespace/punctuation, collapse spaces
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "") // remove URLs (they vary)
    .replace(/{{[^}]+}}/g, "") // remove template variables
    .replace(/[^\w\s]/g, " ") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Extract word n-grams (bigrams) from text
function bigrams(text: string): Set<string> {
  const words = normalize(text).split(" ").filter((w) => w.length > 2);
  const grams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    grams.add(`${words[i]} ${words[i + 1]}`);
  }
  return grams;
}

// Jaccard similarity between two sets
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Pre-computed macro bigrams for fast matching
let macroCache: { template: MacroTemplate; grams: Set<string> }[] = [];

/**
 * Load macro templates for matching. Call once at startup or when macros change.
 */
export function loadMacroTemplates(templates: MacroTemplate[]): void {
  macroCache = templates
    .filter((t) => t.bodyText.length > 20) // skip very short macros
    .map((t) => ({
      template: t,
      grams: bigrams(t.bodyText),
    }));
}

/**
 * Find the best matching macro for a given response text.
 * Returns null if no macro matches above the threshold.
 */
export function matchMacro(responseText: string): MacroMatch | null {
  if (!responseText || responseText.length < 20 || macroCache.length === 0) {
    return null;
  }

  const responseGrams = bigrams(responseText);
  if (responseGrams.size < 3) return null;

  let bestMatch: MacroMatch | null = null;
  let bestSimilarity = 0;

  for (const { template, grams } of macroCache) {
    const similarity = jaccard(responseGrams, grams);
    if (similarity > bestSimilarity && similarity >= MATCH_THRESHOLD) {
      bestSimilarity = similarity;
      bestMatch = {
        macroId: template.id,
        macroName: template.name,
        similarity: Math.round(similarity * 1000) / 1000,
      };
    }
  }

  return bestMatch;
}

/**
 * Batch match: find macros for multiple response texts.
 */
export function matchMacros(
  responses: { id: string; text: string }[]
): Map<string, MacroMatch> {
  const results = new Map<string, MacroMatch>();
  for (const { id, text } of responses) {
    const match = matchMacro(text);
    if (match) results.set(id, match);
  }
  return results;
}
