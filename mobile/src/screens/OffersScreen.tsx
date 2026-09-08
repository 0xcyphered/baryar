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
import { COLORS, shadows } from '../theme';
import { listCargoOffers, acceptOffer } from '../services/offersApi';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import type { Offer } from '../types';
import { OFFER_STATUS_COLORS, OFFER_STATUS_LABELS } from '../utils/constants';
import EmptyState from '../components/ui/EmptyState';

type ParamList = {
  Offers: { cargoId: string; cargoTitle: string };
};

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR');
}

/** 048: driver display name — the payload has no driver summary yet
 *  (publicOffer sends driverUserId only), so fall back to a short id. */
function driverDisplayName(offer: Offer): string {
  return offer.driver?.name || offer.driver?.phone || `#${offer.driverUserId.slice(0, 6)}…`;
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
    hapticLight();
    Alert.alert('انتخاب پیشنهاد', 'آیا می‌خواهید این پیشنهاد را بپذیرید؟', [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'انتخاب',
        onPress: async () => {
          setAcceptingId(offerId);
          try {
            await acceptOffer(offerId);
            hapticSuccess();
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
        <Pressable onPress={() => { hapticLight(); navigation.goBack(); }}>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.blue]}
              tintColor={COLORS.blue}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="hand-left-outline"
              title="هنوز پیشنهادی دریافت نکرده‌اید"
              message="پس از ثبت اولین پیشنهاد راننده، اینجا نمایش داده می‌شود"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverId}>راننده: {driverDisplayName(item)}</Text>
                  <Text style={styles.price}>{formatPrice(item.priceRial)} ریال</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: OFFER_STATUS_COLORS[item.status] || COLORS.gray }]}>
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
    ...shadows.sm,
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
    marginStart: 8,
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
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.redTint,
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
