import { StatusBar } from 'expo-status-bar';
import {
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_700Bold,
  useFonts,
} from '@expo-google-fonts/vazirmatn';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type BottomSheet from '@gorhom/bottom-sheet';
import { hapticLight, hapticMedium } from './src/utils/haptics';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import OtpRequestScreen from './src/screens/OtpRequestScreen';
import OtpVerifyScreen from './src/screens/OtpVerifyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import CargoListScreen from './src/screens/CargoListScreen';
import CreateCargoScreen from './src/screens/CreateCargoScreen';
import EditCargoScreen from './src/screens/EditCargoScreen';
import CargoDetailScreen from './src/screens/CargoDetailScreen';
import OffersScreen from './src/screens/OffersScreen';
import ShipmentListScreen from './src/screens/ShipmentListScreen';
import ShipmentDetailScreen from './src/screens/ShipmentDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import LocationPickerScreen from './src/screens/LocationPickerScreen';
import DriverOnboardingScreen from './src/screens/DriverOnboardingScreen';
import DriverVehiclesScreen from './src/screens/DriverVehiclesScreen';
import DriverDocumentsScreen from './src/screens/DriverDocumentsScreen';
import MatchingCargoScreen from './src/screens/MatchingCargoScreen';
import SubmitOfferScreen from './src/screens/SubmitOfferScreen';
import DriverOffersScreen from './src/screens/DriverOffersScreen';
import DriverShipmentDetailScreen from './src/screens/DriverShipmentDetailScreen';

import type { MapMode, SegmentDistance, Waypoint } from './src/types';
import {
  computeSegments,
} from './src/utils/distance';
import { formatDistance, toPersianNumber } from './src/utils/persian';
import {
  LOCATION_UNAVAILABLE_MESSAGE,
  useUserLocation,
} from './src/hooks/useUserLocation';
import MapCanvas, { type MapCanvasHandle } from './src/components/MapCanvas';
import SearchBar from './src/components/SearchBar';
import WaypointsSheet from './src/components/WaypointsSheet';
import { COLORS } from './src/theme';

// RTL must be set at module scope, before the app renders.
// Note: forceRTL fully applies after an app restart — first launch may show
// some LTR layout; that is known RN behavior, not a bug.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// One shared counter for waypoints added by map taps AND search selections.
let waypointCounter = 0;

// --- Navigation param lists ---
export type AuthStackParamList = {
  OtpRequest: undefined;
  OtpVerify: { phone: string };
};

export type MainTabParamList = {
  MapTab: undefined;
  CargoTab: undefined;
  DriverTab: undefined;
  ShipmentsTab: undefined;
  NotificationsTab: undefined;
};

export type CargoStackParamList = {
  CargoList: undefined;
  CreateCargo: undefined;
  EditCargo: { cargoId: string };
  CargoDetail: { cargoId: string };
  Offers: { cargoId: string; cargoTitle: string };
  LocationPicker: { mode: 'origin' | 'destination' };
};

export type ShipmentStackParamList = {
  ShipmentList: undefined;
  ShipmentDetail: { shipmentId: string };
};

export type DriverStackParamList = {
  DriverOnboarding: undefined;
  DriverDashboard: undefined;
  DriverVehicles: undefined;
  DriverDocuments: undefined;
  MatchingCargo: undefined;
  SubmitOffer: { cargoId: string; cargoTitle: string };
  DriverOffers: undefined;
  DriverShipmentDetail: { shipmentId: string };
};

export type RootStackParamList = {
  MainTabs: undefined;
  Profile: undefined;
};

// --- Nested stack screens ---

function MapStackScreen() {
  const S = createNativeStackNavigator();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="Map" component={AppRoot} />
    </S.Navigator>
  );
}

function CargoStackScreen() {
  const S = createNativeStackNavigator<CargoStackParamList>();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="CargoList" component={CargoListScreen} />
      <S.Screen name="CreateCargo" component={CreateCargoScreen} />
      <S.Screen name="EditCargo" component={EditCargoScreen} />
      <S.Screen name="CargoDetail" component={CargoDetailScreen} />
      <S.Screen name="Offers" component={OffersScreen} />
      <S.Screen name="LocationPicker" component={LocationPickerScreen} />
    </S.Navigator>
  );
}

