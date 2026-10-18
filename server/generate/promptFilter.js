// First line of defence for what children type, applied on the server
// before any prompt reaches a provider.
//
// This is a word list, not a classifier, so it will miss things and will
// sometimes block innocent prompts. It exists so the obvious cases never
// leave the laptop; the adult in the room and the providers' own
// moderation are the other two layers. Edit BLOCKED_WORDS to suit the
// study, and record the final list in the report.

export const MAX_PROMPT_LENGTH = 200;

// Matched as whole words (and simple plurals), case-insensitive.
const BLOCKED_WORDS = [
  // violence and weapons
  'gun', 'guns', 'rifle', 'pistol', 'shotgun', 'bomb', 'grenade', 'explosive', 'knife', 'knives',
  'kill', 'killing', 'murder', 'blood', 'bloody', 'gore', 'corpse', 'dead body', 'suicide',
  'torture', 'terrorist',
  // sexual content
  'nude', 'naked', 'sex', 'sexy', 'porn', 'boobs', 'breasts', 'genitals', 'penis', 'vagina', 'bikini',
  'lingerie', 'underwear',
  // drugs, alcohol, smoking
  'drug', 'drugs', 'cocaine', 'heroin', 'weed', 'cannabis', 'cigarette', 'vape', 'beer', 'vodka', 'alcohol',
  // hate symbols
  'swastika', 'nazi', 'kkk',
  // swearing (keep short; extend for the study)
  'fuck', 'shit', 'bitch', 'cunt', 'dick'
];

const BLOCKED = new RegExp(
  `\\b(${BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})s?\\b`,
  'i'
);

// Things that look like personal data: emails, phone numbers, web links.
const PERSONAL = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
  /(\+?\d[\s-]?){8,}/, // long digit runs (phone numbers)
  /https?:\/\/|www\./i // links
];

/**
 * @returns {{ ok: true, prompt: string } | { ok: false, reason: string }}
 *   reason is written for a child to read.
 */
export function checkPrompt(raw) {
  const prompt = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!prompt) return { ok: false, reason: 'Type what you want to make first.' };
  if (prompt.length < 2) return { ok: false, reason: 'Tell me a little more about it.' };
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, reason: `That's a long one! Try ${MAX_PROMPT_LENGTH} letters or fewer.` };
  }
  if (BLOCKED.test(prompt)) {
    return { ok: false, reason: "Let's make something else. Try an animal, a vehicle, or a building!" };
  }
  if (PERSONAL.some((re) => re.test(prompt))) {
    return { ok: false, reason: 'Please leave out emails, phone numbers and links.' };
  }
  return { ok: true, prompt };
}