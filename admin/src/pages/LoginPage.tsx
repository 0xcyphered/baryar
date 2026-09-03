import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiPost } from '../lib/api';
import { Send, LogIn, Loader2 } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: 'شماره تلفن نامعتبر',
  otp_cooldown: 'لطفاً ۶۰ ثانیه صبر کنید',
  otp_invalid: 'کد نادرست است',
  otp_locked: 'قفل شده — بعداً تلاش کنید',
  account_blocked: 'حساب شما مسدود شده',
  forbidden: 'فقط مدیران اجازه ورود دارند',
  unauthorized: 'کد نادرست است',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);

  const handleSendCode = useCallback(async () => {
    setError('');
    setSending(true);
    try {
      await apiPost('/api/auth/request-otp', { phone });
      setPhase('code');
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const e = err as { error?: string };
      setError(ERROR_MESSAGES[e.error ?? ''] || 'خطای سرور');
    } finally {
      setSending(false);
    }
  }, [phone]);

  const handleLogin = useCallback(async () => {
    setError('');
    setLogging(true);
    try {
      await login(phone, code);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const e = err as { error?: string };
      setError(ERROR_MESSAGES[e.error ?? ''] || 'خطای سرور');
    } finally {
      setLogging(false);
    }
  }, [phone, code, login, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg border border-gray-200">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800">بَريار</h1>
          <p className="mt-1 text-sm text-gray-500">ورود مدیریت</p>
        </div>

        {phase === 'phone' ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                شماره موبایل
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09121234567"
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-left text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={sending || !phone}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              ارسال کد تایید
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                کد تایید ۶ رقمی
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="۱۲۳۴۵۶"
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-lg tracking-[0.3em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleLogin}
              disabled={logging || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {logging ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              ورود
            </button>
            <button
              onClick={() => { setPhase('phone'); setCode(''); setError(''); }}
              disabled={cooldown > 0}
              className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {cooldown > 0 ? `ارسال مجدد کد (${cooldown}s)` : 'تغییر شماره / ارسال مجدد'}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
