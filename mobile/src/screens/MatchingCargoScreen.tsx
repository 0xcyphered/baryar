import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { listMatchingCargo } from '../services/matchingApi';
import { listVehicles } from '../services/driverApi';
import type { Cargo, Vehicle } from '../types';

const MODE_LABELS: Record<string, string> = {
  land: 'زمینی',
  sea: 'دریایی',
  air: 'هوایی',
  rail: 'ریلی',
  multimodal: 'ترکیبی',
};

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

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>فهرست بار</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Vehicle filter */}
      {vehicles.length > 0 && (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
            <Pressable
              style={[styles.filterChip, !selectedVehicleId && styles.filterChipActive]}
              onPress={() => setSelectedVehicleId(undefined)}
            >
              <Text style={[styles.filterText, !selectedVehicleId && styles.filterTextActive]}>همه</Text>
            </Pressable>
            {vehicles.map((v) => (
              <Pressable
                key={v.id}
                style={[styles.filterChip, selectedVehicleId === v.id && styles.filterChipActive]}
                onPress={() => setSelectedVehicleId(v.id)}
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

      {cargo.length === 0 && !error ? (
        <Text style={styles.emptyText}>باری برای پیشنهاد یافت نشد</Text>
      ) : (
        cargo.map((item) => (
          <Pressable
            key={item.id}
            style={styles.card}
            onPress={() => navigation.navigate('SubmitOffer', { cargoId: item.id, cargoTitle: item.title })}
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
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
  filterRow: { marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  filterChipActive: { backgroundColor: COLORS.blue },
  filterText: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
  },
  filterTextActive: { color: '#fff' },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  modeBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  modeBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Vazirmatn_500Medium' },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
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
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
  },
  cardDetail: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginTop: 4,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 40,
  },
});
