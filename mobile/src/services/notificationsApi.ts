import { apiFetch } from './apiClient';
import type { AppNotification } from '../types';

interface NotificationListResponse {
  notifications: AppNotification[];
  count: number;
  unreadCount: number;
}

export async function listNotifications(unreadOnly?: boolean): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  const qs = unreadOnly ? '?unread=true' : '';
  const res = await apiFetch<NotificationListResponse>(`/api/notifications${qs}`);
  return { notifications: res.notifications, unreadCount: res.unreadCount };
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
}
