import {
  ApiError,
  listPurchaseOrders,
  type PurchaseOrder,
} from './api';
import type {
  OrderStatus,
  SupervisorOrder,
  SupervisorOrderItem,
} from './supervisor';

const ORDER_STATUS_SET = new Set<string>([
  'open',
  'partially_received',
  'closed',
  'cancelled',
]);

function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value);
}

function mapOrderItem(
  item: PurchaseOrder['items'][number]
): SupervisorOrderItem {
  return {
    id: item.id,
    description: item.description,
    orderedQuantity: item.orderedQuantity,
    receivedQuantity: item.receivedQuantity,
    damagedQuantity: item.damagedQuantity,
  };
}

function mapOrder(order: PurchaseOrder): SupervisorOrder {
  if (!isOrderStatus(order.status)) {
    throw new ApiError({
      code: 'INVALID_ORDER_STATUS',
      message: `The server returned an unsupported order status: ${order.status}.`,
    });
  }

  if (!Array.isArray(order.items)) {
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: `The server returned invalid line items for ${order.poNumber}.`,
    });
  }

  return {
    poNumber: order.poNumber,
    supplier: order.supplier,
    site: order.site,
    expectedDeliveryDate: order.expectedDeliveryDate,
    status: order.status,
    cancelledAt: order.cancelledAt ?? null,
    cancellationReason: order.cancellationReason ?? null,
    items: order.items.map(mapOrderItem),
  };
}

export async function fetchSupervisorOrders(): Promise<SupervisorOrder[]> {
  const orders = await listPurchaseOrders();
  return orders.map(mapOrder);
}
