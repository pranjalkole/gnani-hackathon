import type { DeliveryValidationResponse, ValidationIssue } from './api';
import {
  createDeliveryItem,
  normalizeDeliveryDate,
  normalizeDescription,
  parseNonNegativeQuantity,
  parsePositiveQuantity,
  type DeliveryNoteDetails,
  type DeliveryNoteItem,
  type PurchaseOrderItemRef,
} from './deliveryNote';

export type EditableField =
  | 'poNumber'
  | 'noteNumber'
  | 'supplier'
  | 'deliveryDate'
  | 'site';

export type VoiceTarget =
  | { kind: 'field'; field: EditableField; label: string; reason: string }
  | { kind: 'item'; itemId: string; label: string; reason: string };

export type VoiceChangeKind =
  | 'field'
  | 'item-description'
  | 'item-quantity'
  | 'item-damaged'
  | 'item-received'
  | 'item-add'
  | 'item-remove';

export type VoiceChange = {
  id: string;
  kind: VoiceChangeKind;
  label: string;
  from?: string;
  to?: string;
  itemId?: string;
  confidence: 'exact' | 'fuzzy';
  field?: EditableField;
  received?: boolean;
  damagedQuantity?: string;
  newItem?: { description: string; quantity: string };
};

export type VoiceParseResult = {
  changes: VoiceChange[];
  warnings: string[];
};

const FIELD_LABELS: Record<EditableField, string> = {
  poNumber: 'PO number',
  noteNumber: 'Note number',
  supplier: 'Supplier',
  deliveryDate: 'Delivery date',
  site: 'Site / location',
};

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_NUMBERS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

const ORDINAL_NUMBERS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty first': 21,
  'twenty second': 22,
  'twenty third': 23,
  'twenty fourth': 24,
  'twenty fifth': 25,
  'twenty sixth': 26,
  'twenty seventh': 27,
  'twenty eighth': 28,
  'twenty ninth': 29,
  thirtieth: 30,
  'thirty first': 31,
};

const NUMBER_WORD_PATTERN = [
  ...Object.keys(SMALL_NUMBERS),
  ...Object.keys(SCALE_NUMBERS),
  'and',
].join('|');

const NUMBER_WORD_SEQUENCE = new RegExp(
  `\\b(?:${NUMBER_WORD_PATTERN})(?:[\\s-]+(?:${NUMBER_WORD_PATTERN}))*\\b`,
  'gi'
);

const RECEIVED_WORD = /\b(?:received|arrived|delivered)\b/i;
const NEGATIVE_RECEIVED =
  /\b(?:not\s+received|not\s+delivered|didn'?t\s+receive|did\s+not\s+receive|hasn'?t\s+arrived|has\s+not\s+arrived)\b/i;
const DAMAGED_WORD_GLOBAL =
  /\b(?:damaged|damage|broken|crushed|spoiled|spoilt|unusable)\b/gi;

type CommandType =
  | 'supplier'
  | 'site'
  | 'po'
  | 'note'
  | 'date'
  | 'description'
  | 'quantity'
  | 'received'
  | 'damaged'
  | 'add'
  | 'remove';

type ParsedCommand = {
  type: CommandType;
  start: number;
  end: number;
  text: string;
  negative?: boolean;
};

