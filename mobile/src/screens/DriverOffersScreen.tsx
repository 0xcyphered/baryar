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
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { listMyOffers, withdrawOffer } from '../services/matchingApi';
import type { Offer } from '../types';
import { OFFER_STATUS_LABELS, OFFER_STATUS_COLORS, formatId } from '../utils/constants';

export default function DriverOffersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await listMyOffers();
      setOffers(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری پیشنهادها');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { setLoading(true); loadData(); }); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const handleWithdraw = (offer: Offer) => {
    Alert.alert('لغو پیشنهاد', 'آیا از لغو این پیشنهاد مطمئن هستید؟', [
      { text: 'خیر', style: 'cancel' },
      {
        text: 'بله',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdrawOffer(offer.id);
            loadData();
          } catch {
            Alert.alert('خطا', 'لغو پیشنهاد با خطا مواجه شد');
          }
        },
      },
    ]);
  };

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
        <Text style={styles.headerTitle}>پیشنهادهای من</Text>
        <View style={{ width: 24 }} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {offers.length === 0 && !error ? (
        <Text style={styles.emptyText}>هنوز پیشنهادی ارسال نکرده‌اید</Text>
      ) : (
        offers.map((offer) => (
          <View key={offer.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.statusBadge, { backgroundColor: OFFER_STATUS_COLORS[offer.status] || '#9ca3af' }]}>
                <Text style={styles.statusBadgeText}>{OFFER_STATUS_LABELS[offer.status] || offer.status}</Text>
              </View>
              <Text style={styles.price}>{offer.priceRial.toLocaleString('fa-IR')} ریال</Text>
            </View>

            <Text style={styles.cargoId}>بار: {formatId(offer.cargoId)}</Text>

            {offer.note ? <Text style={styles.note}>{offer.note}</Text> : null}

            <Text style={styles.date}>
              {new Date(offer.createdAt).toLocaleDateString('fa-IR')}
            </Text>

            {offer.status === 'pending' && (
              <Pressable style={styles.withdrawButton} onPress={() => handleWithdraw(offer)}>
                <Text style={styles.withdrawText}>لغو پیشنهاد</Text>
              </Pressable>
            )}
          </View>
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
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
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Vazirmatn_700Bold',
  },
  price: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  cargoId: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 4,
  },
  note: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  withdrawButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.red,
    alignSelf: 'flex-start',
  },
  withdrawText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
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
