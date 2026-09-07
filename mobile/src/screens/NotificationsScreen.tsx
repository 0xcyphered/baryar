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
import { COLORS, font, radii, shadows, space } from '../theme';
import { listNotifications, markNotificationRead } from '../services/notificationsApi';
import { hapticLight } from '../utils/haptics';
import type { AppNotification } from '../types';
import EmptyState from '../components/ui/EmptyState';

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  shipment_assigned: { icon: 'car', color: COLORS.blue, label: 'سفر جدید' },
  shipment_status: { icon: 'navigate-outline', color: COLORS.blue, label: 'وضعیت سفر' },
  offer_received: { icon: 'hand-left-outline', color: COLORS.amber, label: 'پیشنهاد جدید' },
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
    queueMicrotask(() => { setLoading(true); loadData(); });
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handlePress = async (notif: AppNotification) => {
    hapticLight();
    if (!notif.readAt) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
      } catch { /* ignore */ }
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>اعلان‌ها</Text>
        {notifications.some((n) => !n.readAt) ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {notifications.filter((n) => !n.readAt).length}
            </Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={14} color={COLORS.red} />
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
            <EmptyState
              icon="notifications-off-outline"
              title="اعلانی ندارید"
              message="اعلان‌های جدید اینجا نمایش داده می‌شوند"
            />
          }
          renderItem={({ item }) => {
            const unread = !item.readAt;
            const meta = TYPE_META[item.type];
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  unread && styles.cardUnread,
                  pressed && { opacity: 0.92 },
                ]}
                onPress={() => handlePress(item)}
              >
                {unread && <View style={styles.unreadDot} />}
                {meta ? (
                  <View style={[styles.typeIconBox, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                ) : null}
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {meta ? (
                      <View style={[styles.typeBadge, { backgroundColor: `${meta.color}12` }]}>
                        <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
                  <Text style={styles.cardTime}>{formatTime(item.createdAt)}</Text>
                </View>
                {item.shipmentId || meta ? (
                  <Ionicons name="chevron-back" size={18} color={COLORS.textLight} />
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
    paddingHorizontal: space[4],
    marginBottom: space[3],
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  unreadBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: font.bold,
    color: COLORS.white,
  },
  list: {
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[3],
    marginBottom: space[2],
    ...shadows.xs,
  },
  cardUnread: {
    borderRightWidth: 3,
    borderRightColor: COLORS.blue,
    backgroundColor: COLORS.blueTint,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.blue,
    marginRight: space[2],
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space[3],
  },
  cardContent: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: font.bold,
    color: COLORS.textDark,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontFamily: font.bold,
  },
  cardBody: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    lineHeight: 18,
    marginBottom: 3,
  },
  cardTime: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.textLight,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: space[4],
    marginBottom: space[2],
    backgroundColor: COLORS.redTint,
    borderRadius: radii.md,
    padding: 10,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
  },
});
