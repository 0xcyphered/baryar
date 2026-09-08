import { apiFetch } from './apiClient';
import type { Shipment, ShipmentEvent, Cargo } from '../types';

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

interface EventResponse { event: ShipmentEvent; }

export async function getShipmentCargo(id: string): Promise<Cargo> {
  const res = await apiFetch<{ cargo: Cargo }>(`/api/shipments/${id}/cargo`);
  return res.cargo;
}

export async function transitionShipment(id: string, toStatus: string): Promise<Shipment> {
  const res = await apiFetch<ShipmentSingleResponse>(`/api/shipments/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: toStatus }),
  });
  return res.shipment;
}

export async function addShipmentEvent(id: string, body: {
  eventType: string;
  note?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
}): Promise<ShipmentEvent> {
  const res = await apiFetch<EventResponse>(`/api/shipments/${id}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.event;
}
