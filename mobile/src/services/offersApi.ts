import { apiFetch } from './apiClient';
import type { Offer, Cargo } from '../types';

interface OfferListResponse { offers: Offer[]; count: number; }
interface AcceptResponse { offer: Offer; cargo: Cargo; }

export async function listCargoOffers(cargoId: string): Promise<Offer[]> {
  const res = await apiFetch<OfferListResponse>(`/api/offers/cargo/${cargoId}/offers`);
  return res.offers;
}

export async function acceptOffer(offerId: string): Promise<{ offer: Offer; cargo: Cargo }> {
  const res = await apiFetch<AcceptResponse>(`/api/offers/${offerId}/accept`, {
    method: 'POST',
  });
  return res;
}
