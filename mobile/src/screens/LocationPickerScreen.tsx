import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Map as MapLibreMap,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TEHRAN } from '../theme';

/** Callback registry so the caller can receive the picked location. */
type LocationCallback = (lat: number, lng: number) => void;
const locationCallbacks = new Map<string, LocationCallback>();

export function registerLocationCallback(key: string, cb: LocationCallback): () => void {
  locationCallbacks.set(key, cb);
  return () => locationCallbacks.delete(key);
}

export function triggerLocationCallback(key: string, lat: number, lng: number) {
  locationCallbacks.get(key)?.(lat, lng);
}

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osmTiles', type: 'raster', source: 'osm' }],
};

export default function LocationPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { mode?: 'origin' | 'destination' };
  const mode = params.mode || 'origin';

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);

  const title = mode === 'origin' ? 'انتخاب مبدأ' : 'انتخاب مقصد';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMapPress = (e: any) => {
    const [lng, lat] = e.nativeEvent.lngLat;
    setSelected({ lat, lng });
  };

  const handleConfirm = () => {
    if (!selected) return;
    triggerLocationCallback(mode, selected.lat, selected.lng);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <MapLibreMap
        mapStyle={OSM_STYLE}
        onPress={handleMapPress}
        style={styles.map}
      >
        <Camera initialViewState={{ center: TEHRAN, zoom: 12 }} />
        {selected && (
          <View
            style={[
              styles.marker,
              {
                // Use a ViewAnnotation or simpler approach
              },
            ]}
          />
        )}
      </MapLibreMap>

      {/* Title bar */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.titleText}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom info + confirm button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {selected ? (
          <Text style={styles.coordText}>
            {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
          </Text>
        ) : (
          <Text style={styles.hintText}>روی نقشه ضربه بزنید</Text>
        )}
        <Pressable
          style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!selected}
        >
          <Text style={styles.confirmButtonText}>تأیید</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { flex: 1 },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  titleText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  marker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.red,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
  },
  coordText: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 12,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    marginBottom: 12,
  },
  confirmButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontFamily: 'Vazirmatn_700Bold',
  },
});
