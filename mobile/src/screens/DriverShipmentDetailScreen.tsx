import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { getShipment, listShipmentEvents, transitionShipment, addShipmentEvent } from '../services/shipmentsApi';
import type { Shipment, ShipmentEvent } from '../types';
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_COLORS,
  EVENT_TYPE_LABELS,
  EVENT_ICONS,
  formatId,
} from '../utils/constants';

const TRANSITIONS: Record<string, string[]> = {
  assigned: ['loading'],
  loading: ['in_transit'],
  in_transit: ['at_customs', 'delivered'],
  at_customs: ['in_transit'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

const EVENT_TYPES = [
  { value: 'cargo_loaded', label: 'بارگیری' },
  { value: 'driver_departed', label: 'حرکت راننده' },
  { value: 'checkpoint', label: 'نقطه کنترل' },
  { value: 'customs_stop', label: 'توقف گمرک' },
  { value: 'note', label: 'یادداشت' },
];

export default function DriverShipmentDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { shipmentId?: string };
  const shipmentId = params.shipmentId || '';

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event form
  const [eventType, setEventType] = useState('checkpoint');
  const [eventNote, setEventNote] = useState('');
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, evts] = await Promise.all([
        getShipment(shipmentId),
        listShipmentEvents(shipmentId),
      ]);
      setShipment(s);
      setEvents(evts);
      setError(null);
    } catch {
      setError('خطا در بارگیری اطلاعات حمل‌ونقل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shipmentId]);

  useEffect(() => { queueMicrotask(() => { setLoading(true); loadData(); }); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const handleTransition = (nextStatus: string) => {
    Alert.alert('تغییر وضعیت', `آیا مطمئن هستید وضعیت به "${SHIPMENT_STATUS_LABELS[nextStatus]}" تغییر کند؟`, [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'بله',
        onPress: async () => {
          setTransitioning(true);
          try {
            await transitionShipment(shipmentId, nextStatus);
            loadData();
          } catch (err: any) {
            Alert.alert('خطا', err?.error === 'invalid_transition' ? 'تغییر وضعیت مجاز نیست' : 'خطا در تغییر وضعیت');
          } finally {
            setTransitioning(false);
          }
        },
      },
    ]);
  };

  const handleAddEvent = async () => {
    setSubmittingEvent(true);
    try {
      await addShipmentEvent(shipmentId, {
        eventType,
        note: eventNote || undefined,
      });
      setEventNote('');
      loadData();
    } catch {
      Alert.alert('خطا', 'ثبت رویداد با خطا مواجه شد');
    } finally {
      setSubmittingEvent(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  if (error || !shipment) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        </View>
        <Text style={styles.errorText}>{error || 'حمل‌ونقل یافت نشد'}</Text>
      </View>
    );
  }

  const nextStatuses = TRANSITIONS[shipment.status] || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>جزئیات حمل‌ونقل</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: SHIPMENT_STATUS_COLORS[shipment.status] || '#9ca3af' }]}>
          <Text style={styles.statusBadgeText}>{SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}</Text>
        </View>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <InfoRow label="شناسه بار" value={formatId(shipment.cargoId)} />
        <InfoRow label="شناسه پیشنهاد" value={formatId(shipment.offerId)} />
        <InfoRow label="شناسه وسیله" value={formatId(shipment.vehicleId)} />
        {shipment.pickupAt && (
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
                ? '#f59e0b'
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

      {/* Status transition buttons */}
      {nextStatuses.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>تغییر وضعیت</Text>
          <View style={styles.transitionRow}>
            {nextStatuses.map((ns) => (
              <Pressable
                key={ns}
                style={[styles.transitionButton, transitioning && styles.buttonDisabled]}
                onPress={() => handleTransition(ns)}
                disabled={transitioning}
              >
                <Text style={styles.transitionText}>{SHIPMENT_STATUS_LABELS[ns] || ns}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Add event form */}
      <Text style={styles.sectionTitle}>افزودن رویداد</Text>
      <View style={styles.eventForm}>
        <Text style={styles.label}>نوع رویداد</Text>
        <View style={styles.pickerRow}>
          {EVENT_TYPES.map((et) => (
            <Pressable
              key={et.value}
              style={[styles.pickerItem, eventType === et.value && styles.pickerItemActive]}
              onPress={() => setEventType(et.value)}
            >
              <Text style={[styles.pickerText, eventType === et.value && styles.pickerTextActive]}>
                {et.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>یادداشت</Text>
        <TextInput
          style={styles.input}
          value={eventNote}
          onChangeText={setEventNote}
          placeholder="یادداشت رویداد"
          placeholderTextColor={COLORS.gray}
        />

        <Pressable
          style={[styles.eventButton, submittingEvent && styles.buttonDisabled]}
          onPress={handleAddEvent}
          disabled={submittingEvent}
        >
          {submittingEvent ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.eventButtonText}>ثبت رویداد</Text>
          )}
        </Pressable>
      </View>
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
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.grayLight,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  value: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
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
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  noEventsText: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 12,
  },
  timeline: { marginHorizontal: 16 },
  timelineItem: { flexDirection: 'row', minHeight: 64 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: COLORS.grayLight, marginTop: 4 },
  timelineContent: { flex: 1, marginLeft: 8, paddingBottom: 16 },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  timelineType: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  timelineStatus: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 2,
  },
  timelineNote: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
  },
  transitionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
  },
  transitionButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  transitionText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Vazirmatn_700Bold',
  },
  eventForm: {
    marginHorizontal: 16,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    writingDirection: 'rtl',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  pickerItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.grayLight,
  },
  pickerItemActive: { backgroundColor: COLORS.blue },
  pickerText: { fontSize: 12, fontFamily: 'Vazirmatn_500Medium', color: COLORS.textDark },
  pickerTextActive: { color: '#fff' },
  eventButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  eventButtonText: { color: '#fff', fontSize: 14, fontFamily: 'Vazirmatn_700Bold' },
  buttonDisabled: { opacity: 0.6 },
  errorText: {
    color: COLORS.red,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
    marginTop: 40,
  },
});
