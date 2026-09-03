import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/api';
import { AlertCircle } from 'lucide-react';

interface AdminShipment {
  id: string;
  cargoId: string;
  cargoTitle: string;
  cargoMode: string;
  ownerName: string;
  driverName: string;
  status: string;
  pickupAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const STATUS_BADGES: Record<string, string> = {
  assigned: 'bg-yellow-100 text-yellow-700',
  loading: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-green-100 text-green-700',
  at_customs: 'bg-orange-100 text-orange-700',
  delivered: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  assigned: 'تخصیص‌یافته',
  loading: 'بارگیری',
  in_transit: 'در حال انتقال',
  at_customs: 'در گمرک',
  delivered: 'تحویل شده',
  completed: 'تکمیل شده',
  cancelled: 'لغوشده',
};

export default function TripsPage() {
  const [shipments, setShipments] = useState<AdminShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const data = await apiGet<{ shipments: AdminShipment[]; count: number }>(
        `/api/admin/shipments${qs ? `?${qs}` : ''}`
      );
      setShipments(data.shipments);
    } catch {
      setError('خطا در دریافت سفرها');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">سفرها</h2>

      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">فیلتر وضعیت</option>
          <option value="assigned">تخصیص‌یافته</option>
          <option value="loading">بارگیری</option>
          <option value="in_transit">در حال انتقال</option>
          <option value="at_customs">در گمرک</option>
          <option value="delivered">تحویل شده</option>
          <option value="completed">تکمیل شده</option>
          <option value="cancelled">لغوشده</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">بار</th>
                <th className="px-4 py-3">مالک</th>
                <th className="px-4 py-3">راننده</th>
                <th className="px-4 py-3">وضعیت</th>
                <th className="px-4 py-3">بارگیری</th>
                <th className="px-4 py-3">تحویل</th>
                <th className="px-4 py-3">تاریخ ایجاد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipments.map((s) => (
                <tr key={s.id} className="bg-white">
                  <td className="px-4 py-3 text-gray-700">{s.cargoTitle || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.ownerName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{s.driverName || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[s.status] || ''}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.pickupAt ? new Date(s.pickupAt).toLocaleDateString('fa-IR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString('fa-IR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString('fa-IR')}
                  </td>
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                    سفری یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
