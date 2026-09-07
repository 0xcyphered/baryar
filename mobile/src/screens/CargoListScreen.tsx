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
import { listCargo } from '../services/cargoApi';
import { hapticLight } from '../utils/haptics';
import type { Cargo } from '../types';
import { CARGO_STATUS_COLORS, CARGO_STATUS_LABELS, MODE_LABELS, formatCoord } from '../utils/constants';
import StatusPill from '../components/ui/StatusPill';
import EmptyState from '../components/ui/EmptyState';

const STATUS_FILTERS = [
  { key: undefined, label: 'همه', icon: null },
  { key: 'draft', label: 'پیش‌نویس', icon: 'document-text-outline' },
  { key: 'open', label: 'باز', icon: 'globe-outline' },
  { key: 'matched', label: 'تطبیق', icon: 'git-merge-outline' },
  { key: 'cancelled', label: 'لغو', icon: 'close-circle-outline' },
  { key: 'completed', label: 'تکمیل', icon: 'checkmark-circle-outline' },
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
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          onPress={() => { hapticLight(); navigation.navigate('CreateCargo' as never); }}
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
        renderItem={({ item }) => {
          const isActive = filter === item.key;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.filterChip,
                isActive && styles.filterChipActive,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => { hapticLight(); setFilter(item.key); }}
            >
              {item.icon ? (
                <Ionicons
                  name={item.icon as any}
                  size={13}
                  color={isActive ? COLORS.white : COLORS.textMid}
                />
              ) : null}
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />

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
          data={cargoes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="هنوز باری ثبت نکرده‌اید"
              message="اولین بار خود را ثبت کنید تا رانندگان پیشنهاد بدهند"
              actionLabel="ایجاد بار"
              onAction={() => navigation.navigate('CreateCargo' as never)}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
              ]}
              onPress={() => {
                hapticLight();
                navigation.navigate('CargoDetail' as never, { cargoId: item.id });
              }}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title || 'بدون عنوان'}
                </Text>
                <StatusPill
                  label={CARGO_STATUS_LABELS[item.status] || item.status}
                  color={CARGO_STATUS_COLORS[item.status] || '#9ca3af'}
                />
              </View>
              <View style={styles.cardRoute}>
                <Ionicons name="location-outline" size={13} color={COLORS.blue} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {formatCoord(item.origin)}
                </Text>
                <Ionicons name="arrow-back" size={12} color={COLORS.gray} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {formatCoord(item.destination)}
                </Text>
                <Ionicons name="flag-outline" size={13} color={COLORS.red} />
              </View>
              <View style={styles.cardMeta}>
                <View style={styles.metaTag}>
                  <Ionicons name="car-outline" size={12} color={COLORS.textLight} />
                  <Text style={styles.metaText}>{MODE_LABELS[item.transportMode] || item.transportMode}</Text>
                </View>
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
    paddingHorizontal: space[4],
    marginBottom: space[2],
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  filterRow: {
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.textMid,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  list: {
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    marginBottom: space[3],
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[2],
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
    flex: 1,
    marginRight: space[2],
  },
  cardRoute: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: space[3],
  },
  routeText: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    maxWidth: 100,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: space[2],
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
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
