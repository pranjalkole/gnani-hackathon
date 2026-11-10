export type DeliveryNoteItem = {
  id: string;
  poItemId?: string;
  description: string;
  quantity: string;
  damagedQuantity: string;
  received: boolean;
};

export type DeliveryNoteDetails = {
  poNumber: string;
  noteNumber: string;
  supplier: string;
  deliveryDate: string;
  site: string;
  items: DeliveryNoteItem[];
};

export type PurchaseOrderItemRef = {
  id: string;
  description: string;
};

let itemSequence = 0;

export function createDeliveryItem(description = '', quantity = '1'): DeliveryNoteItem {
  itemSequence += 1;

  return {
    id: `item-${itemSequence}`,
    description,
    quantity,
    damagedQuantity: '0',
    received: true,
  };
}

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const DATE_PATTERNS = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/,
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\.?,?\\s+\\d{2,4}\\b`, 'i'),
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'i'),
];

const NOTE_LABEL = String.raw`delivery\s+note(?:\s+(?:no\.?|number))?|delivery\s+no\.?|d\.?\s*n\.?\s*(?:no\.?|number)|note\s+(?:no\.?|number)`;
const PO_LABEL = String.raw`purchase\s+order(?:\s+(?:no\.?|number|#))?|order\s+ref(?:erence)?(?:\.?)|p\.?\s*o\.?(?:\s+(?:no\.?|number|#))?|buyer\s+order(?:\s+(?:no\.?|number|#))?`;
const SUPPLIER_LABEL = String.raw`supplier(?:\s+name)?|vendor(?:\s+name)?|seller|sold\s+by|dispatched\s+by|from`;
const DATE_LABEL = String.raw`delivery\s+date|date\s+of\s+delivery|date|dated|delivered\s+on`;
const SITE_LABEL = String.raw`deliver\s+to|delivery\s+address|ship\s+to|site|project|destination|location`;

const FIELD_LABEL =
  /^(?:delivery|supplier|vendor|seller|sold\s+by|dispatched\s+by|from|date|dated|deliver\s+to|delivery\s+address|ship\s+to|site|project|destination|location|note|dn|invoice|purchase\s+order|order|po|total|subtotal|vat|tax)\b/i;

const NON_ITEM_HINT =
  /\b(?:total|subtotal|tax|vat|discount|balance|phone|tel|mobile|fax|email|e-mail|website|invoice|order|purchase\s+order|page|received\s+by|signature|signed|terms|conditions|delivery\s+note|supplier|vendor|deliver\s+to|ship\s+to)\b/i;

function normalizeLines(lines: string[]) {
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function findDate(value: string) {
  for (const pattern of DATE_PATTERNS) {
    const match = value.match(pattern);

    if (match) {
      return match[0];
    }
  }

  return null;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
}

function isPlausibleText(value: string) {
  const cleaned = cleanText(value);

  return cleaned.length >= 2 && /[a-z]/i.test(cleaned) && !findDate(cleaned);
}

function getLabelRegex(labelPattern: string) {
  return new RegExp(`^(?:${labelPattern})(?![a-z0-9])\\s*[:#-]?\\s*(.*)$`, 'i');
}

function extractLabeledValue(
  lines: string[],
  used: Set<number>,
  labelPattern: string,
  isValid: (value: string) => boolean
) {
  const regex = getLabelRegex(labelPattern);

  for (let index = 0; index < lines.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const match = lines[index].match(regex);

    if (!match) {
      continue;
    }

    const inlineValue = match[1].trim();

    if (inlineValue && isValid(inlineValue)) {
      used.add(index);
      return inlineValue;
    }

    for (let nextIndex = index + 1; nextIndex <= index + 2 && nextIndex < lines.length; nextIndex += 1) {
      if (used.has(nextIndex)) {
        continue;
      }

      const nextValue = lines[nextIndex].trim();

      if (!nextValue || FIELD_LABEL.test(nextValue)) {
        continue;
      }

      if (isValid(nextValue)) {
        used.add(index);
        used.add(nextIndex);
        return nextValue;
      }
    }
  }

  return null;
}

function cleanReferenceNumber(value: string) {
  const cleaned = value.replace(/^[#:.\-\s]+/, '');
  const token = cleaned.split(/\s+/)[0]?.replace(/[.,;:]+$/, '') ?? '';

  const isUsable = (candidate: string) =>
    Boolean(candidate) &&
    /\d/.test(candidate) &&
    !findDate(candidate) &&
    /^[a-z0-9][a-z0-9._/_-]*$/i.test(candidate);

  if (isUsable(token)) {
    return token;
  }

  const fallback = cleaned.match(/\b[A-Z0-9][A-Z0-9._/_-]*\d[A-Z0-9._/_-]*\b/i)?.[0] ?? '';

  return isUsable(fallback) ? fallback : '';
}

function extractDate(lines: string[], used: Set<number>) {
  const labeled = extractLabeledValue(lines, used, DATE_LABEL, (value) => findDate(value) !== null);

  if (labeled) {
    const date = findDate(labeled);

    if (date) {
      return date;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const date = findDate(lines[index]);

    if (date) {
      used.add(index);
      return date;
    }
  }

  return '';
}

function extractNoteNumber(lines: string[], used: Set<number>) {
  const labeled = extractLabeledValue(
    lines,
    used,
    NOTE_LABEL,
    (value) => cleanReferenceNumber(value) !== ''
  );

  if (labeled) {
    return cleanReferenceNumber(labeled);
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const match = lines[index].match(
      /\b(?:DN|D\.?\s*N\.?)[\s./#-]*([A-Z0-9][A-Z0-9/_-]*\d[A-Z0-9/_-]*)\b/i
    );

    if (match) {
      used.add(index);
      const fullMatch = match[0].replace(/\s+/g, '-').replace(/^D\.?N\.?/i, 'DN');
      return cleanReferenceNumber(fullMatch);
    }
  }

  return '';
}

function normalizePONumberPrefix(value: string) {
  return value
    .replace(/^P\.O\.?[\s./#-]*/i, 'PO-')
    .replace(/^P\s+O[\s./#-]*/i, 'PO-')
    .replace(/^P-O-?/i, 'PO-');
}

function extractPONumber(lines: string[], used: Set<number>) {
  // Keep the "PO-" prefix when the number is printed as a single token, for
  // example "PO-1042". The generic label extractor would otherwise consume the
  // hyphen as a separator and return only "1042".
  for (let index = 0; index < lines.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const token = lines[index].match(
      /\b(?:PO|P\.?\s*O\.?)[\s./#-]*[A-Z0-9][A-Z0-9._/_-]*\d[A-Z0-9._/_-]*\b/i
    )?.[0];

    if (!token) {
      continue;
    }

    const cleaned = cleanReferenceNumber(
      token.replace(/\s*#\s*/g, '-').replace(/\s+/g, '-')
    );

    if (cleaned) {
      used.add(index);
      return normalizePONumberPrefix(cleaned);
    }
  }

  const labeled = extractLabeledValue(
    lines,
    used,
    PO_LABEL,
    (value) => cleanReferenceNumber(value) !== ''
  );

  return labeled ? normalizePONumberPrefix(cleanReferenceNumber(labeled)) : '';
}

function extractTextValue(lines: string[], used: Set<number>, labelPattern: string) {
  const value = extractLabeledValue(lines, used, labelPattern, isPlausibleText);

  return value ? cleanText(value) : '';
}

function cleanDescription(value: string) {
  return value
    .replace(/^\d+[.)]?\s+/, '')
    .replace(/^[-•*.\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim();
}

function cleanDescriptionAfterQuantity(value: string) {
  const cleaned = cleanDescription(value);
  const stripped = cleaned.replace(/\s+\d{1,4}(?:[.,]\d+)?$/, '').trim();

  return stripped || cleaned;
}

function hasDescription(value: string) {
  const cleaned = cleanDescription(value);

  return cleaned.length >= 2 && /[a-z]/i.test(cleaned);
}

function parseItemLine(line: string): Pick<DeliveryNoteItem, 'description' | 'quantity'> | null {
  if (NON_ITEM_HINT.test(line) || findDate(line)) {
    return null;
  }

  const cleaned = line
    .replace(/[|]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-•*.\s]+/, '')
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return null;
  }

  const quantityFirst = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×)\s+(.+)$/i);
  if (quantityFirst && hasDescription(quantityFirst[2])) {
    return {
      description: cleanDescriptionAfterQuantity(quantityFirst[2]),
      quantity: quantityFirst[1],
    };
  }

  const quantityUnitFirst = cleaned.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:pcs?|units?|bags?|boxes?|packs?|rolls?|sheets?|pairs?|sets?|cartons?|tins?|bottles?|drums?|pallets?)\s+(?:of\s+)?(.+)$/i
  );
  if (quantityUnitFirst && hasDescription(quantityUnitFirst[2])) {
    return {
      description: cleanDescription(quantityUnitFirst[2]),
      quantity: quantityUnitFirst[1],
    };
  }

  const quantityLabel = cleaned.match(
    /^(.+?)\s+(?:qty|quantity|qnt)\s*[:.]?\s*(\d+(?:[.,]\d+)?)/i
  );
  if (quantityLabel && hasDescription(quantityLabel[1])) {
    return {
      description: cleanDescription(quantityLabel[1]),
      quantity: quantityLabel[2],
    };
  }

  const quantityLast = cleaned.match(
    /^(.+?)\s*(?:[-–—:]\s*)?(\d+(?:[.,]\d+)?)\s*(?:pcs?|units?|bags?|boxes?|packs?|rolls?|sheets?|pairs?|sets?|cartons?|tins?|bottles?|drums?|pallets?|kg|kgs|litres?|ltr|m|meters?)?$/i
  );
  if (quantityLast && hasDescription(quantityLast[1])) {
    return {
      description: cleanDescription(quantityLast[1]),
      quantity: quantityLast[2],
    };
  }

  return null;
}

/**
 * Handles tables where OCR puts the description and the quantity on separate
 * lines, for example "Cement bags" followed by "50".
 */
function parseSplitItemLine(
  lines: string[],
  index: number,
  used: Set<number>
): Pick<DeliveryNoteItem, 'description' | 'quantity'> | null {
  if (index + 1 >= lines.length || used.has(index) || used.has(index + 1)) {
    return null;
  }

  const descriptionLine = lines[index];
  const quantityLine = lines[index + 1];

  if (
    !hasDescription(descriptionLine) ||
    /\d/.test(descriptionLine) ||
    NON_ITEM_HINT.test(descriptionLine) ||
    FIELD_LABEL.test(descriptionLine)
  ) {
    return null;
  }

  const quantityMatch = quantityLine.match(
    /^(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:pcs?|units?|bags?|boxes?|packs?|rolls?|sheets?|pairs?|sets?|cartons?|tins?|bottles?|drums?|pallets?|kg|kgs|litres?|ltr|m|meters?)?$/i
  );

  if (!quantityMatch) {
    return null;
  }

  return {
    description: cleanDescription(descriptionLine),
    quantity: quantityMatch[1],
  };
}

export function parseDeliveryNote(lines: string[]): DeliveryNoteDetails {
  const normalized = normalizeLines(lines);
  const used = new Set<number>();

  const deliveryDate = extractDate(normalized, used);
  const poNumber = extractPONumber(normalized, used);
  const noteNumber = extractNoteNumber(normalized, used);
  const supplier = extractTextValue(normalized, used, SUPPLIER_LABEL);
  const site = extractTextValue(normalized, used, SITE_LABEL);

  const items: DeliveryNoteItem[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < normalized.length; index += 1) {
    if (used.has(index)) {
      continue;
    }

    const splitItem = parseSplitItemLine(normalized, index, used);
    const item = splitItem ?? parseItemLine(normalized[index]);

    if (!item) {
      continue;
    }

    if (splitItem) {
      used.add(index);
      used.add(index + 1);
      index += 1;
    }

    const key = `${item.description.toLowerCase()}|${item.quantity}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(createDeliveryItem(item.description, item.quantity));

    if (items.length >= 20) {
      break;
    }
  }

  return {
    poNumber,
    noteNumber,
    supplier,
    deliveryDate,
    site,
    items,
  };
}

const MONTH_NUMBERS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function toIsoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYear(value: string) {
  const year = Number(value);

  if (!Number.isInteger(year)) {
    return null;
  }

  if (value.length === 2) {
    return 2000 + year;
  }

  return value.length === 4 ? year : null;
}

/**
 * Converts the date formats produced by OCR or typed by a worker into the
 * backend's required YYYY-MM-DD format. Day-first is used for ambiguous
 * slash/dot dates because the review screen's example is DD/MM/YYYY.
 */
export function normalizeDeliveryDate(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const yearFirst = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yearFirst) {
    return toIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  const dayFirst = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dayFirst) {
    const year = parseYear(dayFirst[3]);
    return year === null ? null : toIsoDate(year, Number(dayFirst[2]), Number(dayFirst[1]));
  }

  const dayMonthName = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{2,4})$/);
  if (dayMonthName) {
    const month = MONTH_NUMBERS[dayMonthName[2].slice(0, 3).toLowerCase()];
    const year = parseYear(dayMonthName[3]);
    return month === undefined || year === null
      ? null
      : toIsoDate(year, month, Number(dayMonthName[1]));
  }

  const monthNameDay = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (monthNameDay) {
    const month = MONTH_NUMBERS[monthNameDay[1].slice(0, 3).toLowerCase()];
    const year = parseYear(monthNameDay[3]);
    return month === undefined || year === null
      ? null
      : toIsoDate(year, month, Number(monthNameDay[2]));
  }

  return null;
}

/**
 * Parses a UI quantity string. The backend accepts up to three decimal places
 * and a quantity must be positive.
 */
export function parsePositiveQuantity(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    return null;
  }

  const quantity = Number(normalized);

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 1_000_000_000) {
    return null;
  }

  return quantity;
}

/**
 * Parses a UI damaged-quantity string. Blank input means zero, and values must
 * be non-negative with up to three decimal places.
 */
export function parseNonNegativeQuantity(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (normalized === '') {
    return 0;
  }

  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    return null;
  }

  const quantity = Number(normalized);

  if (!Number.isFinite(quantity) || quantity < 0 || quantity >= 1_000_000_000) {
    return null;
  }

  return quantity;
}

/** Keeps quantity arithmetic at the three-decimal precision the API accepts. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Returns the good units on an item after damage is removed, or null when the
 * quantity or damaged value is invalid.
 */
export function getGoodQuantity(
  item: Pick<DeliveryNoteItem, 'quantity' | 'damagedQuantity'>
): number | null {
  const quantity = parsePositiveQuantity(item.quantity);
  const damaged = parseNonNegativeQuantity(item.damagedQuantity);

  if (quantity === null || damaged === null || damaged > quantity) {
    return null;
  }

  return roundQuantity(quantity - damaged);
}

export function normalizeDescription(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Fills `poItemId` from the PO returned by validation when the description
 * uniquely identifies one PO line.
 */
export function attachPurchaseOrderItemIds(
  items: DeliveryNoteItem[],
  orderItems: PurchaseOrderItemRef[]
): DeliveryNoteItem[] {
  const idsByDescription = new Map<string, string[]>();

  for (const orderItem of orderItems) {
    const key = normalizeDescription(orderItem.description);
    const ids = idsByDescription.get(key) ?? [];
    ids.push(orderItem.id);
    idsByDescription.set(key, ids);
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (item.poItemId) {
      return item;
    }

    const matches = idsByDescription.get(normalizeDescription(item.description)) ?? [];

    if (matches.length !== 1) {
      return item;
    }

    changed = true;
    return { ...item, poItemId: matches[0] };
  });

  return changed ? nextItems : items;
}
