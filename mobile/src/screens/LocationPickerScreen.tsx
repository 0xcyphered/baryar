import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Map as MapLibreMap,
  ViewAnnotation,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, TEHRAN, font, radii, shadows, space, textStyles } from '../theme';
import SearchBar from '../components/SearchBar';
import { useUserLocation } from '../hooks/useUserLocation';
import { reverseGeocode } from '../utils/geocoding';
import { toPersianDigits } from '../utils/persian';
import { hapticLight, hapticMedium, hapticSuccess } from '../utils/haptics';

/** Callback registry so the caller can receive the picked location. */
type LocationCallback = (lat: number, lng: number) => void;
const locationCallbacks = new Map<string, LocationCallback>();

export function registerLocationCallback(
  key: string,
  cb: LocationCallback,
): () => void {
  locationCallbacks.set(key, cb);
  return () => locationCallbacks.delete(key);
}

export function triggerLocationCallback(
  key: string,
  lat: number,
  lng: number,
) {
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

  const cameraRef = useRef<CameraRef | null>(null);
  const { request: requestLocation } = useUserLocation();

  const [selected, setSelected] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [address, setAddress] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const title = mode === 'origin' ? 'انتخاب مبدأ' : 'انتخاب مقصد';

  // Reverse geocode when selected changes (debounced 400ms)
  useEffect(() => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    if (!selected) {
      setAddress('');
      return;
    }
    geocodeTimer.current = setTimeout(() => {
      reverseGeocode(selected.lat, selected.lng)
        .then(setAddress)
        .catch(() => setAddress(''));
    }, 400);
    return () => {
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    };
  }, [selected]);

  const handleMapPress = useCallback(
    (e: any) => {
      const [lng, lat] = e.nativeEvent.lngLat;
      setSelected({ lat, lng });
      hapticLight();
      cameraRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 800 });
    },
    [],
  );

  const handleSearchSelect = useCallback((lat: number, lng: number) => {
    setSelected({ lat, lng });
    hapticLight();
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1200 });
  }, []);

  const handleGpsPress = useCallback(async () => {
    hapticMedium();
    setGpsLoading(true);
    try {
      const pos = await requestLocation();
      setSelected({ lat: pos.lat, lng: pos.lng });
      cameraRef.current?.flyTo({
        center: [pos.lng, pos.lat],
        zoom: 14,
        duration: 1200,
      });
    } catch {
      // GPS denied or unavailable — silent
    } finally {
      setGpsLoading(false);
    }
  }, [requestLocation]);

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    hapticSuccess();
    triggerLocationCallback(mode, selected.lat, selected.lng);
    navigation.goBack();
  }, [selected, mode, navigation]);

  return (
    <View style={styles.container}>
      <MapLibreMap
        mapStyle={OSM_STYLE}
        onPress={handleMapPress}
        style={styles.map}
      >
        <Camera ref={cameraRef} initialViewState={{ center: TEHRAN, zoom: 12 }} />

        {/* Visible marker via ViewAnnotation (NOT a plain View) */}
        {selected && (
          <ViewAnnotation id="picker-pin" lngLat={[selected.lng, selected.lat]}>
            <View style={styles.markerPin}>
              <Ionicons name="location" size={20} color={COLORS.white} />
            </View>
          </ViewAnnotation>
        )}
      </MapLibreMap>

      {/* Search bar — floats over the map */}
      <SearchBar onSelect={handleSearchSelect} />

      {/* GPS / current-location FAB — left side (RTL "end") */}
      <Pressable
        style={[styles.gpsFab, { bottom: insets.bottom + 140 }]}
        onPress={handleGpsPress}
        disabled={gpsLoading}
      >
        {gpsLoading ? (
          <ActivityIndicator size="small" color={COLORS.blue} />
        ) : (
          <Ionicons name="navigate" size={22} color={COLORS.blue} />
        )}
      </Pressable>

      {/* Title bar */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            hapticLight();
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.titleText}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom card — address + confirm */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + space[4] },
        ]}
      >
        {address ? (
          <Text style={styles.addressText} numberOfLines={2}>
            {address}
          </Text>
        ) : selected ? (
          <Text style={styles.coordText}>
            {toPersianDigits(selected.lat.toFixed(5))},{' '}
            {toPersianDigits(selected.lng.toFixed(5))}
          </Text>
        ) : (
          <Text style={styles.hintText}>روی نقشه ضربه بزنید</Text>
        )}

        <Pressable
          style={[
            styles.confirmButton,
            !selected && styles.confirmButtonDisabled,
          ]}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  map: {
    flex: 1,
  },

  /* Visible pin marker via ViewAnnotation */
  markerPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.red,
    borderWidth: 3,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },

  /* GPS FAB */
  gpsFab: {
    position: 'absolute',
    left: space[4],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },

  /* Title bar */
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[3],
    paddingBottom: space[2],
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  titleText: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },

  /* Bottom card */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: space[5],
    paddingTop: space[4],
    borderTopRightRadius: radii.xl,
    borderTopLeftRadius: radii.xl,
    alignItems: 'center',
    ...shadows.lg,
  },
  addressText: {
    ...textStyles.body,
    marginBottom: space[3],
    textAlign: 'center',
  },
  coordText: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: space[3],
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    fontFamily: font.regular,
    color: COLORS.gray,
    marginBottom: space[3],
  },
  confirmButton: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: space[10],
    width: '100%',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...textStyles.button,
  },
});
