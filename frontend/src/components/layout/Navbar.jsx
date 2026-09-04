import { Outlet } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h2 className="text-xl font-bold text-indigo-600">AetherAI</h2>
      <div className="text-gray-500 text-sm">Navbar placeholder</div>
    </nav>
  );
}
