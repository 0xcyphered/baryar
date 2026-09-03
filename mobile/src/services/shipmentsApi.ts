import { apiFetch } from './apiClient';
import type { Shipment, ShipmentEvent } from '../types';

interface ShipmentListResponse { shipments: Shipment[]; count: number; }
interface ShipmentSingleResponse { shipment: Shipment; }
interface EventListResponse { events: ShipmentEvent[]; count: number; }

export async function listShipments(params?: { status?: string; cargoId?: string }): Promise<Shipment[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.cargoId) qs.set('cargoId', params.cargoId);
  const query = qs.toString();
  const res = await apiFetch<ShipmentListResponse>(`/api/shipments${query ? '?' + query : ''}`);
  return res.shipments;
}

export async function getShipment(id: string): Promise<Shipment> {
  const res = await apiFetch<ShipmentSingleResponse>(`/api/shipments/${id}`);
  return res.shipment;
}

export async function listShipmentEvents(id: string): Promise<ShipmentEvent[]> {
  const res = await apiFetch<EventListResponse>(`/api/shipments/${id}/events`);
  return res.events;
}
