/**
 * groupPaymentService.ts
 * Helpers for storing group order payment data and checking payment status.
 * Frontend-only — no backend changes needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMyOrders } from './orderService';

const GROUP_ORDER_PREFIX = 'tnt_group_order_';

/** Per-member order info returned by the backend place_group_order endpoint. */
export type MemberOrderInfo = {
  member_id: number;
  order_id: number;
  payment_id: number;
  payable_amount: number;
  payment_status: string;
};

/** Shape stored in AsyncStorage so we can look up order IDs on subsequent loads. */
export type GroupOrderStorage = {
  groupId: number;
  orders: MemberOrderInfo[];
  total_amount: number;
  timestamp: number;
};

/** Persist the group-order placement result so we can retrieve order IDs later. */
export async function storeGroupOrderData(
  groupId: number,
  data: Omit<GroupOrderStorage, 'timestamp'>,
): Promise<void> {
  const record: GroupOrderStorage = { ...data, timestamp: Date.now() };
  await AsyncStorage.setItem(`${GROUP_ORDER_PREFIX}${groupId}`, JSON.stringify(record));
}

/** Retrieve previously stored group order data (if any). */
export async function getStoredGroupOrderData(
  groupId: number,
): Promise<GroupOrderStorage | null> {
  try {
    const raw = await AsyncStorage.getItem(`${GROUP_ORDER_PREFIX}${groupId}`);
    if (!raw) return null;
    return JSON.parse(raw) as GroupOrderStorage;
  } catch {
    return null;
  }
}

/** Remove stored group order data (e.g. when group is cancelled or completed). */
export async function clearGroupOrderData(groupId: number): Promise<void> {
  await AsyncStorage.removeItem(`${GROUP_ORDER_PREFIX}${groupId}`);
}

/**
 * Check whether a specific order has been paid by inspecting the current
 * order list. The mock-payment endpoint transitions the order to CONFIRMED
 * on success, so we treat CONFIRMED as "paid".
 */
export async function checkOrderPaymentStatus(
  orderId: number,
): Promise<'paid' | 'unpaid'> {
  try {
    const orders = await getMyOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return 'unpaid';
    // Mock payment sets status to CONFIRMED; in production Razorpay verify does too.
    return order.status === 'confirmed' ? 'paid' : 'unpaid';
  } catch {
    return 'unpaid';
  }
}

/**
 * Batch-check payment status for multiple order IDs.
 * Returns a map of order_id → 'paid' | 'unpaid'.
 */
export async function batchCheckPaymentStatus(
  orderIds: number[],
): Promise<Record<number, 'paid' | 'unpaid'>> {
  const result: Record<number, 'paid' | 'unpaid'> = {};
  if (orderIds.length === 0) return result;

  try {
    const orders = await getMyOrders();
    for (const oid of orderIds) {
      const order = orders.find((o) => o.id === oid);
      result[oid] =
        order && order.status === 'confirmed' ? 'paid' : 'unpaid';
    }
  } catch {
    for (const oid of orderIds) {
      result[oid] = 'unpaid';
    }
  }
  return result;
}
