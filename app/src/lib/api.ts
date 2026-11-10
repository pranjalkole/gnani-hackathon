import * as Crypto from 'expo-crypto';

import {
  normalizeDeliveryDate,
  parseNonNegativeQuantity,
  parsePositiveQuantity,
  roundQuantity,
  type DeliveryNoteDetails,
  type DeliveryNoteItem,
} from './deliveryNote';

export type ValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  field?: string;
  actual?: string | number;
  expected?: string | number;
  expectedMax?: number;
  message: string;
};

export type PurchaseOrderItem = {
  id: string;
  lineNumber: number;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  remainingQuantity: number;
};

export type PurchaseOrder = {
  poNumber: string;
  supplier: string;
  site: string;
  status: string;
  expectedDeliveryDate: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  items: PurchaseOrderItem[];
};

export type ListOrdersResponse = {
  orders: PurchaseOrder[];
};

export type DeliveryValidationResponse = {
  valid: boolean;
  order: PurchaseOrder | null;
  deliveryNote: {
    number: string;
    alreadyRecorded: boolean;
  };
  issues: ValidationIssue[];
};

export type CreateDeliveryResponse = {
  id: string;
  idempotentReplay: boolean;
  orderStatus: string;
  recordedAt: string;
};

type ApiErrorOptions = {
  status?: number;
  code: string;
  message: string;
  issues?: ValidationIssue[];
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ValidationIssue[];
  readonly fields: Record<string, string>;

  constructor({
    status = 0,
    code,
    message,
    issues = [],
    fields = {},
  }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.fields = fields;
  }
}

type ErrorEnvelope = {
  code: string;
  message: string;
  issues: ValidationIssue[];
  fields: Record<string, string>;
};

function getApiUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (!value) {
    throw new ApiError({
      code: 'API_URL_MISSING',
      message:
        "We can't connect to the site server right now. Check your connection and try again.",
    });
  }

  return value.replace(/\/+$/, '');
}

function extractErrorEnvelope(data: unknown): ErrorEnvelope | null {
  if (!data || typeof data !== 'object' || !('error' in data)) {
    return null;
  }

  const rawError = (data as { error?: unknown }).error;

  if (!rawError || typeof rawError !== 'object') {
    return null;
  }

  const value = rawError as {
    code?: unknown;
    message?: unknown;
    issues?: unknown;
    fields?: unknown;
  };

  return {
    code: typeof value.code === 'string' ? value.code : 'REQUEST_FAILED',
    message:
      typeof value.message === 'string'
        ? value.message
        : 'The server rejected the request.',
    issues: Array.isArray(value.issues) ? (value.issues as ValidationIssue[]) : [],
    fields:
      value.fields && typeof value.fields === 'object'
        ? (value.fields as Record<string, string>)
        : {},
  };
}

type RequestConfig = {
  method: 'GET' | 'POST';
  body?: unknown;
};

async function requestJson<T>(
  path: string,
  { method, body }: RequestConfig
): Promise<T> {
  const apiUrl = getApiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError({
      code: controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: controller.signal.aborted
        ? 'The server took too long to respond. Check the connection and try again.'
        : "We can't reach the site server. Check your connection and try again.",
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const envelope = extractErrorEnvelope(data);

    throw new ApiError({
      status: response.status,
      code: envelope?.code ?? 'REQUEST_FAILED',
      message:
        envelope?.message ??
        'Something went wrong on the site server. Try again.',
      issues: envelope?.issues ?? [],
      fields: envelope?.fields ?? {},
    });
  }

  if (data === null) {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The site server sent an unexpected response. Try again.',
    });
  }

  return data as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body });
}

function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'GET' });
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function requireIsoDate(value: string) {
  const normalized = normalizeDeliveryDate(value);

  if (!normalized) {
    throw new ApiError({
      code: 'INVALID_DATE',
      message: 'Enter a valid delivery date, for example 30/10/2026 or 2026-10-30.',
    });
  }

  return normalized;
}

