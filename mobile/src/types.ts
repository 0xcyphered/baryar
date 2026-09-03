export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  address?: string;
  isUserLocation?: boolean;
}

export interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
}

export interface SegmentDistance {
  from: number;
  to: number;
  /** Straight-line (haversine) distance in meters */
  straight: number;
  /** Road-network distance in meters (from OSRM) */
  routed: number;
  /** GeoJSON LineString coordinates [lng, lat] for the road route */
  routeGeometry: [number, number][];
}

export type MapMode = 'explore' | 'measure';

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  phoneVerifiedAt: string | null;
}

/** Cargo origin / destination for the Cargo model. */
export interface CargoPlace {
  address: string;
  location: { type: 'Point'; coordinates: [number, number] };
}

export interface CargoDimensions {
  weightKg: number;
  volumeM3: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface Cargo {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  transportMode: 'land' | 'sea' | 'air' | 'rail' | 'multimodal';
  origin: CargoPlace;
  destination: CargoPlace;
  dimensions: CargoDimensions;
  specialCharacteristics: string[];
  pickupAt: string | null;
  deliverBy: string | null;
  status: 'draft' | 'open' | 'matched' | 'cancelled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  id: string;
  cargoId: string;
  driverUserId: string;
  vehicleId: string;
  priceRial: number;
  note: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface Shipment {
  id: string;
  cargoId: string;
  offerId: string;
  ownerUserId: string;
  driverUserId: string;
  vehicleId: string;
  status: 'assigned' | 'loading' | 'in_transit' | 'at_customs' | 'delivered' | 'completed' | 'cancelled';
  pickupAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string;
  location: { type: 'Point'; coordinates: [number, number] } | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  shipmentId: string;
  cargoId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}