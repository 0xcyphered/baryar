import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { getCargo, publishCargo, cancelCargo, deleteCargo } from '../services/cargoApi';
import { listShipments } from '../services/shipmentsApi';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
import type { Cargo } from '../types';
import { CARGO_STATUS_COLORS, CARGO_STATUS_LABELS, MODE_LABELS, SPECIAL_LABELS, formatCoord } from '../utils/constants';

type ParamList = {
  CargoDetail: { cargoId: string };
};

export default function CargoDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { cargoId?: string };
  const cargoId = params.cargoId || '';

  const [cargo, setCargo] = useState<Cargo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const loadCargo = useCallback(async () => {
    try {
      const data = await getCargo(cargoId);
      setCargo(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری اطلاعات بار');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cargoId]);

  useEffect(() => {
    queueMicrotask(loadCargo);
  }, [loadCargo]);

  // 048: pull-to-refresh reuses loadCargo — the screen stays visible
  // (the loading gate only covers the first load).
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadCargo();
  }, [loadCargo]);

  const handlePublish = () => {
    hapticLight();
    Alert.alert('انتشار بار', 'آیا می‌خواهید این بار را منتشر کنید؟', [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'انتشار',
        onPress: async () => {
          setActing(true);
          try {
            const updated = await publishCargo(cargoId);
            setCargo(updated);
            hapticSuccess();
          } catch {
            Alert.alert('خطا', 'انتشار بار ممکن نبود');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const handleCancel = () => {
    hapticWarning();
    Alert.alert('لغو بار', 'آیا می‌خواهید این بار را لغو کنید؟', [
      { text: 'بازگشت', style: 'cancel' },
      {
        text: 'لغو',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          try {
            const updated = await cancelCargo(cargoId);
            setCargo(updated);
            hapticSuccess();
          } catch {
            Alert.alert('خطا', 'لغو بار ممکن نبود');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    hapticWarning();
    Alert.alert('حذف بار', 'آیا می‌خواهید این بار را حذف کنید؟', [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          try {
            await deleteCargo(cargoId);
            hapticSuccess();
            navigation.goBack();
          } catch {
            Alert.alert('خطا', 'حذف بار ممکن نبود');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const handleViewShipment = async () => {
    try {
      const shipments = await listShipments({ cargoId });
      if (shipments.length > 0) {
        navigation.navigate('ShipmentDetail' as never, { shipmentId: shipments[0].id } as never);
      } else {
        Alert.alert('خطا', 'حمل‌ونقلی یافت نشد');
      }
    } catch {
      Alert.alert('خطا', 'بارگیری حمل‌ونقل ممکن نبود');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  if (error || !cargo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
          </Pressable>
        </View>
        <Text style={styles.errorText}>{error || 'بار یافت نشد'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[COLORS.blue]}
          tintColor={COLORS.blue}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => { hapticLight(); navigation.goBack(); }}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{cargo.title || 'بدون عنوان'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: CARGO_STATUS_COLORS[cargo.status] || '#9ca3af' }]}>
          <Text style={styles.statusBadgeText}>{CARGO_STATUS_LABELS[cargo.status] || cargo.status}</Text>
        </View>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <InfoRow icon="location-outline" label="مبدأ" value={formatCoord(cargo.origin)} color={COLORS.blue} />
        <InfoRow icon="flag-outline" label="مقصد" value={formatCoord(cargo.destination)} color={COLORS.red} />
        <InfoRow icon="car-outline" label="نوع حمل" value={MODE_LABELS[cargo.transportMode] || cargo.transportMode} />
        {cargo.dimensions.weightKg > 0 && (
          <InfoRow icon="scale-outline" label="وزن" value={`${cargo.dimensions.weightKg} kg`} />
        )}
        {cargo.dimensions.volumeM3 > 0 && (
          <InfoRow icon="cube-outline" label="حجم" value={`${cargo.dimensions.volumeM3} m³`} />
        )}
        {cargo.specialCharacteristics.length > 0 && (
          <InfoRow
            icon="warning-outline"
            label="ویژگی"
            value={cargo.specialCharacteristics.map((s) => SPECIAL_LABELS[s] || s).join('، ')}
          />
        )}
        {cargo.pickupAt && (
          <InfoRow icon="calendar-outline" label="بارگیری" value={new Date(cargo.pickupAt).toLocaleDateString('fa-IR')} />
        )}
        {cargo.deliverBy && (
          <InfoRow icon="calendar-outline" label="تحویل" value={new Date(cargo.deliverBy).toLocaleDateString('fa-IR')} />
        )}
      </View>

      {/* Description */}
      {cargo.description ? (
        <View style={styles.descCard}>
          <Text style={styles.descLabel}>توضیحات</Text>
          <Text style={styles.descText}>{cargo.description}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      {cargo.status === 'draft' && (
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => { hapticLight(); navigation.navigate('EditCargo' as never, { cargoId: cargo.id } as never); }}
          >
            <Ionicons name="pencil-outline" size={18} color={COLORS.blue} />
            <Text style={styles.actionButtonText}>ویرایش</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, acting && { opacity: 0.5 }]}
            onPress={handlePublish}
            disabled={acting}
          >
            <Ionicons name="send-outline" size={18} color={COLORS.green} />
            <Text style={[styles.actionButtonText, { color: COLORS.green }]}>انتشار</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, acting && { opacity: 0.5 }]}
            onPress={handleDelete}
            disabled={acting}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.red} />
            <Text style={[styles.actionButtonText, { color: COLORS.red }]}>حذف</Text>
          </Pressable>
        </View>
      )}

      {cargo.status === 'open' && (
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => { hapticLight(); navigation.navigate('Offers' as never, { cargoId: cargo.id, cargoTitle: cargo.title } as never); }}
          >
            <Ionicons name="list-outline" size={18} color={COLORS.blue} />
            <Text style={styles.actionButtonText}>پیشنهادها</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, acting && { opacity: 0.5 }]}
            onPress={handleCancel}
            disabled={acting}
          >
            <Ionicons name="close-circle-outline" size={18} color={COLORS.red} />
            <Text style={[styles.actionButtonText, { color: COLORS.red }]}>لغو</Text>
          </Pressable>
        </View>
      )}

      {cargo.status === 'matched' && (
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => { hapticLight(); void handleViewShipment(); }}
          >
            <Ionicons name="car-outline" size={18} color={COLORS.blue} />
            <Text style={styles.actionButtonText}>مشاهده حمل‌ونقل</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon as any} size={18} color={color || COLORS.textMid} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.grayLight,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  value: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginTop: 2,
  },
});

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
    marginHorizontal: 8,
  },
  statusRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
  },
  infoCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  descCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
  },
  descLabel: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
    marginBottom: 4,
  },
  descText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
    marginHorizontal: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.blue,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
    marginTop: 40,
  },
});
