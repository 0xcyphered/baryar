import { apiFetch } from './apiClient';
import type { Cargo, Offer } from '../types';

interface CargoListResponse { cargo: Cargo[]; count: number; }
interface OfferListResponse { offers: Offer[]; count: number; }
interface OfferResponse { offer: Offer; }
interface DeleteResponse { ok: true; }

export async function listMatchingCargo(params?: {
  vehicleId?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<Cargo[]> {
  const qs = new URLSearchParams();
  if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
  if (params?.lat !== undefined) qs.set('lat', String(params.lat));
  if (params?.lng !== undefined) qs.set('lng', String(params.lng));
  if (params?.radiusKm !== undefined) qs.set('radiusKm', String(params.radiusKm));
  const query = qs.toString();
  const res = await apiFetch<CargoListResponse>(`/api/matching/cargo${query ? '?' + query : ''}`);
  return res.cargo;
}

export async function createOffer(body: {
  cargoId: string;
  vehicleId: string;
  priceRial: number;
  note?: string;
}): Promise<Offer> {
  const res = await apiFetch<OfferResponse>('/api/offers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.offer;
}

export async function listMyOffers(): Promise<Offer[]> {
  const res = await apiFetch<OfferListResponse>('/api/offers');
  return res.offers;
}

export async function withdrawOffer(id: string): Promise<void> {
  await apiFetch<DeleteResponse>(`/api/offers/${id}`, { method: 'DELETE' });
}
