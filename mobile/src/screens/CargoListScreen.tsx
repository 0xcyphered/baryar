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
import { listCargo } from '../services/cargoApi';
import type { Cargo } from '../types';
import { CARGO_STATUS_COLORS, CARGO_STATUS_LABELS, MODE_LABELS, formatCoord } from '../utils/constants';

const STATUS_FILTERS = [
  { key: undefined, label: 'همه' },
  { key: 'draft', label: 'پیش‌نویس' },
  { key: 'open', label: 'باز' },
  { key: 'matched', label: 'تطبیق‌یافته' },
  { key: 'cancelled', label: 'لغو‌شده' },
  { key: 'completed', label: 'تکمیل‌شده' },
] as const;

export default function CargoListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [cargoes, setCargoes] = useState<Cargo[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCargoes = useCallback(async () => {
    try {
      const data = await listCargo(filter);
      setCargoes(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری بارها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      loadCargoes();
    });
  }, [loadCargoes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCargoes();
  }, [loadCargoes]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>بارهای من</Text>
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('CreateCargo' as never)}
        >
          <Ionicons name="add" size={26} color={COLORS.white} />
        </Pressable>
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={STATUS_FILTERS}
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

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={cargoes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={48} color={COLORS.gray} />
              <Text style={styles.emptyText}>هنوز باری ثبت نکرده‌اید</Text>
              <Pressable
                style={styles.emptyButton}
                onPress={() => navigation.navigate('CreateCargo' as never)}
              >
                <Text style={styles.emptyButtonText}>ایجاد بار</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('CargoDetail' as never, { cargoId: item.id })}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.title || 'بدون عنوان'}</Text>
                <View style={[styles.statusBadge, { backgroundColor: CARGO_STATUS_COLORS[item.status] || '#9ca3af' }]}>
                  <Text style={styles.statusBadgeText}>{CARGO_STATUS_LABELS[item.status] || item.status}</Text>
                </View>
              </View>
              <Text style={styles.cardRoute}>
                {formatCoord(item.origin)} → {formatCoord(item.destination)}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>{MODE_LABELS[item.transportMode] || item.transportMode}</Text>
                <Text style={styles.metaText}>{new Date(item.createdAt).toLocaleDateString('fa-IR')}</Text>
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
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
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
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Vazirmatn_700Bold',
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
  cardRoute: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 6,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
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
