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
import { listShipments } from '../services/shipmentsApi';
import { hapticLight } from '../utils/haptics';
import type { Shipment } from '../types';
import { SHIPMENT_STATUS_COLORS, SHIPMENT_STATUS_LABELS } from '../utils/constants';

const FILTERS = [
  { key: undefined, label: 'همه' },
  { key: 'loading', label: 'بارگیری' },
  { key: 'in_transit', label: 'حمل' },
  { key: 'at_customs', label: 'گمرک' },
  { key: 'delivered', label: 'تحویل' },
  { key: 'completed', label: 'تکمیل' },
] as const;

export default function ShipmentListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShipments = useCallback(async () => {
    try {
      const data = await listShipments(filter ? { status: filter } : undefined);
      setShipments(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری حمل‌ونقل‌ها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      loadShipments();
    });
  }, [loadShipments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadShipments();
  }, [loadShipments]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>حمل‌ونقل‌ها</Text>
      </View>

      {/* Plan 040: §1 user-mode keeps "submitting transport requests"
          reachable from this tab (opens CreateCargo in this stack). */}
      <Pressable
        style={({ pressed }) => [styles.newRequestCta, pressed && { opacity: 0.92 }]}
        onPress={() => {
          hapticLight();
          navigation.navigate('CreateCargo' as never);
        }}
      >
        <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
        <Text style={styles.newRequestCtaText}>ثبت درخواست حمل</Text>
      </Pressable>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(item) => String(item.key ?? 'all')}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="car-outline" size={48} color={COLORS.gray} />
              <Text style={styles.emptyText}>هنوز حمل‌ونقلی ندارید</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('ShipmentDetail' as never, { shipmentId: item.id } as never)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cargoId}>بار: {item.cargoId.slice(0, 8)}...</Text>
                <View style={[styles.statusBadge, { backgroundColor: SHIPMENT_STATUS_COLORS[item.status] || '#9ca3af' }]}>
                  <Text style={styles.statusBadgeText}>{SHIPMENT_STATUS_LABELS[item.status] || item.status}</Text>
                </View>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  {new Date(item.createdAt).toLocaleDateString('fa-IR')}
                </Text>
                {item.pickupAt && (
                  <Text style={styles.metaText}>
                    بارگیری: {new Date(item.pickupAt).toLocaleDateString('fa-IR')}
                  </Text>
                )}
                {item.deliveredAt && (
                  <Text style={styles.metaText}>
                    تحویل: {new Date(item.deliveredAt).toLocaleDateString('fa-IR')}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
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
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  newRequestCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 12,
  },
  newRequestCtaText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.white,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray,
  },
  filterChipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cargoId: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Vazirmatn_500Medium',
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
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
