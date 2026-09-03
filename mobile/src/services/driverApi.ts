import { apiFetch } from './apiClient';
import type { DriverProfile, Vehicle, DriverDocument } from '../types';

interface ProfileResponse { profile: DriverProfile; }
interface VehicleListResponse { vehicles: Vehicle[]; count: number; }
interface VehicleResponse { vehicle: Vehicle; }
interface DocumentListResponse { documents: DriverDocument[]; count: number; }
interface DocumentResponse { document: DriverDocument; }
interface DeleteResponse { ok: true; }

export async function upsertDriverProfile(body: {
  licenseNumber?: string;
  professionalCardNumber?: string;
}): Promise<DriverProfile> {
  const res = await apiFetch<ProfileResponse>('/api/driver/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.profile;
}

export async function getDriverProfile(): Promise<DriverProfile> {
  const res = await apiFetch<ProfileResponse>('/api/driver/profile');
  return res.profile;
}

export async function createVehicle(body: {
  vehicleType: string;
  plate: string;
  capacityWeightKg?: number;
  capacityVolumeM3?: number;
  year?: number | null;
}): Promise<Vehicle> {
  const res = await apiFetch<VehicleResponse>('/api/driver/vehicles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.vehicle;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const res = await apiFetch<VehicleListResponse>('/api/driver/vehicles');
  return res.vehicles;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/driver/vehicles/${id}`, { method: 'DELETE' });
}

export async function createDocument(body: {
  kind: string;
  vehicleId?: string | null;
  storageKey?: string;
  originalName?: string;
  mimeType?: string;
}): Promise<DriverDocument> {
  const res = await apiFetch<DocumentResponse>('/api/driver/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.document;
}

export async function listDocuments(kind?: string): Promise<DriverDocument[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await apiFetch<DocumentListResponse>(`/api/driver/documents${qs}`);
  return res.documents;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/driver/documents/${id}`, { method: 'DELETE' });
}
