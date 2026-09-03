import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.roles.includes('admin')) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
          <p className="text-lg font-medium text-red-600">فقط مدیران اجازه ورود دارند</p>
          <button
            onClick={() => { localStorage.removeItem('baryar_admin_token'); window.location.href = '/login'; }}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            بازگشت به صفحه ورود
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
