import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight, hapticWarning } from '../utils/haptics';
import EmptyState from '../components/ui/EmptyState';
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
    hapticWarning();
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + space[4] }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  const renderItem = ({ item: offer }: { item: Offer }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.95 }]}
      onPress={() => hapticLight()}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: OFFER_STATUS_COLORS[offer.status] || COLORS.gray }]}>
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
        <Pressable
          style={({ pressed }) => [styles.withdrawButton, pressed && { opacity: 0.85 }]}
          onPress={() => handleWithdraw(offer)}
        >
          <Text style={styles.withdrawText}>لغو پیشنهاد</Text>
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <FlatList
      data={offers}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
            <Text style={styles.headerTitle}>پیشنهادهای من</Text>
            <View style={{ width: 24 }} />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? (
          <EmptyState
            icon="pricetag-outline"
            title="هنوز پیشنهادی ارسال نکرده‌اید"
            message="از فهرست بار، پیشنهاد خود را ثبت کنید"
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
    marginBottom: space[4],
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: font.bold,
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
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
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontFamily: font.bold,
  },
  price: {
    fontSize: 14,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  cargoId: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: 4,
  },
  note: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.gray,
  },
  withdrawButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: COLORS.red,
    alignSelf: 'flex-start',
  },
  withdrawText: {
    color: COLORS.white,
    fontSize: 12,
    fontFamily: font.medium,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: 'center',
    marginTop: space[5],
  },
});
