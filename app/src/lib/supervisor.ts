import { colors } from '@/theme';

export type OrderStatus = 'open' | 'partially_received' | 'closed' | 'cancelled';

export type OrderFilter = 'all' | OrderStatus;

export type SupervisorOrderItem = {
  id: string;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
};

export type SupervisorOrder = {
  poNumber: string;
  supplier: string;
  site: string;
  expectedDeliveryDate: string | null;
  status: OrderStatus;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  items: SupervisorOrderItem[];
};

export type OrderSummary = {
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  remainingQuantity: number;
  receivedPercent: number;
  damagedPercent: number;
};

export type SupervisorTotals = {
  totalOrders: number;
  activeOrders: number;
  openOrders: number;
  partialOrders: number;
  closedOrders: number;
  cancelledOrders: number;
  orderedUnits: number;
  receivedUnits: number;
  damagedUnits: number;
  remainingUnits: number;
  receivedPercent: number;
  damagedPercent: number;
};

export type OrderStatusMeta = {
  label: string;
  shortLabel: string;
  textColor: string;
  backgroundColor: string;
  dotColor: string;
};

export const ORDER_FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'partially_received', label: 'Partial' },
  { id: 'closed', label: 'Closed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  open: {
    label: 'Open',
    shortLabel: 'Open',
    textColor: colors.forest,
    backgroundColor: colors.sage,
    dotColor: colors.forest,
  },
  partially_received: {
    label: 'Partially received',
    shortLabel: 'Partial',
    textColor: colors.ink,
    backgroundColor: colors.accentSoft,
    dotColor: colors.accent,
  },
  closed: {
    label: 'Closed',
    shortLabel: 'Closed',
    textColor: colors.inkSoft,
    backgroundColor: colors.surfaceMuted,
    dotColor: colors.inkSoft,
  },
  cancelled: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    textColor: colors.inkSoft,
    backgroundColor: colors.surfaceMuted,
    dotColor: colors.inkFaint,
  },
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function getOrderStatusMeta(status: OrderStatus) {
  return STATUS_META[status];
}

const STATUS_PRIORITY: Record<OrderStatus, number> = {
  open: 0,
  partially_received: 1,
  closed: 2,
  cancelled: 3,
};

export function sortOrdersForSupervisor(orders: SupervisorOrder[]) {
  return [...orders].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
  );
}

export function getCancellationMeta(order: SupervisorOrder) {
  return [
    order.cancelledAt ? formatExpectedDate(order.cancelledAt) : null,
    order.cancellationReason ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

export function getCancellationDetail(order: SupervisorOrder) {
  const summary = summarizeOrder(order);
  const parts: string[] = [];

  if (summary.receivedQuantity > 0) {
    parts.push(
      `${formatQuantity(summary.receivedQuantity)} of ${formatQuantity(
        summary.orderedQuantity
      )} units received`
    );
  } else {
    parts.push(
      `No units received · ${formatQuantity(
        summary.orderedQuantity
      )} units ordered`
    );
  }

  if (summary.damagedQuantity > 0) {
    parts.push(
      `${formatQuantity(summary.damagedQuantity)} damaged before cancellation`
    );
  }

  return parts.join(' · ');
}

export function summarizeOrder(order: SupervisorOrder): OrderSummary {
  const orderedQuantity = sum(order.items.map((item) => item.orderedQuantity));
  const receivedQuantity = sum(order.items.map((item) => item.receivedQuantity));
  const damagedQuantity = sum(order.items.map((item) => item.damagedQuantity));
  const remainingQuantity = Math.max(orderedQuantity - receivedQuantity, 0);
  const receivedPercent =
    orderedQuantity > 0 ? clampPercent((receivedQuantity / orderedQuantity) * 100) : 0;
  const damagedPercent =
    orderedQuantity > 0
      ? Math.min(
          (damagedQuantity / orderedQuantity) * 100,
          Math.max(0, 100 - receivedPercent)
        )
      : 0;

  return {
    orderedQuantity,
    receivedQuantity,
    damagedQuantity,
    remainingQuantity,
    receivedPercent,
    damagedPercent,
  };
}

export function getSupervisorTotals(orders: SupervisorOrder[]): SupervisorTotals {
  // Cancelled orders stay visible in the list, but they do not contribute to
  // receiving progress or damaged-unit totals.
  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const orderedUnits = sum(
    activeOrders.map((order) => summarizeOrder(order).orderedQuantity)
  );
  const receivedUnits = sum(
    activeOrders.map((order) => summarizeOrder(order).receivedQuantity)
  );
  const damagedUnits = sum(
    activeOrders.map((order) => summarizeOrder(order).damagedQuantity)
  );
  const remainingUnits = Math.max(orderedUnits - receivedUnits, 0);
  const receivedPercent =
    orderedUnits > 0 ? clampPercent((receivedUnits / orderedUnits) * 100) : 0;
  const damagedPercent =
    orderedUnits > 0
      ? Math.min(
          (damagedUnits / orderedUnits) * 100,
          Math.max(0, 100 - receivedPercent)
        )
      : 0;

  return {
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    openOrders: orders.filter((order) => order.status === 'open').length,
    partialOrders: orders.filter((order) => order.status === 'partially_received')
      .length,
    closedOrders: orders.filter((order) => order.status === 'closed').length,
    cancelledOrders: orders.filter((order) => order.status === 'cancelled').length,
    orderedUnits,
    receivedUnits,
    damagedUnits,
    remainingUnits,
    receivedPercent,
    damagedPercent,
  };
}

export function getOrderCounts(orders: SupervisorOrder[]): Record<OrderFilter, number> {
  return {
    all: orders.length,
    open: orders.filter((order) => order.status === 'open').length,
    partially_received: orders.filter((order) => order.status === 'partially_received')
      .length,
    closed: orders.filter((order) => order.status === 'closed').length,
    cancelled: orders.filter((order) => order.status === 'cancelled').length,
  };
}

export function filterOrders(
  orders: SupervisorOrder[],
  query: string,
  filter: OrderFilter
) {
  const normalizedQuery = query.trim().toLowerCase();

  return orders.filter((order) => {
    if (filter !== 'all' && order.status !== filter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [order.poNumber, order.supplier, order.site].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function formatQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export function formatExpectedDate(value: string | null) {
  if (!value) {
    return 'No date set';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${day} ${SHORT_MONTHS[month]} ${year}`;
}

export function getDisplayName(identifier?: string, fallback = 'Supervisor') {
  if (!identifier || !identifier.includes('@')) {
    return fallback;
  }

  const [localPart] = identifier.split('@');
  const name = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return name || fallback;
}

export function getInitials(name: string) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'S';
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function getTodayLabel(date = new Date()) {
  return `${WEEKDAYS[date.getDay()].slice(0, 3)}, ${date.getDate()} ${
    SHORT_MONTHS[date.getMonth()]
  } ${date.getFullYear()}`;
}
