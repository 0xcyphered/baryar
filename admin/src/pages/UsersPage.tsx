import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch } from '../lib/api';
import { AlertCircle, ShieldBan, ShieldCheck, Pencil, X, Check } from 'lucide-react';

interface AdminUser {
  id: string;
  phone: string;
  name: string;
  email: string;
  nationalId: string;
  roles: string[];
  status: string;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

const ROLE_BADGES: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  driver: 'bg-green-100 text-green-700',
  cargo_owner: 'bg-gray-100 text-gray-600',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدیر',
  driver: 'راننده',
  cargo_owner: 'صاحب بار',
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editNationalId, setEditNationalId] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('role', roleFilter);
      const qs = params.toString();
      const data = await apiGet<{ users: AdminUser[]; count: number }>(
        `/api/admin/users${qs ? `?${qs}` : ''}`
      );
      setUsers(data.users);
    } catch {
      setError('خطا در دریافت کاربران');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleBlock = async (user: AdminUser) => {
    if (!window.confirm(`آیا از مسدود کردن ${user.phone} اطمینان دارید؟`)) return;
    try {
      await apiPost(`/api/admin/users/${user.id}/block`);
      fetchUsers();
    } catch {
      setError('خطا در مسدود کردن کاربر');
    }
  };

  const handleUnblock = async (user: AdminUser) => {
    if (!window.confirm(`آیا از رفع مسدودی ${user.phone} اطمینان دارید؟`)) return;
    try {
      await apiPost(`/api/admin/users/${user.id}/unblock`);
      fetchUsers();
    } catch {
      setError('خطا در رفع مسدودی کاربر');
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditNationalId(user.nationalId);
  };

  const cancelEdit = () => {
    setEditingUser(null);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    try {
      await apiPatch(`/api/admin/users/${editingUser.id}`, {
        name: editName,
        email: editEmail,
        nationalId: editNationalId,
      });
      setEditingUser(null);
      fetchUsers();
    } catch {
      setError('خطا در ویرایش کاربر');
    }
  };

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
      <h2 className="text-lg font-bold text-gray-800">کاربران</h2>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">فیلتر وضعیت</option>
          <option value="active">فعال</option>
          <option value="blocked">مسدود</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">فیلتر نقش</option>
          <option value="cargo_owner">صاحب بار</option>
          <option value="driver">راننده</option>
          <option value="admin">مدیر</option>
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">شماره</th>
                <th className="px-4 py-3">نام</th>
                <th className="px-4 py-3">ایمیل</th>
                <th className="px-4 py-3">نقش‌ها</th>
                <th className="px-4 py-3">وضعیت</th>
                <th className="px-4 py-3">تاریخ ایجاد</th>
                <th className="px-4 py-3">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="bg-white">
                  <td className="px-4 py-3 text-gray-700">{u.phone}</td>
                  <td className="px-4 py-3 text-gray-700">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGES[r] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {ROLE_LABELS[r] || r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.status === 'active' ? 'فعال' : 'مسدود'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString('fa-IR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {u.status === 'active' ? (
                        <button
                          onClick={() => handleBlock(u)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                          title="مسدود کردن"
                        >
                          <ShieldBan size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnblock(u)}
                          className="rounded p-1 text-green-500 hover:bg-green-50"
                          title="رفع مسدودی"
                        >
                          <ShieldCheck size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(u)}
                        className="rounded p-1 text-blue-500 hover:bg-blue-50"
                        title="ویرایش"
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">
                    کاربری یافت نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline Edit Form */}
      {editingUser && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-blue-800">ویرایش کاربر {editingUser.phone}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">نام</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">ایمیل</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">کد ملی</label>
              <input
                type="text"
                value={editNationalId}
                onChange={(e) => setEditNationalId(e.target.value)}
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
