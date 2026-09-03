import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { Users, Truck, Package, AlertCircle } from 'lucide-react';

interface Overview {
  users: { total: number; drivers: number; cargoOwners: number; admins: number; blocked: number };
  cargo: { total: number; draft: number; open: number; matched: number; cancelled: number; completed: number };
  offers: { pending: number; accepted: number; rejected: number; withdrawn: number };
  shipments: { active: number; completed: number; cancelled: number };
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
        <Icon size={20} className="text-blue-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<{ overview: Overview }>('/api/admin/overview')
      .then(({ overview: o }) => setOverview(o))
      .catch(() => setError('خطا در دریافت اطلاعات'));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  if (!overview) {
    return <div className="text-sm text-gray-400">در حال بارگذاری...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">داشبورد</h2>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">کاربران</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مجموع کاربران" value={overview.users.total} icon={Users} />
          <StatCard label="رانندگان" value={overview.users.drivers} icon={Truck} />
          <StatCard label="صاحبان بار" value={overview.users.cargoOwners} icon={Package} />
          <StatCard label="مسدود شده" value={overview.users.blocked} icon={AlertCircle} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">بار</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="مجموع" value={overview.cargo.total} icon={Package} />
          <StatCard label="باز" value={overview.cargo.open} icon={Package} />
          <StatCard label="تخصیص‌یافته" value={overview.cargo.matched} icon={Package} />
          <StatCard label="تکمیل‌شده" value={overview.cargo.completed} icon={Package} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-500">سفرها</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="فعال" value={overview.shipments.active} icon={Truck} />
          <StatCard label="تکمیل‌شده" value={overview.shipments.completed} icon={Truck} />
          <StatCard label="لغوشده" value={overview.shipments.cancelled} icon={AlertCircle} />
        </div>
      </section>
    </div>
  );
}