function ShipmentStackScreen() {
  const S = createNativeStackNavigator<ShipmentStackParamList>();
  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      <S.Screen name="ShipmentList" component={ShipmentListScreen} />
      <S.Screen name="ShipmentDetail" component={ShipmentDetailScreen} />
    </S.Navigator>
  );
}

// --- Driver dashboard + stack ---

function DriverDashboardScreen({ onNavigate }: { onNavigate: (screen: string, params?: any) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 17, fontFamily: 'Vazirmatn_700Bold', color: COLORS.textDark }}>رانندگی</Text>
      </View>
      <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverOnboarding')}>
        <Ionicons name="person-outline" size={20} color={COLORS.blue} />
        <Text style={dashStyles.cardText}>ویرایش پروفایل راننده</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={dashStyles.card} onPress={() => onNavigate('MatchingCargo')}>
        <Ionicons name="search-outline" size={20} color={COLORS.green} />
        <Text style={dashStyles.cardText}>فهرست بار</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverOffers')}>
        <Ionicons name="pricetag-outline" size={20} color="#f59e0b" />
        <Text style={dashStyles.cardText}>پیشنهادهای من</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverVehicles')}>
        <Ionicons name="car-outline" size={20} color={COLORS.blue} />
        <Text style={dashStyles.cardText}>وسایل نقلیه</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
      <Pressable style={dashStyles.card} onPress={() => onNavigate('DriverDocuments')}>
        <Ionicons name="document-text-outline" size={20} color={COLORS.red} />
        <Text style={dashStyles.cardText}>اسناد</Text>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>
    </ScrollView>
  );
}

const dashStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  cardText: { flex: 1, fontSize: 14, fontFamily: 'Vazirmatn_500Medium', color: COLORS.textDark },
});

function DriverStackScreen() {
  const S = createNativeStackNavigator<DriverStackParamList>();
  const [isDriver, setIsDriver] = useState<boolean | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) setIsDriver(user.roles.includes('driver'));
  }, [user]);

  if (isDriver === null) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator size="large" color={COLORS.blue} />
    </View>;
  }

  return (
    <S.Navigator screenOptions={{ headerShown: false }}>
      {!isDriver ? (
        <S.Screen name="DriverOnboarding">
          {() => (
            <DriverOnboardingScreen onDone={() => setIsDriver(true)} />
          )}
        </S.Screen>
      ) : (
        <>
          <S.Screen name="DriverDashboard">
            {({ navigation }) => (
              <DriverDashboardScreen onNavigate={(screen: string, params?: any) => navigation.navigate(screen as any, params)} />
            )}
          </S.Screen>
          <S.Screen name="DriverOnboarding">
            {() => (
              <DriverOnboardingScreen
                onDone={() => setIsDriver(true)}
              />
            )}
          </S.Screen>
          <S.Screen name="DriverVehicles" component={DriverVehiclesScreen} />
          <S.Screen name="DriverDocuments" component={DriverDocumentsScreen} />
          <S.Screen name="MatchingCargo" component={MatchingCargoScreen} />
          <S.Screen name="SubmitOffer" component={SubmitOfferScreen} />
          <S.Screen name="DriverOffers" component={DriverOffersScreen} />
          <S.Screen name="DriverShipmentDetail" component={DriverShipmentDetailScreen} />
        </>
      )}
    </S.Navigator>
  );
}

// --- Main tab navigator ---