function requireQuantity(value: string, description: string) {
  const quantity = parsePositiveQuantity(value);

  if (quantity === null) {
    throw new ApiError({
      code: 'INVALID_QUANTITY',
      message: `Enter a positive quantity with up to three decimals for "${description || 'item'}".`,
    });
  }

  return quantity;
}

function getItemQuantities(item: DeliveryNoteItem) {
  const quantity = requireQuantity(item.quantity, item.description);
  const damagedQuantity = item.received
    ? parseNonNegativeQuantity(item.damagedQuantity)
    : 0;

  if (damagedQuantity === null) {
    throw new ApiError({
      code: 'INVALID_DAMAGED_QUANTITY',
      message: `Enter 0 or more damaged units with up to three decimals for "${item.description || 'item'}".`,
    });
  }

  if (damagedQuantity > quantity) {
    throw new ApiError({
      code: 'INVALID_DAMAGED_QUANTITY',
      message: `Damaged units cannot be more than the note quantity for "${item.description || 'item'}".`,
    });
  }

  return {
    quantity,
    damagedQuantity,
    receivedQuantity: item.received
      ? roundQuantity(quantity - damagedQuantity)
      : 0,
  };
}

export async function validateDeliveryNote(
  details: DeliveryNoteDetails,
  rawOcrText?: string
): Promise<DeliveryValidationResponse> {
  return postJson<DeliveryValidationResponse>('/api/v1/orders/validate', {
    poNumber: details.poNumber.trim(),
    deliveryNoteNumber: details.noteNumber.trim(),
    supplier: details.supplier.trim(),
    deliveryDate: requireIsoDate(details.deliveryDate),
    site: details.site.trim(),
    items: details.items.map((item) => {
      const { quantity, receivedQuantity } = getItemQuantities(item);

      return {
        ...(item.poItemId ? { poItemId: item.poItemId } : {}),
        description: item.description.trim(),
        quantity,
        receivedQuantity,
      };
    }),
    ...(rawOcrText ? { rawOcrText: truncate(rawOcrText, 20000) } : {}),
  });
}

export type CreateDeliveryInput = {
  details: DeliveryNoteDetails;
  worker: {
    name: string;
    identifier: string;
  };
  clientRequestId: string;
  rawOcrText?: string;
  voiceTranscript?: string;
};

export async function createDelivery({
  details,
  worker,
  clientRequestId,
  rawOcrText,
  voiceTranscript,
}: CreateDeliveryInput): Promise<CreateDeliveryResponse> {
  const workerName = worker.name.trim();
  const workerIdentifier = worker.identifier.trim();

  if (!workerName || !workerIdentifier) {
    throw new ApiError({
      code: 'WORKER_REQUIRED',
      message: 'Your worker identity is missing. Sign in again and retry.',
    });
  }

  const items = details.items.map((item) => {
    if (!item.poItemId) {
      throw new ApiError({
        code: 'ITEM_NOT_MATCHED',
        message: `"${item.description || 'An item'}" is not matched to a purchase order line. Re-check the delivery.`,
      });
    }

    const { quantity, receivedQuantity, damagedQuantity } =
      getItemQuantities(item);

    return {
      poItemId: item.poItemId,
      description: item.description.trim(),
      quantity,
      receivedQuantity,
      damagedQuantity,
    };
  });

  return postJson<CreateDeliveryResponse>('/api/v1/deliveries', {
    clientRequestId: clientRequestId.trim(),
    poNumber: details.poNumber.trim(),
    deliveryNoteNumber: details.noteNumber.trim(),
    supplier: details.supplier.trim(),
    deliveryDate: requireIsoDate(details.deliveryDate),
    site: details.site.trim(),
    worker: {
      name: workerName,
      identifier: workerIdentifier,
    },
    ...(voiceTranscript ? { voiceTranscript: truncate(voiceTranscript, 20000) } : {}),
    ...(rawOcrText ? { rawOcrText: truncate(rawOcrText, 20000) } : {}),
    items,
  });
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const response = await getJson<ListOrdersResponse>('/api/v1/orders');

  if (!Array.isArray(response.orders)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'The site server sent an unexpected response. Try again.',
    });
  }

  return response.orders;
}

export function createClientRequestId() {
  return Crypto.randomUUID();
}
