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