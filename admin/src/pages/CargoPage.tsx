import { useState, useEffect, useCallback, Fragment } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { AlertCircle, ChevronDown, ChevronUp, Pencil, X, Check, Ban } from 'lucide-react';

interface AdminCargo {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  transportMode: string;
  origin: { placeName?: string; address?: string; location?: { coordinates: number[] } };
  destination: { placeName?: string; address?: string; location?: { coordinates: number[] } };
  dimensions: { weightKg: number; volumeM3: number; lengthCm: number; widthCm: number; heightCm: number };
  specialCharacteristics: string[];
  pickupAt: string | null;
  deliverBy: string | null;
  status: string;
  createdAt: string;
}

const MODE_BADGES: Record<string, string> = {
  land: 'bg-blue-100 text-blue-700',
  sea: 'bg-cyan-100 text-cyan-700',
  air: 'bg-purple-100 text-purple-700',
  rail: 'bg-orange-100 text-orange-700',
  multimodal: 'bg-pink-100 text-pink-700',
};

const MODE_LABELS: Record<string, string> = {
  land: 'زمینی',
  sea: 'دریایی',
  air: 'هوایی',
  rail: 'ریلی',
  multimodal: 'چندوجهی',
};

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  matched: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  open: 'باز',
  matched: 'تخصیص‌یافته',
  cancelled: 'لغوشده',
  completed: 'تکمیل‌شده',
};

function formatLocation(loc: AdminCargo['origin']): string {
  if (loc.placeName) return loc.placeName;
  if (loc.address) return loc.address;
  if (loc.location?.coordinates) return `(${loc.location.coordinates[1]}, ${loc.location.coordinates[0]})`;
  return '—';
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CargoPage() {
  const [cargo, setCargo] = useState<AdminCargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingCargo, setEditingCargo] = useState<AdminCargo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPickupAt, setEditPickupAt] = useState('');
  const [editDeliverBy, setEditDeliverBy] = useState('');

  const fetchCargo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const data = await apiGet<{ cargo: AdminCargo[]; count: number }>(
        `/api/admin/cargo${qs ? `?${qs}` : ''}`
      );
      setCargo(data.cargo);
    } catch {
      setError('خطا در دریافت بارها');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchCargo(); }, [fetchCargo]);

  const handleCancel = async (c: AdminCargo) => {
    if (!window.confirm('آیا از لغو این بار اطمینان دارید؟')) return;
    try {
      await apiPost(`/api/admin/cargo/${c.id}/cancel`);
      fetchCargo();
    } catch {
      setError('خطا در لغو بار');
    }
  };

  const startEdit = (c: AdminCargo) => {
    setEditingCargo(c);
    setEditTitle(c.title);
    setEditDescription(c.description);
    setEditPickupAt(toDatetimeLocal(c.pickupAt));
    setEditDeliverBy(toDatetimeLocal(c.deliverBy));
  };

  const cancelEdit = () => {
    setEditingCargo(null);
  };

  const saveEdit = async () => {
    if (!editingCargo) return;
    try {
      await apiPatch(`/api/admin/cargo/${editingCargo.id}`, {
        title: editTitle,
        description: editDescription,
        pickupAt: editPickupAt || null,
        deliverBy: editDeliverBy || null,
      });
      setEditingCargo(null);
      fetchCargo();
    } catch {
      setError('خطا در ویرایش بار');
    }
  };

  const canModify = (s: string) => ['draft', 'open', 'matched'].includes(s);

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
      <h2 className="text-lg font-bold text-gray-800">بار</h2>

      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">فیلتر وضعیت</option>
          <option value="draft">پیش‌نویس</option>
          <option value="open">باز</option>
          <option value="matched">تخصیص‌یافته</option>
          <option value="cancelled">لغوشده</option>
          <option value="completed">تکمیل‌شده</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3"></th>
                <th className="px-4 py-3">عنوان</th>
                <th className="px-4 py-3">مالک</th>
                <th className="px-4 py-3">نوع</th>
                <th className="px-4 py-3">وضعیت</th>
                <th className="px-4 py-3">بارگیری</th>
                <th className="px-4 py-3">تحویل</th>
                <th className="px-4 py-3">تاریخ ایجاد</th>
                <th className="px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargo.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    className="cursor-pointer bg-white hover:bg-gray-50"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-3">
                      {expandedId === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.title}</td>
                    <td className="px-4 py-3 text-gray-500">{c.ownerUserId.slice(0, 8)}...</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MODE_BADGES[c.transportMode] || ''}`}>
                        {MODE_LABELS[c.transportMode] || c.transportMode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[c.status] || ''}`}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.pickupAt ? new Date(c.pickupAt).toLocaleDateString('fa-IR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.deliverBy ? new Date(c.deliverBy).toLocaleDateString('fa-IR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString('fa-IR')}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {canModify(c.status) && (
                          <>
                            <button
                              onClick={() => startEdit(c)}
                              className="rounded p-1 text-blue-500 hover:bg-blue-50"
                              title="ویرایش"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => handleCancel(c)}
                              className="rounded p-1 text-red-500 hover:bg-red-50"
                              title="لغو"
                            >
                              <Ban size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50 px-8 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-600">توضیحات:</span>{' '}
                            {c.description || '—'}
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">مبدأ:</span>{' '}
                            {formatLocation(c.origin)}
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">مقصد:</span>{' '}
                            {formatLocation(c.destination)}
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">ابعاد:</span>{' '}
                            {c.dimensions.weightKg} kg / {c.dimensions.volumeM3} m³
                          </div>
                          {c.specialCharacteristics.length > 0 && (
                            <div>
                              <span className="font-medium text-gray-600">ویژگی‌ها:</span>{' '}
                              {c.specialCharacteristics.join(', ')}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {cargo.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-400">
                    باری یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline Edit Form */}
      {editingCargo && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-blue-800">ویرایش بار: {editingCargo.title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">عنوان</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">توضیحات</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">زمان بارگیری</label>
              <input
                type="datetime-local"
                value={editPickupAt}
                onChange={(e) => setEditPickupAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">زمان تحویل</label>
              <input
                type="datetime-local"
                value={editDeliverBy}
                onChange={(e) => setEditDeliverBy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              <Check size={14} />
              ذخیره
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <X size={14} />
              انصراف
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