function MainTabs() {
  const Tabs = createBottomTabNavigator<MainTabParamList>();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.blue,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarStyle: { paddingBottom: 4, height: 56 },
        tabBarLabelStyle: { fontFamily: 'Vazirmatn_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="MapTab"
        component={MapStackScreen}
        options={{
          tabBarLabel: 'نقشه',
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="CargoTab"
        component={CargoStackScreen}
        options={{
          tabBarLabel: 'بارها',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="DriverTab"
        component={DriverStackScreen}
        options={{
          tabBarLabel: 'رانندگی',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ShipmentsTab"
        component={ShipmentStackScreen}
        options={{
          tabBarLabel: 'حمل‌ونقل',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'اعلان‌ها',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

// --- Root navigator ---

function AppNavigator() {
  const { user, isLoading } = useAuth();
  const AuthStack = createNativeStackNavigator<AuthStackParamList>();
  const RootStack = createNativeStackNavigator<RootStackParamList>();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  if (!user) {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="OtpRequest">
          {({ navigation }) => (
            <OtpRequestScreen
              onSent={(phone) => navigation.navigate('OtpVerify', { phone })}
            />
          )}
        </AuthStack.Screen>
        <AuthStack.Screen name="OtpVerify">
          {({ navigation, route }) => (
            <OtpVerifyScreen
              phone={route.params.phone}
              onBack={() => navigation.goBack()}
            />
          )}
        </AuthStack.Screen>
      </AuthStack.Navigator>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen name="Profile">
        {({ navigation }) => (
          <ProfileScreen onBack={() => navigation.goBack()} />
        )}
      </RootStack.Screen>
    </RootStack.Navigator>
  );
}

function AppRoot() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [segments, setSegments] = useState<SegmentDistance[]>([]);
  const [mode, setMode] = useState<MapMode>('explore');
  const [locationError, setLocationError] = useState<string | null>(null);
  const { position, request } = useUserLocation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapCanvasHandle | null>(null);
  const sheetRef = useRef<BottomSheet | null>(null);
  const navigation = useNavigation();

  // Google Maps layout: search bar at top, FABs on right side, bottom sheet at bottom.
  const FABS_BOTTOM = insets.bottom + 24;
  const FABS_RIGHT = 16;

  // Toast auto-dismiss (4s), same as the web app.
  useEffect(() => {
    if (!locationError) return;
    const timer = setTimeout(() => setLocationError(null), 4000);
    return () => clearTimeout(timer);
  }, [locationError]);

  // Auto-expand bottom sheet when waypoints are added
  useEffect(() => {
    if (waypoints.length > 0) {
      sheetRef.current?.snapToIndex(1); // snap to 45%
    }
  }, [waypoints.length]);

  const recalcSegments = useCallback(async (wps: Waypoint[]) => {
    if (wps.length < 2) {
      setSegments([]);
      return;
    }
    const segs = await computeSegments(wps);
    setSegments(segs);
  }, []);

  const addWaypoint = useCallback(
    (lat: number, lng: number, address?: string) => {
      waypointCounter += 1;
      const wp: Waypoint = {
        id: `wp-${Date.now()}-${waypointCounter}`,
        lat,
        lng,
        label: toPersianNumber(waypointCounter),
        address,
      };
      const next = [...waypoints, wp];
      setWaypoints(next);
      // Fire-and-forget: the UI never awaits the recalculation.
      void recalcSegments(next);
    },
    [waypoints, recalcSegments]
  );

  const removeWaypoint = useCallback(
    (id: string) => {
      const next = waypoints.filter((wp) => wp.id !== id);
      setWaypoints(next);
      void recalcSegments(next);
    },
    [waypoints, recalcSegments]
  );

  const clearWaypoints = useCallback(() => {
    setWaypoints([]);
    setSegments([]);
  }, []);

  const undoWaypoint = useCallback(() => {
    if (waypoints.length === 0) return;
    const lastId = waypoints[waypoints.length - 1].id;
    removeWaypoint(lastId);
  }, [waypoints, removeWaypoint]);

  const handleWaypointPress = useCallback(
    (id: string) => {
      removeWaypoint(id);
    },
    [removeWaypoint]
  );

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      addWaypoint(lat, lng);
    },
    [addWaypoint]
  );

  const handleSearchSelect = useCallback(
    (lat: number, lng: number) => {
      mapRef.current?.flyTo([lng, lat]);
      if (mode === 'measure') {
        addWaypoint(lat, lng);
      }
    },
    [mode, addWaypoint]
  );

  const handleGpsPress = useCallback(async () => {
    try {
      const loc = position ?? (await request());
      // Fly to the GPS result — it never enters `waypoints`.
      mapRef.current?.flyTo([loc.lng, loc.lat]);
    } catch (e) {
      setLocationError(
        e instanceof Error ? e.message : LOCATION_UNAVAILABLE_MESSAGE
      );
    }
  }, [position, request]);

  const handleCompassPress = useCallback(() => {
    mapRef.current?.resetNorth();
  }, []);

  return (
    <View style={styles.container}>
      {/* 1. Map (fills entire screen) */}
      <MapCanvas
        ref={mapRef}
        waypoints={waypoints}
        segments={segments}
        mode={mode}
        position={position}
        onMapClick={handleMapClick}
        onWaypointPress={handleWaypointPress}
      />

      {/* 2. Search bar — Google Maps style, floating at top */}
      <SearchBar onSelect={handleSearchSelect} />

      {/* 3. Mode chips — centered below search bar, Google Maps style */}
      <View style={[styles.modeChips, { top: insets.top + 68 }]}>
        <Pressable
          style={[styles.chip, mode === 'explore' && styles.chipActive]}
          onPress={() => { hapticLight(); setMode('explore'); }}
        >
          <Ionicons
            name="compass-outline"
            size={16}
            color={mode === 'explore' ? COLORS.white : COLORS.textMid}
          />
          <Text style={[styles.chipText, mode === 'explore' && styles.chipTextActive]}>
            کاوش
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, mode === 'measure' && styles.chipActive]}
          onPress={() => { hapticLight(); setMode('measure'); }}
        >
          <Ionicons
            name="analytics-outline"
            size={16}
            color={mode === 'measure' ? COLORS.white : COLORS.textMid}
          />
          <Text style={[styles.chipText, mode === 'measure' && styles.chipTextActive]}>
            اندازه‌گیری
          </Text>
        </Pressable>
      </View>

      {/* 4. GPS error toast */}
      {locationError ? (
        <View style={[styles.toast, { top: insets.top + 110 }]}>
          <Ionicons name="warning" size={16} color={COLORS.white} />
          <Text style={styles.toastText}>{locationError}</Text>
        </View>
      ) : null}

      {/* 5. FABs — right side, Google Maps position */}
      <View style={[styles.fabs, { bottom: FABS_BOTTOM, right: FABS_RIGHT }]}>
        {waypoints.length > 0 ? (
          <Pressable style={styles.fab} onPress={() => { hapticMedium(); clearWaypoints(); }}>
            <Ionicons name="trash" size={22} color={COLORS.red} />
          </Pressable>
        ) : null}
        <Pressable style={styles.fab} onPress={() => { hapticLight(); handleCompassPress(); }}>
          <Ionicons name="compass" size={22} color={COLORS.textDark} />
        </Pressable>
        <Pressable style={styles.fab} onPress={() => { hapticLight(); void handleGpsPress(); }}>
          <Ionicons name="navigate" size={22} color={COLORS.blue} />
        </Pressable>
        <Pressable style={styles.fab} onPress={() => { hapticLight(); navigation.getParent()?.navigate('Profile'); }}>
          <Ionicons name="person" size={22} color={COLORS.textDark} />
        </Pressable>
      </View>

      {/* 6. Waypoints bottom sheet (replaces the entire sidebar) */}
      <WaypointsSheet
        ref={sheetRef}
        waypoints={waypoints}
        segments={segments}
        onRemove={removeWaypoint}
        onClear={clearWaypoints}
        onUndo={undoWaypoint}
      />

      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Vazirmatn_400Regular,
    Vazirmatn_500Medium,
    Vazirmatn_700Bold,
  });

  if (!fontsLoaded) {
    // Keep the splash up until the fonts are ready.
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // --- Mode chips (Google Maps style, below search bar) ---
  modeChips: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 900,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 36,
  },
  chipActive: {
    backgroundColor: COLORS.blue,
  },
  chipText: {
    color: COLORS.textMid,
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
  },
  chipTextActive: {
    color: COLORS.white,
  },

  // --- Toast ---
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1100,
  },
  toastText: {
    color: COLORS.white,
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    fontFamily: 'Vazirmatn_400Regular',
  },

  // --- FABs (right side, Google Maps position) ---
  fabs: {
    position: 'absolute',
    gap: 12,
    zIndex: 900,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});
