import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" dir="rtl">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
