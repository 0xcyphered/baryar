import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DriversPage from './pages/DriversPage';
import CargoPage from './pages/CargoPage';
import TripsPage from './pages/TripsPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500">این بخش در پلن‌های بعدی اضافه خواهد شد.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="cargo" element={<CargoPage />} />
            <Route path="trips" element={<TripsPage />} />
            <Route path="documents" element={<Placeholder title="اسناد" />} />
            <Route path="settings" element={<Placeholder title="تنظیمات" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
