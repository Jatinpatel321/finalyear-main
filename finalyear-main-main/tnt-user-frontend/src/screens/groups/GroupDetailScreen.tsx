import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import type { RootStackParamList } from '../../types/navigation';
import { Screen } from '../../components/Screen';
import { RoundedCard } from '../../components/RoundedCard';
import { GradientButton } from '../../components/GradientButton';
import { formatMoneyPaise } from '../../utils/format';
import {
  addGroupCartItem,
  getGroup,
  getPaymentSplits,
  inviteMember,
  lockGroupSlot,
  placeGroupOrder,
  removeGroupCartItem,
  setPaymentSplit,
} from '../../services/groupService';
import { toApiError } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'GroupDetail'>;

export function GroupDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { user } = useAuth();
  const groupId = params.groupId;

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [splits, setSplits] = useState<any[]>([]);

  // invite
  const [invitePhone, setInvitePhone] = useState('');
  const [inviting, setInviting] = useState(false);

  // add item
  const [menuItemId, setMenuItemId] = useState('');
  const [quantity, setQuantity] = useState('1');

  // slot
  const [slotId, setSlotId] = useState('');

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [detail, splitList] = await Promise.all([
        getGroup(groupId),
        getPaymentSplits(groupId).catch(() => []),
      ]);
      setGroup(detail);
      setSplits(Array.isArray(splitList) ? splitList : []);
    } catch (e) {
      Alert.alert('Error', toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const isOwner = group?.owner_id === user?.id;
  const members: any[] = group?.members ?? [];
  const cartItems: any[] = group?.cart_items ?? [];
  const slotLock = group?.slot_lock;
  const totalAmount = cartItems.reduce(
    (sum: number, ci: any) => sum + (ci.price_at_time ?? 0) * (ci.quantity ?? 1),
    0,
  );

  // ── Handlers ──

  const onInvite = async () => {
    if (!invitePhone.trim()) return;
    try {
      setInviting(true);
      await inviteMember(groupId, invitePhone.trim());
      setInvitePhone('');
      Alert.alert('Invited!', 'Member added to the group.');
      await reload();
    } catch (e) {
      Alert.alert('Invite failed', toApiError(e).message);
    } finally {
      setInviting(false);
    }
  };

  const onAddItem = async () => {
    if (!menuItemId.trim()) return;
    try {
      await addGroupCartItem(groupId, Number(menuItemId), Number(quantity) || 1);
      setMenuItemId('');
      setQuantity('1');
      await reload();
    } catch (e) {
      Alert.alert('Add failed', toApiError(e).message);
    }
  };

  const onRemoveItem = async (itemId: number) => {
    try {
      await removeGroupCartItem(groupId, itemId);
      await reload();
    } catch (e) {
      Alert.alert('Remove failed', toApiError(e).message);
    }
  };

  const onLockSlot = async () => {
    if (!slotId.trim()) return;
    try {
      await lockGroupSlot(groupId, Number(slotId), 30);
      setSlotId('');
      Alert.alert('Slot locked', 'Pickup slot locked for 30 minutes.');
      await reload();
    } catch (e) {
      Alert.alert('Lock failed', toApiError(e).message);
    }
  };

  const onSetSplit = async (type: string) => {
    try {
      await setPaymentSplit(groupId, { split_type: type });
      Alert.alert('Split updated');
      await reload();
    } catch (e) {
      Alert.alert('Split failed', toApiError(e).message);
    }
  };

  const onPlaceOrder = async () => {
    Alert.alert('Confirm Group Order', `Total: ${formatMoneyPaise(totalAmount * 100)}\nPlace order for all members?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Place Order',
        onPress: async () => {
          try {
            const res = await placeGroupOrder(groupId);
            Alert.alert('Order Placed!', `${res.orders?.length ?? 0} orders created.`);
            await reload();
          } catch (e) {
            Alert.alert('Order failed', toApiError(e).message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#6C63FF" /></View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{group?.name ?? `Group #${groupId}`}</Text>
          <Text style={styles.statusBadge}>
            {(group?.status ?? 'active').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* ── Members ── */}
      <RoundedCard>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          <TouchableOpacity onPress={() => navigation.navigate('InviteMember', { groupId })}>
            <MaterialCommunityIcons name="account-plus" size={24} color="#6C63FF" />
          </TouchableOpacity>
        </View>
        {members.map((m: any) => {
          const u = m.user ?? {};
          return (
            <View key={m.id} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberInitial}>
                  {(u.name ?? u.phone ?? '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{u.name ?? u.phone ?? `User #${m.user_id}`}</Text>
                <Text style={styles.memberRole}>
                  {m.role === 'owner' ? 'Owner' : 'Member'}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Quick inline invite */}
        <View style={styles.inviteRow}>
          <TextInput
            label="Phone number"
            value={invitePhone}
            onChangeText={setInvitePhone}
            mode="outlined"
            style={styles.inviteInput}
            dense
            keyboardType="phone-pad"
          />
          <GradientButton
            label={inviting ? '...' : 'Invite'}
            onPress={onInvite}
            disabled={!invitePhone.trim() || inviting}
            style={styles.inviteBtn}
          />
        </View>
      </RoundedCard>

      {/* ── Shared Cart ── */}
      <RoundedCard>
        <Text style={styles.sectionTitle}>Shared Cart</Text>
        {cartItems.length === 0 ? (
          <Text style={styles.muted}>No items yet. Add items below.</Text>
        ) : (
          cartItems.map((ci: any) => {
            const mi = ci.menu_item ?? {};
            const owner = ci.owner ?? {};
            const isMyItem = ci.owner_id === user?.id;
            return (
              <View key={ci.id} style={styles.cartItemRow}>
                <View style={styles.cartItemIcon}>
                  <MaterialCommunityIcons name="food" size={20} color="#6C63FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{mi.name ?? `Item #${ci.menu_item_id}`}</Text>
                  <Text style={styles.cartItemMeta}>
                    {ci.quantity}x · {formatMoneyPaise((ci.price_at_time ?? 0) * 100)}
                    {' · Added by '}
                    {owner.name ?? owner.phone ?? `User #${ci.owner_id}`}
                  </Text>
                </View>
                {isMyItem && (
                  <TouchableOpacity onPress={() => onRemoveItem(ci.id)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoneyPaise(totalAmount * 100)}</Text>
        </View>
      </RoundedCard>

      {/* ── Add Item ── */}
      <RoundedCard>
        <Text style={styles.sectionTitle}>Add Item</Text>
        <TextInput
          label="Menu Item ID"
          value={menuItemId}
          onChangeText={setMenuItemId}
          mode="outlined"
          style={styles.input}
          dense
          keyboardType="number-pad"
        />
        <TextInput
          label="Quantity"
          value={quantity}
          onChangeText={setQuantity}
          mode="outlined"
          style={styles.input}
          dense
          keyboardType="number-pad"
        />
        <GradientButton label="Add to Shared Cart" onPress={onAddItem} disabled={!menuItemId.trim()} />
      </RoundedCard>

      {/* ── Payment Split ── */}
      <RoundedCard>
        <Text style={styles.sectionTitle}>Payment Split</Text>
        <Text style={styles.muted}>Choose how to split the bill:</Text>
        <View style={styles.splitBtns}>
          <TouchableOpacity style={styles.splitBtn} onPress={() => onSetSplit('equal')}>
            <MaterialCommunityIcons name="scale-balance" size={24} color="#6C63FF" />
            <Text style={styles.splitLabel}>Equal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.splitBtn} onPress={() => onSetSplit('unified')}>
            <MaterialCommunityIcons name="credit-card" size={24} color="#F59E0B" />
            <Text style={styles.splitLabel}>One Pays</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.splitBtn} onPress={() => onSetSplit('custom')}>
            <MaterialCommunityIcons name="pencil-ruler" size={24} color="#22C55E" />
            <Text style={styles.splitLabel}>Custom</Text>
          </TouchableOpacity>
        </View>
        {splits.length > 0 && (
          <View style={styles.splitSummary}>
            {splits.map((s: any, i: number) => (
              <Text key={i} style={styles.splitSummaryText}>
                User #{s.user_id}: {s.split_type}
                {s.amount != null ? ` · ₹${s.amount}` : ''}
              </Text>
            ))}
          </View>
        )}
      </RoundedCard>

      {/* ── Pickup Slot ── */}
      <RoundedCard>
        <Text style={styles.sectionTitle}>Unified Pickup Slot</Text>
        {slotLock ? (
          <View style={styles.slotLockedRow}>
            <MaterialCommunityIcons name="lock-clock" size={24} color="#22C55E" />
            <Text style={styles.slotLockedText}>
              Slot #{slotLock.slot_id} locked until{' '}
              {new Date(slotLock.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              label="Slot ID"
              value={slotId}
              onChangeText={setSlotId}
              mode="outlined"
              style={styles.input}
              dense
              keyboardType="number-pad"
            />
            <GradientButton label="Lock Slot (30 min)" onPress={onLockSlot} disabled={!slotId.trim()} />
          </>
        )}
      </RoundedCard>

      {/* ── Checkout ── */}
      {isOwner && group?.status === 'active' && cartItems.length > 0 && slotLock && (
        <View style={styles.checkoutWrap}>
          <GradientButton label="Place Group Order" onPress={onPlaceOrder} />
        </View>
      )}

      {group?.status === 'ordered' && (
        <RoundedCard style={{ backgroundColor: '#F0FDF4' }}>
          <View style={styles.orderedBanner}>
            <MaterialCommunityIcons name="check-circle" size={28} color="#22C55E" />
            <Text style={styles.orderedText}>Group order has been placed!</Text>
          </View>
        </RoundedCard>
      )}

      <View style={{ height: 40 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10 },
  backBtn: { marginRight: 12 },
  title: { fontSize: 22, fontWeight: '900', color: '#1F2937' },
  statusBadge: { fontSize: 12, fontWeight: '700', color: '#6C63FF', marginTop: 2 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 8 },
  muted: { color: '#9CA3AF', fontSize: 13 },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  memberInitial: { fontSize: 16, fontWeight: '800', color: '#6C63FF' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#374151' },
  memberRole: { fontSize: 12, color: '#9CA3AF' },

  inviteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  inviteInput: { flex: 1, backgroundColor: 'transparent' },
  inviteBtn: { minWidth: 80 },

  cartItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cartItemIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  cartItemName: { fontSize: 14, fontWeight: '700', color: '#374151' },
  cartItemMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#374151' },
  totalValue: { fontSize: 16, fontWeight: '900', color: '#6C63FF' },

  input: { backgroundColor: 'transparent', marginBottom: 10 },

  splitBtns: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  splitBtn: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#F9FAFB' },
  splitLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 4 },
  splitSummary: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  splitSummaryText: { fontSize: 13, color: '#6B7280', marginBottom: 2 },

  slotLockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotLockedText: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 },

  checkoutWrap: { paddingVertical: 14 },

  orderedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderedText: { fontSize: 16, fontWeight: '700', color: '#22C55E' },
});
