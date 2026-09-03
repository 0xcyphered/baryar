import { apiFetch } from './apiClient';
import type { Cargo } from '../types';

interface CargoListResponse { cargo: Cargo[]; count: number; }
interface CargoSingleResponse { cargo: Cargo; }
interface DeleteResponse { ok: true }

export async function listCargo(status?: string): Promise<Cargo[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch<CargoListResponse>(`/api/cargo${qs}`);
  return res.cargo;
}

export async function getCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}`);
  return res.cargo;
}

export async function createCargo(body: {
  title?: string;
  description?: string;
  transportMode?: string;
  origin: { address: string; location: { type: 'Point'; coordinates: [number, number] } };
  destination: { address: string; location: { type: 'Point'; coordinates: [number, number] } };
  dimensions?: Record<string, number>;
  specialCharacteristics?: string[];
  pickupAt?: string | null;
  deliverBy?: string | null;
}): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>('/api/cargo', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.cargo;
}

export async function updateCargo(id: string, body: Record<string, unknown>): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.cargo;
}

export async function deleteCargo(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/cargo/${id}`, { method: 'DELETE' });
}

export async function publishCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}/publish`, {
    method: 'POST',
  });
  return res.cargo;
}

export async function cancelCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<CargoSingleResponse>(`/api/cargo/${id}/cancel`, {
    method: 'POST',
  });
  return res.cargo;
}
