import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, XCircle, CheckCircle, Clock,
  ShoppingBag, CreditCard, Wifi, WifiOff, Package,
  User, Store, IndianRupee,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersApi } from '../../api/orders';
import { adminApi } from '../../api/admin';
import { useOrderWebSocket } from '../../hooks/useOrderWebSocket';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatOrderId, formatDateTime, formatTimeAgo, formatPaise } from '../../utils/format';
import { ACTIVE_ORDER_STATUSES } from '../../utils/constants';
import type { Order, OrderTimeline } from '../../types';
import { cn } from '../../utils/cn';

const TIMELINE_ICONS: Record<string, React.ReactNode> = {
  placed: <ShoppingBag className="w-4 h-4" />,
  confirmed: <CheckCircle className="w-4 h-4" />,
  preparing: <Clock className="w-4 h-4" />,
  ready: <Package className="w-4 h-4" />,
  picked: <CheckCircle className="w-4 h-4" />,
  picked_up: <CheckCircle className="w-4 h-4" />,
  cancelled: <XCircle className="w-4 h-4" />,
  fraudflagged: <AlertTriangle className="w-4 h-4" />,
};

const ORDERED_STEPS = ['placed', 'confirmed', 'preparing', 'ready', 'picked'];

const STEP_LABELS: Record<string, string> = {
  placed: 'Order Placed',
  confirmed: 'Accepted by Vendor',
  preparing: 'Being Prepared',
  ready: 'Ready for Pickup',
  picked: 'Collected',
  cancelled: 'Cancelled',
  fraudflagged: 'Flagged for Review',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  placed: 'Your order has been received',
  confirmed: 'The vendor confirmed your order',
  preparing: 'Vendor is preparing your items',
  ready: 'Head to the counter for QR pickup',
  picked: 'Order successfully handed over',
  cancelled: 'This order was cancelled',
  fraudflagged: 'This order is under review',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = Number(id);

  const [order, setOrder] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<OrderTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const isActive = order && ACTIVE_ORDER_STATUSES.includes(order.status);
  const { update: wsUpdate, connected: wsConnected } = useOrderWebSocket(isActive ? orderId : null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRes, timelineRes] = await Promise.allSettled([
        ordersApi.getById(orderId),
        ordersApi.getTimeline(orderId),
      ]);

      if (orderRes.status === 'fulfilled' && orderRes.value.data) {
        setOrder(orderRes.value.data);
      } else {
        toast.error('Order not found');
      }

      if (timelineRes.status === 'fulfilled') {
        setTimeline(Array.isArray(timelineRes.value.data) ? timelineRes.value.data : []);
      }
    } catch {
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  useEffect(() => {
    if (wsUpdate && order) {
      setOrder(prev => prev ? { ...prev, status: wsUpdate.status } : null);
    }
  }, [wsUpdate, order]);

  const handleFlagFraud = async () => {
    setActionLoading(true);
    try {
      await adminApi.flagOrderFraud(orderId);
      setOrder(prev => prev ? { ...prev, fraud_flag: true } : null);
      toast.success('Order flagged as fraudulent');
    } catch { toast.error('Failed to flag order'); }
    finally { setActionLoading(false); }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await ordersApi.cancel(orderId);
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : null);
      toast.success('Order cancelled');
    } catch { toast.error('Failed to cancel order'); }
    finally { setActionLoading(false); }
  };

  function OrderStatusStepper({ currentStatus, timeline }: { currentStatus: string; timeline: any[] }) {
    const status = currentStatus.toLowerCase();
    const isCancelled = status === 'cancelled';
    const isFlagged = status === 'fraudflagged' || status === 'fraud_flagged';
    const isTerminal = isCancelled || isFlagged;

    const timestampMap: Record<string, string> = {};
    timeline.forEach((t) => {
      const ev = t.event.toLowerCase().replace(/_/g, '').replace(/forpickup/g, '');
      if (ev.includes('cancel')) timestampMap['cancelled'] = t.timestamp;
      else if (ev.includes('fraud')) timestampMap['fraudflagged'] = t.timestamp;
      else if (ev.includes('place')) timestampMap['placed'] = t.timestamp;
      else if (ev.includes('confirm')) timestampMap['confirmed'] = t.timestamp;
      else if (ev.includes('prepar')) timestampMap['preparing'] = t.timestamp;
      else if (ev.includes('ready')) timestampMap['ready'] = t.timestamp;
      else if (ev.includes('pick')) timestampMap['picked'] = t.timestamp;
    });

    const steps = isTerminal ? [...ORDERED_STEPS, status] : ORDERED_STEPS;
    const currentIndex = isTerminal ? steps.indexOf(status) : ORDERED_STEPS.indexOf(status);

    const formatTs = (iso: string) =>
      new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' });

    return (
      <div className="relative">
        {steps.map((step, index) => {
          const isCompleted = isTerminal ? index < currentIndex : index < currentIndex;
          const isCurrent = step === status;
          const isLast = index === steps.length - 1;
          const ts = timestampMap[step];

          let dotClass = '';
          let labelClass = '';

          if (isCurrent && isCancelled) {
            dotClass = 'bg-red-500 ring-red-200';
            labelClass = 'text-red-700';
          } else if (isCurrent && isFlagged) {
            dotClass = 'bg-amber-500 ring-amber-200';
            labelClass = 'text-amber-700';
          } else if (isCurrent) {
            dotClass = 'bg-[#4F46E5] ring-indigo-200';
            labelClass = 'text-[#4F46E5] font-semibold';
          } else if (isCompleted) {
            dotClass = 'bg-green-500 ring-green-100';
            labelClass = 'text-[#111827]';
          } else {
            dotClass = 'bg-[#E5E7EB] ring-gray-100';
            labelClass = 'text-[#9CA3AF]';
          }

          return (
            <div key={step} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={cn('h-4 w-4 rounded-full ring-4 shrink-0 mt-0.5 transition-all', dotClass)} />
                {!isLast && (
                  <div className={cn('w-0.5 flex-1 min-h-[2rem] mt-1 transition-all', isCompleted ? 'bg-green-400' : 'bg-[#E5E7EB]')} />
                )}
              </div>
              <div className={cn('pb-6', isLast && 'pb-0')}>
                <p className={cn('text-sm font-medium', labelClass)}>
                  {STEP_LABELS[step] || step.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-[#6B7280] mt-0.5">{STEP_DESCRIPTIONS[step] || ''}</p>
                {ts && <p className="text-xs text-[#9CA3AF] mt-1 font-mono">{formatTs(ts)}</p>}
                {isCurrent && !ts && (
                  <span className="inline-flex items-center gap-1 text-xs text-[#4F46E5] mt-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5] animate-pulse" />
                    In progress
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-40 rounded-lg" />
        <div className="skeleton h-48 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="tnt-card text-center py-16">
        <p className="text-[#9CA3AF]">Order not found</p>
        <button onClick={() => navigate('/orders')} className="btn-primary mt-4">Back to Orders</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/orders')} className="btn-ghost">
        <ArrowLeft className="w-4 h-4" /> All Orders
      </button>

      {/* Header */}
      <div className="tnt-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-[#111827] font-mono">
                {formatOrderId(order.id)}
              </h2>
              <StatusBadge type="order" status={order.status} />
              {order.fraud_flag && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                  ⚠ FRAUD FLAGGED
                </span>
              )}
              {isActive && (
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium',
                  wsConnected ? 'bg-green-50 text-green-600' : 'bg-[#F3F5F9] text-[#6B7280]'
                )}>
                  {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {wsConnected ? 'Live tracking' : 'Connecting...'}
                </div>
              )}
            </div>
            <p className="text-sm text-[#6B7280] mt-1">
              Placed {formatTimeAgo(order.created_at)} · {formatDateTime(order.created_at)}
            </p>
          </div>

          {/* Admin Actions */}
          <div className="flex flex-wrap gap-2">
            {!order.fraud_flag && (
              <button onClick={handleFlagFraud} disabled={actionLoading} className="btn-danger">
                <AlertTriangle className="w-4 h-4" /> Flag Fraud
              </button>
            )}
            {ACTIVE_ORDER_STATUSES.includes(order.status) && (
              <button onClick={handleCancel} disabled={actionLoading} className="btn-danger">
                <XCircle className="w-4 h-4" /> Force Cancel
              </button>
            )}
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-[#9CA3AF]" />
            <div>
              <p className="text-[#6B7280] text-xs">Customer</p>
              <p className="text-[#111827] font-medium">{order.user_name || `User #${order.user_id}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Store className="w-4 h-4 text-[#9CA3AF]" />
            <div>
              <p className="text-[#6B7280] text-xs">Vendor</p>
              <p className="text-[#111827] font-medium">{order.vendor_name || `Vendor #${order.vendor_id}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <IndianRupee className="w-4 h-4 text-[#9CA3AF]" />
            <div>
              <p className="text-[#6B7280] text-xs">Amount</p>
              <p className="text-[#111827] font-bold font-mono">₹{(order.total_amount / 100).toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="w-4 h-4 text-[#9CA3AF]" />
            <div>
              <p className="text-[#6B7280] text-xs">Payment</p>
              <p className="text-[#111827] font-medium capitalize">{order.payment_method || 'Razorpay'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Order Timeline */}
        <div className="tnt-card">
          <h3 className="text-sm font-semibold text-[#111827] mb-5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#4F46E5]" />
            Order Timeline
          </h3>
          <OrderStatusStepper currentStatus={order.status} timeline={timeline} />
        </div>

        {/* Order Items + Payment */}
        <div className="space-y-4">
          {/* Items */}
          <div className="tnt-card">
            <h3 className="text-sm font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#4F46E5]" />
              Order Items
            </h3>
            {order.items?.length > 0 ? (
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm py-2 border-b border-[#E5E7EB] last:border-0">
                    <div>
                      <p className="text-[#111827] font-medium">{item.name}</p>
                      <p className="text-xs text-[#9CA3AF]">
                        ₹{(item.unit_price / 100).toFixed(2)} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-mono font-medium text-[#111827]">
                      ₹{((item.unit_price * item.quantity) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                  <span className="font-semibold text-[#111827]">Total</span>
                  <span className="font-bold font-mono text-[#4F46E5] text-lg">
                    ₹{(order.total_amount / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[#6B7280] text-sm">No items data available</p>
            )}
          </div>

          {/* Payment Info */}
          <div className="tnt-card">
            <h3 className="text-sm font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#4F46E5]" />
              Payment Details
            </h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Amount', value: `₹${(order.total_amount / 100).toFixed(2)}` },
                { label: 'Method', value: order.payment_method || 'Razorpay' },
                { label: 'Payment ID', value: order.razorpay_payment_id || 'N/A' },
                { label: 'Fraud Flag', value: order.fraud_flag ? '⚠ Flagged' : 'Clean' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-[#E5E7EB] last:border-0">
                  <span className="text-[#6B7280]">{label}</span>
                  <span className={cn(
                    'font-mono text-xs font-medium',
                    label === 'Fraud Flag' && order.fraud_flag ? 'text-red-600' : 'text-[#111827]'
                  )}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}