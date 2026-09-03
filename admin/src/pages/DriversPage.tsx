import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { AlertCircle, Truck } from 'lucide-react';

interface DriverEntry {
  user: {
    id: string;
    phone: string;
    name: string;
    email: string;
    roles: string[];
    status: string;
    createdAt: string;
  };
  profile: {
    verificationStatus: string;
    licenseNumber: string;
  } | null;
  vehicleCount: number;
}

const PROFILE_BADGES: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

const PROFILE_LABELS: Record<string, string> = {
  approved: 'تأیید شده',
  rejected: 'رد شده',
  pending: 'در انتظار',
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ drivers: DriverEntry[]; count: number }>('/api/admin/drivers')
      .then(({ drivers: d }) => setDrivers(d))
      .catch(() => setError('خطا در دریافت رانندگان'))
      .finally(() => setLoading(false));
  }, []);

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
      <h2 className="text-lg font-bold text-gray-800">رانندگان</h2>

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">نام</th>
                <th className="px-4 py-3">شماره</th>
                <th className="px-4 py-3">وضعیت پروفایل</th>
                <th className="px-4 py-3">وسایل نقلیه</th>
                <th className="px-4 py-3">تاریخ ایجاد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drivers.map((d) => (
                <tr key={d.user.id} className="bg-white">
                  <td className="px-4 py-3 text-gray-700">{d.user.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{d.user.phone}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.profile
                          ? PROFILE_BADGES[d.profile.verificationStatus] || 'bg-gray-100 text-gray-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {d.profile
                        ? PROFILE_LABELS[d.profile.verificationStatus] || d.profile.verificationStatus
                        : 'ثبت‌نام نشده'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Truck size={14} />
                      {d.vehicleCount}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(d.user.createdAt).toLocaleDateString('fa-IR')}
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                    راننده‌ای یافت نشد
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
