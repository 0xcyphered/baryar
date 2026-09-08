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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, space, radii, shadows, font } from '../theme';
import { getShipment, getShipmentCargo, listShipmentEvents } from '../services/shipmentsApi';
import { hapticLight } from '../utils/haptics';
import type { Shipment, ShipmentEvent, Cargo } from '../types';
import {
  SHIPMENT_STATUS_COLORS,
  SHIPMENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_ICONS,
  MODE_LABELS,
  SPECIAL_LABELS,
  formatCoord,
} from '../utils/constants';

type ParamList = {
  ShipmentDetail: { shipmentId: string };
};

export default function ShipmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { shipmentId?: string };
  const shipmentId = params.shipmentId || '';

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [cargo, setCargo] = useState<Cargo | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, evts] = await Promise.all([
        getShipment(shipmentId),
        listShipmentEvents(shipmentId),
      ]);
      setShipment(s);
      setEvents(evts);
      // Fetch cargo details in parallel too — swallows error silently
      // so the main shipment info still renders.
      getShipmentCargo(shipmentId).then(setCargo).catch(() => {});
      setError(null);
    } catch {
      setError('خطا در بارگیری اطلاعات حمل‌ونقل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      loadData();
    });
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + space[4] }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  if (error || !shipment) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + space[4] }]}>
        <View style={styles.header}>
          <Pressable onPress={() => { hapticLight(); navigation.goBack(); }}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
          </Pressable>
        </View>
        <Text style={styles.errorText}>{error || 'حمل‌ونقل یافت نشد'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }}
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
        <Text style={styles.headerTitle}>جزئیات حمل‌ونقل</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: SHIPMENT_STATUS_COLORS[shipment.status] || COLORS.gray }]}>
          <Text style={styles.statusBadgeText}>{SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}</Text>
        </View>
      </View>

      {/* Cargo info card (plan 037) */}
      <View style={styles.infoCard}>
        {cargo ? (
          <>
            {/* Cargo title */}
            <Text style={styles.cargoTitle}>{cargo.title || 'بار بدون عنوان'}</Text>

            {/* Route row: origin → destination */}
            <View style={styles.routeRow}>
              <Ionicons name="location-outline" size={14} color={COLORS.blue} />
              <Text style={styles.routeText} numberOfLines={1}>
                {formatCoord(cargo.origin)}
              </Text>
              <Ionicons name="arrow-back" size={12} color={COLORS.gray} style={{ marginHorizontal: space[1] }} />
              <Ionicons name="location" size={14} color={COLORS.red} />
              <Text style={styles.routeText} numberOfLines={1}>
                {formatCoord(cargo.destination)}
              </Text>
            </View>

            {/* Dimensions summary */}
            <View style={styles.dimRow}>
              <Text style={styles.dimLabel}>وزن</Text>
              <Text style={styles.dimValue}>{(cargo.dimensions.weightKg / 1000).toFixed(1)} تن</Text>
              <Text style={styles.dimDivider}>·</Text>
              <Text style={styles.dimLabel}>حجم</Text>
              <Text style={styles.dimValue}>{cargo.dimensions.volumeM3} م³</Text>
              <Text style={styles.dimDivider}>·</Text>
              <Text style={styles.dimLabel}>ابعاد</Text>
              <Text style={styles.dimValue}>{cargo.dimensions.lengthCm}×{cargo.dimensions.widthCm}×{cargo.dimensions.heightCm}</Text>
            </View>

            {/* Transport mode + specials */}
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Ionicons name="subway-outline" size={12} color={COLORS.blue} />
                <Text style={styles.tagText}>{MODE_LABELS[cargo.transportMode] || cargo.transportMode}</Text>
              </View>
              {cargo.specialCharacteristics?.map((sc) => (
                <View key={sc} style={[styles.tag, { backgroundColor: COLORS.amberTint }]}>
                  <Text style={[styles.tagText, { color: COLORS.amber }]}>{SPECIAL_LABELS[sc] || sc}</Text>
                </View>
              ))}
            </View>

            {/* Timing */}
            {cargo.pickupAt && (
              <InfoRow label="زمان بارگیری" value={new Date(cargo.pickupAt).toLocaleDateString('fa-IR')} />
            )}
            {cargo.deliverBy && (
              <InfoRow label="زمان تحویل" value={new Date(cargo.deliverBy).toLocaleDateString('fa-IR')} />
            )}
          </>
        ) : (
          /* Fallback: no cargo loaded yet — show IDs */
          <InfoRow label="شناسه بار" value={shipment.cargoId.slice(0, 8) + '...'} />
        )}

        {/* Driver + vehicle IDs (smaller) */}
        <InfoRow label="شناسه راننده" value={shipment.driverUserId.slice(0, 8) + '...'} />
        <InfoRow label="شناسه وسیله" value={shipment.vehicleId.slice(0, 8) + '...'} />
        {shipment.pickupAt && cargo && (
          <InfoRow label="زمان بارگیری" value={new Date(shipment.pickupAt).toLocaleDateString('fa-IR')} />
        )}
        {shipment.deliveredAt && (
          <InfoRow label="زمان تحویل" value={new Date(shipment.deliveredAt).toLocaleDateString('fa-IR')} />
        )}
      </View>

      {/* Event timeline */}
      <Text style={styles.sectionTitle}>تاریخچه رویدادها</Text>
      {events.length === 0 ? (
        <Text style={styles.noEventsText}>هنوز رویدادی ثبت نشده</Text>
      ) : (
        <View style={styles.timeline}>
          {[...events].reverse().map((event, idx) => {
            const isLast = idx === events.length - 1;
            const icon = EVENT_ICONS[event.eventType] || 'ellipse-outline';
            const typeLabel = EVENT_TYPE_LABELS[event.eventType] || event.eventType;
            const dotColor = event.eventType === 'status_change'
              ? COLORS.blue
              : event.eventType === 'customs_stop'
                ? COLORS.amber
                : COLORS.gray;

            return (
              <View key={event.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
                  {!isLast && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Ionicons name={icon as any} size={16} color={dotColor} />
                    <Text style={styles.timelineType}>{typeLabel}</Text>
                  </View>
                  {event.fromStatus && event.toStatus ? (
                    <Text style={styles.timelineStatus}>
                      {SHIPMENT_STATUS_LABELS[event.fromStatus] || event.fromStatus} → {SHIPMENT_STATUS_LABELS[event.toStatus] || event.toStatus}
                    </Text>
                  ) : null}
                  {event.note ? (
                    <Text style={styles.timelineNote}>{event.note}</Text>
                  ) : null}
                  <Text style={styles.timelineTime}>
                    {new Date(event.occurredAt).toLocaleString('fa-IR')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space[2],
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.grayLight,
  },
  label: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.gray,
  },
  value: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
  },
});

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
  statusRow: {
    alignItems: 'center',
    marginBottom: space[3] + 2,
  },
  statusBadge: {
    paddingHorizontal: space[4],
    paddingVertical: space[1] + 2,
    borderRadius: radii.lg,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: font.bold,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: space[4],
    borderRadius: radii.lg,
    paddingHorizontal: space[3] + 2,
    paddingVertical: space[2],
    ...shadows.sm,
  },
  cargoTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
    marginBottom: space[2],
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space[2],
    gap: 4,
  },
  routeText: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textMid,
    flex: 1,
  },
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: space[2],
  },
  dimLabel: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.gray,
  },
  dimValue: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.textDark,
  },
  dimDivider: {
    fontSize: 14,
    color: COLORS.grayLight,
    marginHorizontal: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: space[2],
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radii.sm,
    backgroundColor: COLORS.blueTint,
  },
  tagText: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.blue,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
    marginHorizontal: space[4],
    marginTop: space[5],
    marginBottom: space[3],
  },
  noEventsText: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: space[3],
  },
  timeline: {
    marginHorizontal: space[4],
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 64,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.grayLight,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    marginEnd: space[2],
    paddingBottom: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  timelineType: {
    fontSize: 13,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  timelineStatus: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: 2,
  },
  timelineNote: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.gray,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 14,
    fontFamily: font.regular,
    textAlign: 'center',
    marginTop: 40,
  },
});
