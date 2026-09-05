import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { listNotifications, markNotificationRead } from '../services/notificationsApi';
import type { AppNotification } from '../types';

// 029 contract: shipment_* rows carry shipmentId; offer_* rows have shipmentId null and link to the cargo.
const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  shipment_assigned: { icon: 'car', color: COLORS.blue, label: 'سفر جدید' },
  shipment_status: { icon: 'navigate-outline', color: COLORS.blue, label: 'وضعیت سفر' },
  offer_received: { icon: 'hand-left-outline', color: '#f59e0b', label: 'پیشنهاد جدید' },
  offer_rejected: { icon: 'close-circle-outline', color: COLORS.red, label: 'پیشنهاد رد شد' },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'اکنون';
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} روز پیش`;
  return d.toLocaleDateString('fa-IR');
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
      setError(null);
    } catch {
      setError('خطا در بارگیری اعلان‌ها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      loadData();
    });
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handlePress = async (notif: AppNotification) => {
    if (!notif.readAt) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
      } catch {
        // ignore read errors
      }
    }
    if (notif.shipmentId) {
      navigation.navigate('ShipmentDetail' as never, { shipmentId: notif.shipmentId } as never);
      return;
    }
    if (notif.cargoId) {
      navigation.navigate('CargoDetail' as never, { cargoId: notif.cargoId } as never);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>اعلان‌ها</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="notifications-off-outline" size={48} color={COLORS.gray} />
              <Text style={styles.emptyText}>اعلانی ندارید</Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = !item.readAt;
            const meta = TYPE_META[item.type];
            return (
              <Pressable style={[styles.card, unread && styles.cardUnread]} onPress={() => handlePress(item)}>
                {unread && <View style={styles.unreadDot} />}
                {meta ? (
                  <View style={[styles.typeIconBox, { backgroundColor: meta.color }]}>
                    <Ionicons name={meta.icon} size={16} color={COLORS.white} />
                  </View>
                ) : null}
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {meta ? <Text style={styles.typeBadge}>{meta.label}</Text> : null}
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
                  <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
                </View>
                {item.shipmentId || meta ? (
                  <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.blue,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.blue,
    marginRight: 10,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  cardBody: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 4,
    lineHeight: 18,
  },
  cardTime: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  typeIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    fontSize: 10,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.gray,
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    marginTop: 12,
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
  },
});
