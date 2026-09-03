import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'داشبورد', end: true },
  { to: '/users', icon: Users, label: 'کاربران' },
  { to: '/drivers', icon: Truck, label: 'رانندگان' },
  { to: '/cargo', icon: Package, label: 'بار' },
  { to: '/documents', icon: FileText, label: 'اسناد' },
  { to: '/settings', icon: Settings, label: 'تنظیمات' },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();

  return (
    <aside
      className={`flex h-full flex-col border-l border-gray-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
        {!collapsed && (
          <span className="text-lg font-bold text-gray-800">بَريار</span>
        )}
        <button
          onClick={onToggle}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={collapsed ? 'باز کردن منو' : 'بستن منو'}
        >
          ☰
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-r-2 border-blue-600 bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-3 py-3">
        {!collapsed && user && (
          <p className="mb-2 truncate text-xs text-gray-400">{user.phone}</p>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
        >
          <LogOut size={18} />
          {!collapsed && <span>خروج</span>}
        </button>
      </div>
    </aside>
  );
}
