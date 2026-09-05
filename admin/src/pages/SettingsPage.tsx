import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../lib/api';
import { AlertCircle, Check } from 'lucide-react';

interface Settings {
  platformName: string;
  supportPhone: string;
  defaultCurrency: string;
  maxActiveCargoPerOwner: number;
  maintenanceMode: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  platformName: '',
  supportPhone: '',
  defaultCurrency: 'IRR',
  maxActiveCargoPerOwner: 20,
  maintenanceMode: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<{ settings: Settings }>('/api/admin/settings');
      setSettings(data.settings);
    } catch {
      setError('خطا در دریافت تنظیمات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      const data = await apiPut<{ settings: Settings }>('/api/admin/settings', {
        platformName: settings.platformName,
        supportPhone: settings.supportPhone,
        defaultCurrency: settings.defaultCurrency,
        maxActiveCargoPerOwner: settings.maxActiveCargoPerOwner,
        maintenanceMode: settings.maintenanceMode,
      });
      setSettings(data.settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  if (error && loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-gray-800">تنظیمات</h2>
        {settings.maintenanceMode && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            حالت تعمیر فعال است
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">در حال بارگذاری...</div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">نام پلتفرم</label>
            <input
              type="text"
              value={settings.platformName}
              onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">تلفن پشتیبانی</label>
            <input
              type="tel"
              value={settings.supportPhone}
              onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">واحد پول پیش‌فرض</label>
            <input
              type="text"
              value={settings.defaultCurrency}
              onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">حداکثر بار فعال هر مالک</label>
            <input
              type="number"
              min={0}
              value={settings.maxActiveCargoPerOwner}
              onChange={(e) =>
                setSettings({ ...settings, maxActiveCargoPerOwner: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => {
                  if (e.target.checked && !settings.maintenanceMode) {
                    const ok = window.confirm(
                      'با فعال‌سازی حالت تعمیر، همه کاربران غیرمدیر از ثبت و ویرایش منع می‌شوند. ادامه؟'
                    );
                    if (!ok) return;
                  }
                  setSettings({ ...settings, maintenanceMode: e.target.checked });
                }}
                className="h-4 w-4 rounded border-gray-300"
              />
              حالت تعمیر و نگهداری
            </label>
          </div>
          <p className="text-xs text-gray-500">
            حالت تعمیر و نگهداری: در این حالت کاربران عادی امکان استفاده از پلتفرم را نخواهند داشت.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-600">
              <Check size={16} />
              تنظیمات ذخیره شد
            </div>
          )}

          <div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={14} />
              {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
