import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { listCargoOffers, acceptOffer } from '../services/offersApi';
import type { Offer } from '../types';
import { OFFER_STATUS_COLORS, OFFER_STATUS_LABELS } from '../utils/constants';

type ParamList = {
  Offers: { cargoId: string; cargoTitle: string };
};

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR');
}

export default function OffersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { cargoId?: string; cargoTitle?: string };
  const cargoId = params.cargoId || '';
  const cargoTitle = params.cargoTitle || '';

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    try {
      const data = await listCargoOffers(cargoId);
      setOffers(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری پیشنهادها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cargoId]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      loadOffers();
    });
  }, [loadOffers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOffers();
  }, [loadOffers]);

  const handleAccept = (offerId: string) => {
    Alert.alert('انتخاب پیشنهاد', 'آیا می‌خواهید این پیشنهاد را بپذیرید؟', [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'انتخاب',
        onPress: async () => {
          setAcceptingId(offerId);
          try {
            await acceptOffer(offerId);
            Alert.alert('موفقیت', 'پیشنهاد پذیرفته شد');
            navigation.goBack();
          } catch {
            Alert.alert('خطا', 'پذیرش پیشنهاد ممکن نبود');
          } finally {
            setAcceptingId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>پیشنهادها — {cargoTitle}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.gray} />
              <Text style={styles.emptyText}>هنوز پیشنهادی دریافت نکرده‌اید</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverId}>راننده: {item.driverUserId.slice(0, 8)}...</Text>
                  <Text style={styles.price}>{formatPrice(item.priceRial)} ریال</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: OFFER_STATUS_COLORS[item.status] || '#9ca3af' }]}>
                  <Text style={styles.statusBadgeText}>{OFFER_STATUS_LABELS[item.status] || item.status}</Text>
                </View>
              </View>
              {item.note ? (
                <Text style={styles.noteText}>{item.note}</Text>
              ) : null}
              {item.status === 'pending' && (
                <Pressable
                  style={[styles.acceptButton, acceptingId === item.id && { opacity: 0.5 }]}
                  onPress={() => handleAccept(item.id)}
                  disabled={acceptingId !== null}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                  <Text style={styles.acceptButtonText}>انتخاب</Text>
                </Pressable>
              )}
            </View>
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
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
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
    marginBottom: 4,
  },
  driverId: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  price: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginTop: 4,
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
  noteText: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginTop: 6,
    marginBottom: 8,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    marginTop: 8,
  },
  acceptButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
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