const COMMAND_PATTERNS: { type: CommandType; pattern: RegExp }[] = [
  {
    type: 'note',
    pattern:
      /\b(?:delivery\s+note|delivery\s+no|note|d\.?\s*n\.?|dn)\s*(?:number|no|#)?\s*(?:is|should\s+be|will\s+be|:|=)?\s*/gi,
  },
  {
    type: 'po',
    pattern:
      /\b(?:purchase\s+order|p\.?\s*o\.?|po)\s*(?:number|no|#)?\s*(?:is|should\s+be|will\s+be|:|=)?\s*/gi,
  },
  {
    type: 'date',
    pattern:
      /\b(?:delivery\s+date|date\s+of\s+delivery|dated|delivered\s+on|date)\s*(?:is|was|should\s+be|:|=)?\s*/gi,
  },
  {
    type: 'description',
    pattern:
      /\b(?:item\s+description|description|desc)\s*(?:is|should\s+be|:|=)?\s*/gi,
  },
  {
    type: 'supplier',
    pattern:
      /\b(?:supplier|vendor|seller)(?:\s+name)?\s*(?:is|should\s+be|:|=)?\s*/gi,
  },
  {
    type: 'site',
    pattern:
      /\b(?:delivery\s+site|delivery\s+address|site|location|project|deliver\s+to|ship\s+to)\s*(?:is|should\s+be|:|=)?\s*/gi,
  },
  {
    type: 'quantity',
    pattern: /\b(?:quantity|qty|qnt|count)\s*(?:is|of|:|=)?\s*/gi,
  },
  {
    type: 'received',
    pattern:
      /\b(?:not\s+received|not\s+delivered|didn'?t\s+receive|did\s+not\s+receive|hasn'?t\s+arrived|has\s+not\s+arrived|received|arrived|delivered)\b/gi,
  },
  {
    type: 'damaged',
    pattern: DAMAGED_WORD_GLOBAL,
  },
  {
    type: 'add',
    pattern: /\b(?:add|include|append)\b/gi,
  },
  {
    type: 'remove',
    pattern: /\b(?:remove|delete|drop)\b/gi,
  },
];

const FIELD_COMMANDS: CommandType[] = [
  'supplier',
  'site',
  'po',
  'note',
  'date',
];

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanValue(value: string) {
  return collapseWhitespace(
    value
      .replace(/[“”"'`]/g, '')
      .replace(/^[\s,;:.-]+/, '')
      .replace(/[\s,;:.!?]+$/, '')
  );
}

function cleanTextValue(value: string): string | null {
  const cleaned = cleanValue(
    value
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/^(?:is|are|was|were|named|called)\s+/i, '')
      .replace(/\s*,?\s*(?:and|then|also)$/i, '')
      .replace(/\s+(?:please|thanks|thank\s+you)$/i, '')
  );

  if (cleaned.length < 2 || !/[a-z]/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function normalizeReferenceNumber(value: string, prefix: 'PO' | 'DN') {
  let text = cleanValue(value);

  if (prefix === 'PO') {
    text = text.replace(
      /^(?:the\s+)?(?:purchase\s+order|p\.?\s*o\.?|po|order)\s*(?:number|no|#)?\s*(?:is|should\s+be|will\s+be|:|=)?\s*/i,
      ''
    );
  } else {
    text = text.replace(
      /^(?:the\s+)?(?:delivery\s+note|delivery\s+no|note|d\.?\s*n\.?|dn)\s*(?:number|no|#)?\s*(?:is|should\s+be|will\s+be|:|=)?\s*/i,
      ''
    );
  }

  text = text
    .replace(/^(?:number|no|#|is|should\s+be)\s*/i, '')
    .trim();

  const token =
    text.match(/[A-Za-z0-9][A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*/)?.[0] ??
    text.match(/\d+/)?.[0];

  if (!token) {
    return null;
  }

  let normalized = token
    .replace(/[.,;:]+$/, '')
    .replace(/\s+/g, '-')
    .toUpperCase();

  normalized = normalized.replace(/^(?:PO|DN)[\s./#_-]*/i, (match) =>
    match.startsWith('D') ? 'DN-' : 'PO-'
  );

  if (!/^[A-Za-z]/.test(normalized)) {
    normalized = `${prefix}-${normalized}`;
  }

  if (!normalized || normalized === `${prefix}-`) {
    return null;
  }

  return normalized;
}

const YEAR_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const YEAR_ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

function replaceOrdinalWords(value: string) {
  let result = value;

  for (const [word, number] of Object.entries(ORDINAL_NUMBERS).sort(
    ([a], [b]) => b.length - a.length
  )) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), String(number));
  }

  return result;
}

/**
 * Speech-to-text usually returns years as digits, but spoken forms such as
 * "twenty twenty six" or "nineteen ninety nine" still appear.
 */
function replaceSpokenYear(value: string) {
  return value
    .replace(
      /\btwo\s+thousand(?:\s+and)?(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?|\s+(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (
        _match,
        tens?: string,
        onesAfterTens?: string,
        ones?: string
      ) => {
        const trailing = onesAfterTens ?? ones;

        return String(
          2000 +
            (tens ? YEAR_TENS[tens.toLowerCase()] ?? 0 : 0) +
            (trailing ? YEAR_ONES[trailing.toLowerCase()] ?? 0 : 0)
        );
      }
    )
    .replace(
      /\b(twenty|nineteen)\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (_match, century: string, tens: string, ones?: string) => {
        const base = century.toLowerCase() === 'twenty' ? 2000 : 1900;
        const year =
          base +
          (YEAR_TENS[tens.toLowerCase()] ?? 0) +
          (ones ? YEAR_ONES[ones.toLowerCase()] ?? 0 : 0);

        return String(year);
      }
    )
    .replace(
      /\b(twenty|nineteen)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
      (_match, century: string, ones: string) =>
        String(
          (century.toLowerCase() === 'twenty' ? 2000 : 1900) +
            (YEAR_ONES[ones.toLowerCase()] ?? 0)
        )
    );
}

function normalizeDateTranscript(value: string) {
  let text = cleanValue(value)
    .replace(
      /^(?:the\s+)?(?:delivery\s+date|date\s+of\s+delivery|dated|delivered\s+on|date)\s*(?:is|was|should\s+be|:|=)?\s*/i,
      ''
    )
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1');

  text = replaceOrdinalWords(text)
    .replace(/\bof\b/gi, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizeDeliveryDate(
    replaceSpokenYear(text).replace(/^(?:the|on)\s+/i, '')
  );
}

function parseWordNumberPhrase(value: string): number | null {
  const words = value.toLowerCase().split(/[\s-]+/).filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  let total = 0;
  let current = 0;
  let found = false;

  for (const word of words) {
    if (word === 'and') {
      continue;
    }

    const small = SMALL_NUMBERS[word];
    if (small !== undefined) {
      current += small;
      found = true;
      continue;
    }

    const scale = SCALE_NUMBERS[word];
    if (scale !== undefined) {
      current = (current || 1) * scale;
      found = true;
    }
  }

  total += current;

  return found ? total : null;
}

function parseDigitQuantity(value: string) {
  const match = value.match(/\d{1,9}(?:\.\d{1,3})?/);

  if (!match) {
    return null;
  }

  const quantity = parsePositiveQuantity(match[0]);

  if (quantity === null) {
    return null;
  }

  return {
    value: String(quantity),
    raw: match[0],
    index: match.index ?? 0,
  };
}

function parseWordQuantity(value: string) {
  const matches = Array.from(value.matchAll(NUMBER_WORD_SEQUENCE));

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const parsed = parseWordNumberPhrase(match[0]);

    if (
      parsed !== null &&
      parsed > 0 &&
      parsed < 1_000_000_000 &&
      !/^and$/i.test(match[0].trim())
    ) {
      return {
        value: String(parsed),
        raw: match[0],
        index: match.index ?? 0,
      };
    }
  }

  return null;
}

function parseQuantityToken(value: string) {
  return parseDigitQuantity(value) ?? parseWordQuantity(value);
}

type QuantityToken = {
  value: string;
  raw: string;
  index: number;
  end: number;
};

/**
 * Finds every spoken or numeric quantity in a transcript, in order. Both
 * parsers are used because a clause can mix digits and words, for example
 * “48 delivered, two damaged”.
 */
function findQuantityTokens(value: string): QuantityToken[] {
  const tokens: QuantityToken[] = [];

  for (const match of value.matchAll(/\d{1,9}(?:\.\d{1,3})?/g)) {
    const quantity = parsePositiveQuantity(match[0]);

    if (quantity === null) {
      continue;
    }

    const index = match.index ?? 0;
    tokens.push({
      value: String(quantity),
      raw: match[0],
      index,
      end: index + match[0].length,
    });
  }

  for (const match of value.matchAll(NUMBER_WORD_SEQUENCE)) {
    const phrase = match[0].trim();

    if (/^and$/i.test(phrase)) {
      continue;
    }

    const parsed = parseWordNumberPhrase(phrase);

    if (parsed === null || parsed <= 0 || parsed >= 1_000_000_000) {
      continue;
    }

    const index = match.index ?? 0;
    tokens.push({
      value: String(parsed),
      raw: match[0],
      index,
      end: index + match[0].length,
    });
  }

  return tokens
    .filter(
      (token, position, list) =>
        !list.some(
          (other, otherPosition) =>
            otherPosition < position &&
            other.index < token.end &&
            token.index < other.end
        )
    )
    .sort((a, b) => a.index - b.index);
}

function quantityDistance(
  token: QuantityToken,
  keywordStart: number,
  keywordEnd: number
) {
  if (token.end <= keywordStart) {
    return keywordStart - token.end;
  }

  if (token.index >= keywordEnd) {
    return token.index - keywordEnd;
  }

  return 0;
}

/** Nearest quantity to a keyword, preferring the number after it on a tie. */
function nearestQuantity(
  tokens: QuantityToken[],
  keywordStart: number,
  keywordEnd: number,
  excluded?: Set<number>
) {
  let best: QuantityToken | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIsAfter = false;

  for (const token of tokens) {
    if (excluded?.has(token.index)) {
      continue;
    }

    const isAfter = token.index >= keywordEnd;
    const distance = quantityDistance(token, keywordStart, keywordEnd);

    if (
      distance < bestDistance ||
      (distance === bestDistance && isAfter && !bestIsAfter)
    ) {
      best = token;
      bestDistance = distance;
      bestIsAfter = isAfter;
    }
  }

  return best;
}

type DamageClaim = {
  keywordStart: number;
  token: QuantityToken | null;
};

function firstQuantityAfterKeyword(
  value: string,
  tokens: QuantityToken[],
  keywordEnd: number,
  excluded?: Set<number>
) {
  const token = tokens.find(
    (current) => current.index >= keywordEnd && !excluded?.has(current.index)
  );

  if (!token) {
    return null;
  }

  const gap = value.slice(keywordEnd, token.index);

  if (RECEIVED_WORD.test(gap)) {
    return null;
  }

  // Only cross filler words such as “quantity is” before accepting a number
  // that appears after the keyword.
  if (
    !/^[\s,;:]*(?:(?:quantity|qty|qnt|count|is|of|the|a|an|units?|unit|pcs?|pieces?)\s*[,;:]?\s*)*$/i.test(
      gap
    )
  ) {
    return null;
  }

  return token;
}

function adjacentQuantityBefore(
  value: string,
  tokens: QuantityToken[],
  keywordStart: number,
  excluded?: Set<number>
) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];

    if (token.end > keywordStart || excluded?.has(token.index)) {
      continue;
    }

    const gap = value.slice(token.end, keywordStart);

    return /^[\s,;:]*(?:and\s*)?$/i.test(gap) ? token : null;
  }

  return null;
}

function followedByReceivedWord(
  value: string,
  tokens: QuantityToken[],
  token: QuantityToken
) {
  const next = tokens.find((current) => current.index >= token.end);
  const end = next ? next.index : value.length;

  return RECEIVED_WORD.test(value.slice(token.end, end));
}

/**
 * The number that belongs to “damaged” is the one closest to the keyword, not
 * the first number in the sentence. This is what lets “48 delivered, 2
 * damaged” keep 48 as the delivered quantity.
 */
function collectDamageQuantities(value: string, tokens: QuantityToken[]) {
  const claims: DamageClaim[] = [];
  const claimedIndexes = new Set<number>();

  for (const match of value.matchAll(DAMAGED_WORD_GLOBAL)) {
    const keywordStart = match.index ?? 0;
    const keywordEnd = keywordStart + match[0].length;
    const after = firstQuantityAfterKeyword(
      value,
      tokens,
      keywordEnd,
      claimedIndexes
    );
    const before = adjacentQuantityBefore(
      value,
      tokens,
      keywordStart,
      claimedIndexes
    );
    const afterLooksDelivered =
      after !== null && followedByReceivedWord(value, tokens, after);
    const token =
      after && !(afterLooksDelivered && before)
        ? after
        : before ??
          nearestQuantity(tokens, keywordStart, keywordEnd, claimedIndexes);

    if (token) {
      claimedIndexes.add(token.index);
    }

    claims.push({ keywordStart, token });
  }

  return { claims, claimedIndexes };
}

function firstQuantityInRange(
  tokens: QuantityToken[],
  start: number,
  end: number,
  excluded?: Set<number>
) {
  return (
    tokens.find(
      (token) =>
        token.index >= start && token.end <= end && !excluded?.has(token.index)
    ) ?? null
  );
}

function lastQuantityInRange(
  tokens: QuantityToken[],
  start: number,
  end: number,
  excluded?: Set<number>
) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];

    if (
      token.index >= start &&
      token.end <= end &&
      !excluded?.has(token.index)
    ) {
      return token;
    }
  }

  return null;
}

function removeRanges(value: string, ranges: { start: number; end: number }[]) {
  const merged: { start: number; end: number }[] = [];

  for (const range of [...ranges]
    .filter((current) => current.end > current.start)
    .sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  let next = value;

  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const range = merged[index];
    next = `${next.slice(0, range.start)} ${next.slice(range.end)}`;
  }

  return next;
}

function stripQuantityKeyword(value: string) {
  return value.replace(/\b(?:quantity|qty|qnt|count)\b/gi, ' ');
}

function cleanItemDescription(value: string) {
  let text = value
    .replace(NEGATIVE_RECEIVED, ' ')
    .replace(RECEIVED_WORD, ' ')
    .replace(DAMAGED_WORD_GLOBAL, ' ')
    .replace(/\b(?:item\s+description|description|desc)\b/gi, ' ')
    .replace(/\b(?:quantity|qty|qnt|count)\b/gi, ' ')
    .replace(/[.,;:!?()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = text
    .replace(/^(?:and|then|also|please|item|items|new|some|the|a|an)\s+/i, '')
    .replace(/^(?:is|are|was|were)\s+/i, '')
    .replace(/\s+(?:and|then|also|for|of|with|is|are|was|were)$/i, '')
    .trim();

  return text;
}

function extractQuantityAndDescription(value: string) {
  const text = cleanValue(value);
  const keywordMatches = Array.from(text.matchAll(/\b(?:quantity|qty|qnt|count)\b/gi));
  let quantity: { value: string; raw: string; index: number } | null = null;
  let removeStart = -1;
  let removeEnd = -1;

  for (const keyword of keywordMatches) {
    const afterKeyword = text.slice((keyword.index ?? 0) + keyword[0].length);
    const parsed = parseQuantityToken(afterKeyword);

    if (parsed) {
      quantity = {
        value: parsed.value,
        raw: parsed.raw,
        index: (keyword.index ?? 0) + parsed.index,
      };
      removeStart = keyword.index ?? 0;
      removeEnd = (keyword.index ?? 0) + keyword[0].length + parsed.index + parsed.raw.length;
      break;
    }
  }

  if (!quantity) {
    quantity = parseQuantityToken(text);

    if (quantity) {
      removeStart = quantity.index;
      removeEnd = quantity.index + quantity.raw.length;
    }
  }

  let description = text;

  if (removeStart >= 0 && removeEnd > removeStart) {
    description = `${text.slice(0, removeStart)} ${text.slice(removeEnd)}`;
  }

  description = cleanItemDescription(stripQuantityKeyword(description));

  return {
    quantity: quantity?.value,
    description,
  };
}

function splitClauses(value: string) {
  return value
    .replace(/\r?\n/g, '. ')
    .split(/[.!?;]+\s*/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function collectCommands(value: string) {
  const commands: ParsedCommand[] = [];

  for (const { type, pattern } of COMMAND_PATTERNS) {
    for (const match of value.matchAll(pattern)) {
      const start = match.index ?? 0;
      commands.push({
        type,
        start,
        end: start + match[0].length,
        text: match[0],
        negative: type === 'received' ? NEGATIVE_RECEIVED.test(match[0]) : undefined,
      });
    }
  }

  commands.sort((a, b) => a.start - b.start || b.end - a.end);

  const selected: ParsedCommand[] = [];

  for (const command of commands) {
    const overlaps = selected.some(
      (current) => command.start < current.end && current.start < command.end
    );

    if (!overlaps) {
      selected.push(command);
    }
  }

  return selected.sort((a, b) => a.start - b.start);
}

function cleanItemPhrase(value: string) {
  let text = cleanValue(value);
  const comma = text.lastIndexOf(',');

  if (comma >= 0) {
    const afterComma = text.slice(comma + 1).trim();
    text = afterComma || text.slice(0, comma).trim();
  }

  text = text
    .replace(/^(?:and|then|also|for|of|with|the)\s+/i, '')
    .replace(/\s+(?:is|are|was|were|and|then|also|for|of|with)$/i, '')
    .trim();

  return cleanItemDescription(text);
}

function tokenizeDescription(value: string) {
  return normalizeDescription(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => (token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token))
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\d+(?:\.\d+)?$/.test(token) &&
        ![
          'the',
          'a',
          'an',
          'and',
          'of',
          'for',
          'with',
          'item',
          'items',
          'new',
          'some',
          'description',
          'desc',
          'received',
          'receive',
          'damaged',
          'damage',
          'broken',
          'crushed',
          'spoiled',
          'spoilt',
          'unusable',
          'not',
          'is',
          'are',
          'was',
          'were',
          'quantity',
          'qty',
          'qnt',
          'count',
          'units',
          'unit',
          'pieces',
          'piece',
          'pcs',
        ].includes(token)
    );
}

const UNIT_TOKENS = new Set([
  'bag',
  'box',
  'pack',
  'roll',
  'sheet',
  'pair',
  'set',
  'carton',
  'tin',
  'bottle',
  'drum',
  'pallet',
  'kg',
  'kgs',
  'g',
  'gram',
  'liter',
  'litre',
  'ltr',
  'ml',
  'm',
  'cm',
  'mm',
  'meter',
  'metre',
]);

/**
 * True when a dictated description adds a word that is not already in the
 * item description. Prevents “cement bags 50 kg” or a leftover damage number
 * from being proposed as a brand new description.
 */
function addsNewDescriptionWord(value: string, current: string) {
  const currentTokens = new Set(tokenizeDescription(current));

  return tokenizeDescription(value).some(
    (token) => !UNIT_TOKENS.has(token) && !currentTokens.has(token)
  );
}

function tokenMatches(left: string, right: string) {
  if (left === right) {
    return true;
  }

  return (
    left.length >= 4 &&
    right.length >= 4 &&
    (left.startsWith(right) || right.startsWith(left))
  );
}

function scoreDescription(queryTokens: string[], candidateTokens: string[]) {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  let matched = 0;

  for (const queryToken of queryTokens) {
    if (candidateTokens.some((candidate) => tokenMatches(queryToken, candidate))) {
      matched += 1;
    }
  }

  return matched / queryTokens.length;
}

type ItemMatch = {
  item: DeliveryNoteItem;
  confidence: 'exact' | 'fuzzy';
  suggestedDescription?: string;
};

function findItemMatch(
  phrase: string,
  items: DeliveryNoteItem[],
  orderItems: PurchaseOrderItemRef[]
): ItemMatch | null {
  const queryTokens = tokenizeDescription(phrase);

  if (queryTokens.length === 0) {
    return null;
  }

  const candidates = new Map<
    string,
    {
      item: DeliveryNoteItem;
      score: number;
      exact: boolean;
      suggestedDescription?: string;
    }
  >();

  const consider = (
    item: DeliveryNoteItem,
    score: number,
    exact: boolean,
    suggestedDescription?: string
  ) => {
    const current = candidates.get(item.id);

    if (!current || score > current.score || (score === current.score && exact)) {
      candidates.set(item.id, { item, score, exact, suggestedDescription });
    }
  };

  for (const item of items) {
    const description = item.description.trim();

    if (!description) {
      continue;
    }

    const descriptionTokens = tokenizeDescription(description);
    const score = scoreDescription(queryTokens, descriptionTokens);
    const exact = normalizeDescription(description) === normalizeDescription(phrase);

    if (score > 0) {
      consider(item, score, exact);
    }
  }

  for (const orderItem of orderItems) {
    const description = orderItem.description.trim();

    if (!description) {
      continue;
    }

    const orderTokens = tokenizeDescription(description);
    const orderScore = scoreDescription(queryTokens, orderTokens);

    if (orderScore < 0.5) {
      continue;
    }

    let bestDraft: { item: DeliveryNoteItem; score: number } | null = null;

    for (const item of items) {
      const itemTokens = tokenizeDescription(item.description);
      const score = scoreDescription(orderTokens, itemTokens);

      if (score < 0.5) {
        continue;
      }

      if (!bestDraft || score > bestDraft.score) {
        bestDraft = { item, score };
      }
    }

    if (bestDraft) {
      consider(
        bestDraft.item,
        Math.max(orderScore, bestDraft.score),
        normalizeDescription(bestDraft.item.description) === normalizeDescription(phrase),
        bestDraft.item.description.trim() ? undefined : description
      );
    }
  }

  const ranked = Array.from(candidates.values()).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return Number(b.exact) - Number(a.exact);
  });

  const best = ranked[0];

  if (!best || best.score < 0.5) {
    return null;
  }

  const second = ranked[1];

  if (second) {
    if (best.score === second.score) {
      if (!best.exact || second.exact) {
        return null;
      }
    } else if (best.score < 0.9 && best.score - second.score < 0.15) {
      return null;
    }
  }

  return {
    item: best.item,
    confidence: best.exact ? 'exact' : 'fuzzy',
    suggestedDescription: best.suggestedDescription,
  };
}

function itemLabel(item: DeliveryNoteItem) {
  return item.description.trim() || 'Item';
}

function addItemDescriptionChange(
  changes: Map<string, VoiceChange>,
  match: ItemMatch,
  value: string,
  index: number
) {
  const cleaned = cleanItemDescription(value);

  if (!cleaned || !/[a-z]/i.test(cleaned)) {
    return;
  }

  if (normalizeDescription(cleaned) === normalizeDescription(match.item.description)) {
    return;
  }

  if (!addsNewDescriptionWord(cleaned, match.item.description)) {
    return;
  }

  const change: VoiceChange = {
    id: `voice-change-${index}`,
    kind: 'item-description',
    label: `${itemLabel(match.item)} description`,
    from: match.item.description || undefined,
    to: cleaned,
    itemId: match.item.id,
    confidence: match.confidence,
  };

  changes.set(`item-description:${match.item.id}`, change);
}

function addItemQuantityChange(
  changes: Map<string, VoiceChange>,
  match: ItemMatch,
  value: string,
  index: number
) {
  const quantity = parsePositiveQuantity(value);

  if (quantity === null) {
    return;
  }

  const normalized = String(quantity);

  if (normalized === match.item.quantity) {
    return;
  }

  changes.set(`item-quantity:${match.item.id}`, {
    id: `voice-change-${index}`,
    kind: 'item-quantity',
    label: `${itemLabel(match.item)} quantity`,
    from: match.item.quantity || '0',
    to: normalized,
    itemId: match.item.id,
    confidence: match.confidence,
  });
}

function addItemDamagedChange(
  changes: Map<string, VoiceChange>,
  match: ItemMatch,
  value: string,
  index: number
) {
  const damagedQuantity = parseNonNegativeQuantity(value);

  if (damagedQuantity === null) {
    return;
  }

  const normalized = String(damagedQuantity);

  if (normalized === match.item.damagedQuantity) {
    return;
  }

  changes.set(`item-damaged:${match.item.id}`, {
    id: `voice-change-${index}`,
    kind: 'item-damaged',
    label: `${itemLabel(match.item)} damaged`,
    from: match.item.damagedQuantity || '0',
    to: normalized,
    itemId: match.item.id,
    confidence: match.confidence,
    damagedQuantity: normalized,
  });
}

function addItemReceivedChange(
  changes: Map<string, VoiceChange>,
  match: ItemMatch,
  received: boolean,
  index: number
) {
  if (match.item.received === received) {
    return;
  }

  changes.set(`item-received:${match.item.id}`, {
    id: `voice-change-${index}`,
    kind: 'item-received',
    label: `${itemLabel(match.item)} received`,
    from: match.item.received ? 'Received' : 'Not received',
    to: received ? 'Received' : 'Not received',
    itemId: match.item.id,
    confidence: match.confidence,
    received,
  });
}

function addFieldChange(
  changes: Map<string, VoiceChange>,
  field: EditableField,
  value: string | null,
  draft: DeliveryNoteDetails,
  warnings: string[],
  index: number
) {
  if (!value) {
    warnings.push(
      field === 'deliveryDate'
        ? "I couldn't read the delivery date. Try saying it like “6 November 2026”."
        : `I couldn't read the ${FIELD_LABELS[field].toLowerCase()}.`
    );
    return;
  }

  const current = draft[field];

  if (current.trim() === value) {
    return;
  }

  changes.set(`field:${field}`, {
    id: `voice-change-${index}`,
    kind: 'field',
    label: FIELD_LABELS[field],
    from: current || undefined,
    to: value,
    field,
    confidence: 'exact',
  });
}

function nextCommandStart(
  commands: ParsedCommand[],
  currentIndex: number,
  valueEnd: number
) {
  for (let index = currentIndex + 1; index < commands.length; index += 1) {
    if (commands[index].start < valueEnd) {
      return commands[index].start;
    }
  }

  return valueEnd;
}

function nextItemBlockingCommandStart(
  commands: ParsedCommand[],
  currentIndex: number,
  valueEnd: number
) {
  for (let index = currentIndex + 1; index < commands.length; index += 1) {
    const command = commands[index];

    if (command.start >= valueEnd) {
      break;
    }

    if (
      FIELD_COMMANDS.includes(command.type) ||
      command.type === 'add' ||
      command.type === 'remove'
    ) {
      return command.start;
    }
  }

  return valueEnd;
}

export function normalizeScopedFieldValue(
  field: EditableField,
  transcript: string
): string | null {
  switch (field) {
    case 'poNumber':
      return normalizeReferenceNumber(transcript, 'PO');
    case 'noteNumber':
      return normalizeReferenceNumber(transcript, 'DN');
    case 'deliveryDate':
      return normalizeDateTranscript(transcript);
    case 'supplier':
      return cleanTextValue(
        cleanValue(transcript).replace(
          /^(?:the\s+)?(?:supplier|vendor|seller)(?:\s+name)?\s*(?:is|should\s+be|:|=)?\s*/i,
          ''
        )
      );
    case 'site':
      return cleanTextValue(
        cleanValue(transcript).replace(
          /^(?:the\s+)?(?:delivery\s+site|delivery\s+address|site|location|project|deliver\s+to|ship\s+to)\s*(?:is|should\s+be|:|=)?\s*/i,
          ''
        )
      );
    default:
      return null;
  }
}

export function parseScopedItemChanges(
  transcript: string,
  item: DeliveryNoteItem
): VoiceChange[] {
  const changes = new Map<string, VoiceChange>();
  const text = cleanValue(transcript);

  if (!text) {
    return [];
  }

  const negative = NEGATIVE_RECEIVED.test(text);
  const hasReceivedWord = negative || RECEIVED_WORD.test(text);
  const received = !negative;
  const match: ItemMatch = { item, confidence: 'exact' };
  const commands = collectCommands(text);
  const quantityTokens = findQuantityTokens(text);
  const { claims } = collectDamageQuantities(text, quantityTokens);
  const damageToken = claims.find((claim) => claim.token)?.token ?? null;
  const damageTokenIndexes = new Set(
    claims
      .map((claim) => claim.token?.index)
      .filter((index): index is number => index !== undefined)
  );

  const descriptionCommandIndex = commands.findIndex(
    (command) => command.type === 'description'
  );
  const descriptionCommand =
    descriptionCommandIndex >= 0 ? commands[descriptionCommandIndex] : null;
  const descriptionEnd = descriptionCommand
    ? nextCommandStart(commands, descriptionCommandIndex, text.length)
    : -1;
  const descriptionRange = descriptionCommand
    ? { start: descriptionCommand.end, end: descriptionEnd }
    : null;

  const hintCommand =
    commands.find((command) => command.type === 'received') ??
    commands.find((command) => command.type === 'quantity') ??
    null;

  const availableTokens = quantityTokens.filter(
    (token) =>
      !damageTokenIndexes.has(token.index) &&
      !(
        descriptionRange &&
        token.index >= descriptionRange.start &&
        token.end <= descriptionRange.end
      )
  );
  const deliveredToken = hintCommand
    ? nearestQuantity(availableTokens, hintCommand.start, hintCommand.end)
    : availableTokens[0] ?? null;

  let description: string;

  if (descriptionRange) {
    description = cleanItemDescription(
      text.slice(descriptionRange.start, descriptionRange.end)
    );
  } else {
    const removedRanges = quantityTokens
      .filter(
        (token) =>
          damageTokenIndexes.has(token.index) ||
          (deliveredToken && token.index === deliveredToken.index)
      )
      .map((token) => ({ start: token.index, end: token.end }));

    description = cleanItemDescription(removeRanges(text, removedRanges));
  }

  let nextId = 1;

  if (description && /[a-z]/i.test(description)) {
    addItemDescriptionChange(changes, match, description, nextId);
    nextId += 1;
  }

  if (deliveredToken) {
    addItemQuantityChange(changes, match, deliveredToken.value, nextId);
    nextId += 1;
  }

  if (damageToken) {
    addItemDamagedChange(changes, match, damageToken.value, nextId);
    nextId += 1;
  }

  if (hasReceivedWord) {
    addItemReceivedChange(changes, match, received, nextId);
  }

  return Array.from(changes.values());
}

type ParseContext = {
  lastMatchedItem: DeliveryNoteItem | null;
};

function parseSegment(
  segment: string,
  draft: DeliveryNoteDetails,
  orderItems: PurchaseOrderItemRef[],
  changes: Map<string, VoiceChange>,
  warnings: string[],
  context: ParseContext
) {
  const commands = collectCommands(segment);

  if (commands.length === 0) {
    return;
  }

  const quantityTokens = findQuantityTokens(segment);
  const { claims: damageClaims, claimedIndexes: damageTokenIndexes } =
    collectDamageQuantities(segment, quantityTokens);

  let previousCommandEnd = 0;
  let pendingItemPhrase = '';
  let changeIndex = changes.size + 1;
  let lastMatchedItem = context.lastMatchedItem;

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const nextStart = nextCommandStart(commands, index, segment.length);
    let value = segment.slice(command.end, nextStart).trim();

    if (command.type === 'add' || command.type === 'remove') {
      const blockEnd = nextItemBlockingCommandStart(commands, index, segment.length);
      const blockValue = segment.slice(command.end, blockEnd).trim();

      if (command.type === 'add') {
        const parsed = extractQuantityAndDescription(blockValue);
        const description = parsed.description;

        if (!description) {
          warnings.push(
            'Tell me what to add, for example “add paint buckets quantity 6”.'
          );
        } else {
          const existing = draft.items.find(
            (item) =>
              normalizeDescription(item.description) === normalizeDescription(description)
          );

          if (existing) {
            if (parsed.quantity) {
              addItemQuantityChange(
                changes,
                { item: existing, confidence: 'exact' },
                parsed.quantity,
                changeIndex
              );
              changeIndex += 1;
            } else {
              warnings.push(`“${description}” is already on this note.`);
            }
          } else {
            const quantity = parsed.quantity ?? '1';
            changes.set(`item-add:${normalizeDescription(description)}`, {
              id: `voice-change-${changeIndex}`,
              kind: 'item-add',
              label: `Add ${description}`,
              to: `Qty ${quantity}`,
              newItem: { description, quantity },
              confidence: 'exact',
            });
            changeIndex += 1;
          }
        }
      } else {
        const phrase = cleanItemPhrase(blockValue);
        const match = findItemMatch(phrase, draft.items, orderItems);

        if (!match) {
          warnings.push(
            phrase
              ? `I couldn't tell which item you meant by “${phrase}”.`
              : 'Tell me which item to remove.'
          );
        } else if (draft.items.length <= 1) {
          warnings.push('Keep at least one item on the delivery note.');
        } else {
          changes.set(`item-remove:${match.item.id}`, {
            id: `voice-change-${changeIndex}`,
            kind: 'item-remove',
            label: `Remove ${itemLabel(match.item)}`,
            from: match.item.description || itemLabel(match.item),
            to: 'Removed',
            itemId: match.item.id,
            confidence: match.confidence,
          });
          changeIndex += 1;
        }
      }

      let skipUntil = index + 1;

      while (
        skipUntil < commands.length &&
        commands[skipUntil].start < blockEnd
      ) {
        skipUntil += 1;
      }

      index = skipUntil - 1;
      previousCommandEnd = blockEnd;
      pendingItemPhrase = '';
      continue;
    }

    if (FIELD_COMMANDS.includes(command.type)) {
      const nextCommand = commands[index + 1];
      const nextIsItemCommand =
        nextCommand &&
        nextCommand.start < segment.length &&
        (nextCommand.type === 'quantity' || nextCommand.type === 'received');
      let hint = '';

      if (nextIsItemCommand && value.includes(',')) {
        const comma = value.lastIndexOf(',');
        hint = value.slice(comma + 1).trim();
        value = value.slice(0, comma).trim();
      }

      if (command.type === 'supplier') {
        addFieldChange(
          changes,
          'supplier',
          cleanTextValue(value),
          draft,
          warnings,
          changeIndex
        );
        changeIndex += 1;
      } else if (command.type === 'site') {
        addFieldChange(
          changes,
          'site',
          cleanTextValue(value),
          draft,
          warnings,
          changeIndex
        );
        changeIndex += 1;
      } else if (command.type === 'po') {
        addFieldChange(
          changes,
          'poNumber',
          normalizeReferenceNumber(value, 'PO'),
          draft,
          warnings,
          changeIndex
        );
        changeIndex += 1;
      } else if (command.type === 'note') {
        addFieldChange(
          changes,
          'noteNumber',
          normalizeReferenceNumber(value, 'DN'),
          draft,
          warnings,
          changeIndex
        );
        changeIndex += 1;
      } else if (command.type === 'date') {
        addFieldChange(
          changes,
          'deliveryDate',
          normalizeDateTranscript(value),
          draft,
          warnings,
          changeIndex
        );
        changeIndex += 1;
      }

      pendingItemPhrase = hint;
      previousCommandEnd = command.end;
      continue;
    }

    if (command.type === 'description') {
      const preceding = segment.slice(previousCommandEnd, command.start);
      const phrase = cleanItemPhrase(pendingItemPhrase || preceding);
      const cleaned = cleanItemDescription(value);
      const match: ItemMatch | null =
        findItemMatch(phrase, draft.items, orderItems) ??
        (lastMatchedItem
          ? { item: lastMatchedItem, confidence: 'fuzzy' }
          : null);

      if (!cleaned || !/[a-z]/i.test(cleaned)) {
        warnings.push(
          'Tell me the new description, for example “description steel rebar”.'
        );
      } else if (!match) {
        warnings.push(
          phrase
            ? `I couldn't tell which item you meant by “${phrase}”.`
            : 'Tell me which item to rename.'
        );
      } else {
        addItemDescriptionChange(changes, match, cleaned, changeIndex);
        changeIndex += 1;
        lastMatchedItem = match.item;
        context.lastMatchedItem = match.item;
      }

      previousCommandEnd = command.end;
      pendingItemPhrase = '';
      continue;
    }

    if (command.type === 'quantity') {
      const parsed = firstQuantityInRange(
        quantityTokens,
        command.end,
        nextStart,
        damageTokenIndexes
      );

      if (!parsed) {
        const damageNumberHandled = damageClaims.some(
          (claim) =>
            claim.token &&
            claim.token.index >= command.end &&
            claim.token.end <= nextStart
        );

        if (!damageNumberHandled) {
          warnings.push(
            'I couldn’t hear a quantity. Try “cement bags quantity 48”.'
          );
        }

        previousCommandEnd = command.end;
        pendingItemPhrase = '';
        continue;
      }

      const preceding = segment.slice(previousCommandEnd, command.start);
      const phrase = cleanItemPhrase(pendingItemPhrase || preceding);
      const parsedAt = value.indexOf(parsed.raw);
      const phraseFromValue = parsed && value
        ? cleanItemDescription(
            stripQuantityKeyword(
              `${value.slice(0, Math.max(0, parsedAt))} ${value.slice(
                Math.max(0, parsedAt) + parsed.raw.length
              )}`
            )
          )
        : '';
      const match: ItemMatch | null =
        findItemMatch(phrase || phraseFromValue, draft.items, orderItems) ??
        (!phrase && !phraseFromValue && lastMatchedItem
          ? { item: lastMatchedItem, confidence: 'fuzzy' }
          : null);

      if (!match) {
        warnings.push(
          phrase || phraseFromValue
            ? `I couldn't tell which item you meant by “${phrase || phraseFromValue}”.`
            : 'Tell me which item the quantity belongs to.'
        );
      } else {
        if (!match.item.description.trim() && match.suggestedDescription) {
          addItemDescriptionChange(
            changes,
            match,
            match.suggestedDescription,
            changeIndex
          );
          changeIndex += 1;
        }

        addItemQuantityChange(changes, match, parsed.value, changeIndex);
        changeIndex += 1;
        lastMatchedItem = match.item;
        context.lastMatchedItem = match.item;
      }

      previousCommandEnd = command.end;
      pendingItemPhrase = '';
      continue;
    }

    if (command.type === 'damaged') {
      const preceding = segment.slice(previousCommandEnd, command.start);
      const claim =
        damageClaims.find((current) => current.keywordStart === command.start) ??
        null;
      const parsed = claim?.token ?? null;
      let phraseSource = preceding;

      if (
        parsed &&
        parsed.index >= previousCommandEnd &&
        parsed.end <= command.start
      ) {
        const start = parsed.index - previousCommandEnd;
        phraseSource = `${preceding.slice(0, start)} ${preceding.slice(
          start + parsed.raw.length
        )}`;
      }

      const phrase = cleanItemPhrase(pendingItemPhrase || phraseSource);
      const match: ItemMatch | null =
        findItemMatch(phrase, draft.items, orderItems) ??
        (lastMatchedItem
          ? { item: lastMatchedItem, confidence: 'fuzzy' }
          : null);

      if (!parsed) {
        warnings.push(
          'Tell me how many units were damaged, for example “2 damaged”.'
        );
      } else if (!match) {
        warnings.push(
          phrase
            ? `I couldn't tell which item was damaged by “${phrase}”.`
            : 'Tell me which item was damaged.'
        );
      } else {
        if (!changes.has(`item-quantity:${match.item.id}`)) {
          const delivered = lastQuantityInRange(
            quantityTokens,
            previousCommandEnd,
            command.start,
            damageTokenIndexes
          );

          if (delivered) {
            addItemQuantityChange(changes, match, delivered.value, changeIndex);
            changeIndex += 1;
          }
        }

        addItemDamagedChange(changes, match, parsed.value, changeIndex);
        changeIndex += 1;

        lastMatchedItem = match.item;
        context.lastMatchedItem = match.item;
      }

      previousCommandEnd = command.end;
      pendingItemPhrase = '';
      continue;
    }

    if (command.type === 'received') {
      const negative = command.negative === true;
      const parsed = extractQuantityAndDescription(value);
      const preceding = segment.slice(previousCommandEnd, command.start);
      const phrase =
        cleanItemPhrase(pendingItemPhrase || preceding) ||
        parsed.description;
      const match: ItemMatch | null =
        findItemMatch(phrase, draft.items, orderItems) ??
        (lastMatchedItem
          ? { item: lastMatchedItem, confidence: 'fuzzy' }
          : null);
      const quantityCandidates = quantityTokens.filter(
        (token) =>
          !damageTokenIndexes.has(token.index) &&
          ((token.index >= command.end && token.end <= nextStart) ||
            (token.index >= previousCommandEnd && token.end <= command.start))
      );
      const parsedQuantity = nearestQuantity(
        quantityCandidates,
        command.start,
        command.end
      );

      if (!match) {
        warnings.push(
          phrase
            ? `I couldn't tell which item you meant by “${phrase}”.`
            : 'Tell me which item was received.'
        );
      } else {
        if (parsedQuantity) {
          if (!match.item.description.trim() && 'suggestedDescription' in match) {
            const suggested = (match as ItemMatch).suggestedDescription;

            if (suggested) {
              addItemDescriptionChange(changes, match, suggested, changeIndex);
              changeIndex += 1;
            }
          }

          addItemQuantityChange(
            changes,
            match,
            parsedQuantity.value,
            changeIndex
          );
          changeIndex += 1;
        }

        addItemReceivedChange(changes, match, !negative, changeIndex);
        changeIndex += 1;
        lastMatchedItem = match.item;
        context.lastMatchedItem = match.item;
      }

      previousCommandEnd = command.end;
      pendingItemPhrase = '';
      continue;
    }

    previousCommandEnd = command.end;
    pendingItemPhrase = '';
  }
}

export function parseVoiceCorrectionsDetailed(
  transcript: string,
  draft: DeliveryNoteDetails,
  orderItems: PurchaseOrderItemRef[]
): VoiceParseResult {
  const changes = new Map<string, VoiceChange>();
  const warnings: string[] = [];
  const context: ParseContext = { lastMatchedItem: null };

  for (const clause of splitClauses(transcript)) {
    parseSegment(clause, draft, orderItems, changes, warnings, context);
  }

  return {
    changes: Array.from(changes.values()),
    warnings: Array.from(new Set(warnings)),
  };
}

export function parseVoiceCorrections(
  transcript: string,
  draft: DeliveryNoteDetails,
  orderItems: PurchaseOrderItemRef[]
): VoiceChange[] {
  return parseVoiceCorrectionsDetailed(transcript, draft, orderItems).changes;
}

export function applyVoiceChanges(
  draft: DeliveryNoteDetails,
  changes: VoiceChange[]
): DeliveryNoteDetails {
  let next: DeliveryNoteDetails = {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
  };

  for (const change of changes) {
    if (change.kind === 'field' && change.field && change.to) {
      next = { ...next, [change.field]: change.to };
      continue;
    }

    if (change.kind === 'item-add' && change.newItem) {
      next = {
        ...next,
        items: [
          ...next.items,
          createDeliveryItem(change.newItem.description, change.newItem.quantity),
        ],
      };
      continue;
    }

    if (change.kind === 'item-remove' && change.itemId) {
      if (next.items.length > 1) {
        next = {
          ...next,
          items: next.items.filter((item) => item.id !== change.itemId),
        };
      }
      continue;
    }

    if (!change.itemId) {
      continue;
    }

    next = {
      ...next,
      items: next.items.map((item) => {
        if (item.id !== change.itemId) {
          return item;
        }

        if (change.kind === 'item-description' && change.to) {
          return { ...item, description: change.to, poItemId: undefined };
        }

        if (change.kind === 'item-quantity' && change.to) {
          return { ...item, quantity: change.to };
        }

        if (
          change.kind === 'item-damaged' &&
          change.damagedQuantity !== undefined
        ) {
          return {
            ...item,
            damagedQuantity: change.damagedQuantity,
            received: true,
          };
        }

        if (change.kind === 'item-received' && change.received !== undefined) {
          return { ...item, received: change.received };
        }

        return item;
      }),
    };
  }

  return next;
}

function issueReason(issue: ValidationIssue) {
  if (issue.expectedMax !== undefined && issue.expectedMax !== null) {
    return `Backend expected max ${issue.expectedMax}`;
  }

  if (issue.expected !== undefined && issue.expected !== null && issue.expected !== '') {
    return `Backend expected ${issue.expected}`;
  }

  return issue.message;
}

function findExpectedOrderDescription(
  value: string,
  orderItems: PurchaseOrderItemRef[]
) {
  const queryTokens = tokenizeDescription(value);

  if (queryTokens.length === 0) {
    return null;
  }

  let best: { description: string; score: number } | null = null;

  for (const orderItem of orderItems) {
    const description = orderItem.description.trim();

    if (!description) {
      continue;
    }

    const score = scoreDescription(
      queryTokens,
      tokenizeDescription(description)
    );

    if (score >= 0.5 && (!best || score > best.score)) {
      best = { description, score };
    }
  }

  return best?.description ?? null;
}

export function getVoiceTargets(
  draft: DeliveryNoteDetails,
  validationResult: DeliveryValidationResponse | null
): VoiceTarget[] {
  const targets: VoiceTarget[] = [];
  const fieldIndexes = new Map<EditableField, number>();
  const itemIndexes = new Map<string, number>();

  const addFieldTarget = (
    field: EditableField,
    reason: string,
    preferReason = false
  ) => {
    const existing = fieldIndexes.get(field);

    if (existing !== undefined) {
      if (preferReason) {
        targets[existing] = {
          kind: 'field',
          field,
          label: FIELD_LABELS[field],
          reason,
        };
      }
      return;
    }

    fieldIndexes.set(field, targets.length);
    targets.push({
      kind: 'field',
      field,
      label: FIELD_LABELS[field],
      reason,
    });
  };

  const addItemTarget = (
    item: DeliveryNoteItem,
    reason: string,
    preferReason = false
  ) => {
    const existing = itemIndexes.get(item.id);

    if (existing !== undefined) {
      if (preferReason) {
        const current = targets[existing];

        if (current.kind === 'item') {
          targets[existing] = { ...current, reason };
        }
      }
      return;
    }

    itemIndexes.set(item.id, targets.length);
    targets.push({
      kind: 'item',
      itemId: item.id,
      label: item.description.trim() || `Item ${itemIndexes.size}`,
      reason,
    });
  };

  if (!draft.poNumber.trim()) {
    addFieldTarget('poNumber', 'Could not read the PO number');
  }

  if (!draft.noteNumber.trim()) {
    addFieldTarget('noteNumber', 'Could not read the delivery note number');
  }

  if (!draft.supplier.trim()) {
    addFieldTarget('supplier', 'Could not read the supplier');
  }

  if (!draft.deliveryDate.trim()) {
    addFieldTarget('deliveryDate', 'Could not read the date');
  } else if (!normalizeDeliveryDate(draft.deliveryDate)) {
    addFieldTarget('deliveryDate', 'Date needs a valid format');
  }

  if (!draft.site.trim()) {
    addFieldTarget('site', 'Could not read the delivery site');
  }

  draft.items.forEach((item) => {
    const problems: string[] = [];
    const quantity = parsePositiveQuantity(item.quantity);
    const damagedQuantity = parseNonNegativeQuantity(item.damagedQuantity);

    if (!item.description.trim()) {
      problems.push('Description needs checking');
    }

    if (quantity === null) {
      problems.push('Quantity needs checking');
    }

    if (
      item.received &&
      (damagedQuantity === null ||
        (quantity !== null && damagedQuantity > quantity))
    ) {
      problems.push('Damaged quantity needs checking');
    }

    if (problems.length > 0) {
      addItemTarget(item, problems.join(' · '));
    }
  });

  if (!validationResult) {
    return targets;
  }

  const orderItems = validationResult.order?.items ?? [];

  for (const issue of validationResult.issues) {
    if (issue.severity !== 'error') {
      continue;
    }

    if (issue.code === 'ORDER_NOT_FOUND' || issue.field === 'poNumber') {
      addFieldTarget(
        'poNumber',
        issue.code === 'ORDER_NOT_FOUND'
          ? `No purchase order found for ${String(issue.actual ?? draft.poNumber)}`
          : issueReason(issue),
        true
      );
      continue;
    }

    if (issue.field === 'deliveryNoteNumber') {
      addFieldTarget('noteNumber', issue.message, true);
      continue;
    }

    if (issue.field === 'supplier' || issue.code === 'SUPPLIER_MISMATCH') {
      const expected = issue.expected ?? validationResult.order?.supplier;
      addFieldTarget(
        'supplier',
        expected ? `Backend expected ${expected}` : issueReason(issue),
        true
      );
      continue;
    }

    if (issue.field === 'site' || issue.code === 'SITE_MISMATCH') {
      const expected = issue.expected ?? validationResult.order?.site;
      addFieldTarget(
        'site',
        expected ? `Backend expected ${expected}` : issueReason(issue),
        true
      );
      continue;
    }

    if (issue.field === 'deliveryDate') {
      addFieldTarget('deliveryDate', issueReason(issue), true);
      continue;
    }

    const itemField = issue.field?.match(/^items\[(\d+)\](?:\.(.+))?$/);

    if (!itemField) {
      continue;
    }

    const item = draft.items[Number(itemField[1])];

    if (!item) {
      continue;
    }

    const subfield = itemField[2] ?? '';

    if (subfield === 'description') {
      const expected = findExpectedOrderDescription(
        String(issue.actual ?? item.description),
        orderItems
      );
      addItemTarget(
        item,
        expected ? `PO has “${expected}”` : issue.message,
        true
      );
      continue;
    }

    if (subfield === 'quantity') {
      addItemTarget(item, issueReason(issue), true);
      continue;
    }

    addItemTarget(item, issue.message, true);
  }

  return targets;
}
