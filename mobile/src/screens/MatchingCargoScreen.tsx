import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight } from '../utils/haptics';
import EmptyState from '../components/ui/EmptyState';
import { listMatchingCargo } from '../services/matchingApi';
import { listVehicles } from '../services/driverApi';
import type { Cargo, Vehicle } from '../types';
import { MODE_LABELS } from '../utils/constants';

export default function MatchingCargoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [cargo, setCargo] = useState<Cargo[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cargoList, vehicleList] = await Promise.all([
        listMatchingCargo(selectedVehicleId ? { vehicleId: selectedVehicleId } : undefined),
        listVehicles(),
      ]);
      setCargo(cargoList);
      setVehicles(vehicleList);
      setError(null);
    } catch {
      setError('خطا در بارگیری بارها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedVehicleId]);

  useEffect(() => { queueMicrotask(() => { setLoading(true); loadData(); }); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + space[4] }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: Cargo }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      onPress={() => { hapticLight(); navigation.navigate('SubmitOffer', { cargoId: item.id, cargoTitle: item.title }); }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{MODE_LABELS[item.transportMode] || item.transportMode}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || 'بدون عنوان'}</Text>
      </View>

      <View style={styles.routeRow}>
        <Ionicons name="location-outline" size={14} color={COLORS.green} />
        <Text style={styles.routeText} numberOfLines={1}>
          {item.origin.address || 'مبدأ نامشخص'}
        </Text>
        <Ionicons name="arrow-back" size={14} color={COLORS.gray} />
        <Ionicons name="location-outline" size={14} color={COLORS.red} />
        <Text style={styles.routeText} numberOfLines={1}>
          {item.destination.address || 'مقصد نامشخص'}
        </Text>
      </View>

      {item.dimensions.weightKg > 0 && (
        <Text style={styles.cardDetail}>{item.dimensions.weightKg} کیلوگرم</Text>
      )}
    </Pressable>
  );

  const listHeader = (
    <>
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>فهرست بار</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Vehicle filter */}
      {vehicles.length > 0 && (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: 6 }}>
            <Pressable
              style={({ pressed }) => [
                styles.filterChip,
                !selectedVehicleId && styles.filterChipActive,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => { hapticLight(); setSelectedVehicleId(undefined); }}
            >
              <Text style={[styles.filterText, !selectedVehicleId && styles.filterTextActive]}>همه</Text>
            </Pressable>
            {vehicles.map((v) => (
              <Pressable
                key={v.id}
                style={({ pressed }) => [
                  styles.filterChip,
                  selectedVehicleId === v.id && styles.filterChipActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => { hapticLight(); setSelectedVehicleId(v.id); }}
              >
                <Text style={[styles.filterText, selectedVehicleId === v.id && styles.filterTextActive]}>
                  {v.plate}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <FlatList
      data={cargo}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        !error ? (
          <EmptyState
            icon="search-outline"
            title="باری یافت نشد"
            message="بار جدیدی برای پیشنهاد وجود ندارد"
          />
        ) : null
      }
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }}
      onRefresh={onRefresh}
      refreshing={refreshing}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    marginBottom: space[3],
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: font.bold,
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
  filterRow: { marginBottom: space[2] },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: COLORS.white,
    ...shadows.xs,
  },
  filterChipActive: { backgroundColor: COLORS.blue },
  filterText: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.textDark,
  },
  filterTextActive: { color: COLORS.white },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: space[4],
    marginBottom: space[2],
    borderRadius: radii.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  modeBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modeBadgeText: { color: COLORS.white, fontSize: 11, fontFamily: font.medium },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  routeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
  },
  cardDetail: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginTop: 4,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: 'center',
    marginTop: space[5],
  },
});
