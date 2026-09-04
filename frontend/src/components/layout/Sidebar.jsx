import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Play,
  Settings,
  Plus,
  BookOpen,
  Calendar,
  Zap,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/agents", icon: Users, label: "Agents" },
  { to: "/executions", icon: Play, label: "Executions" },
  { to: "/schedules", icon: Calendar, label: "Schedules" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-[240px] fixed inset-y-0 left-0 z-40 flex flex-col justify-between p-5 bg-[#f6f4fc]/95 backdrop-blur-sm border-r border-purple-100/60">
      <div>
        <Link
          to="/dashboard"
          className="flex items-center gap-3 mb-8 hover:opacity-80 transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-700 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              Aether Platform
            </p>
            <p className="text-[10px] text-gray-400">
              Autonomous Intelligence
            </p>
          </div>
        </Link>

        <NavLink
          to="/tasks/create"
          className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white text-xs font-semibold py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out mb-6"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </NavLink>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ease-out cursor-pointer ${
                  isActive
                    ? "bg-purple-50 text-purple-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-purple-50/50 hover:translate-x-[3px] hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.2)]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isActive
                        ? "text-purple-600"
                        : "text-gray-400 group-hover:text-purple-500 group-hover:scale-110"
                    }`}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <Link
        to="/user-guide"
        className="group flex items-center justify-center gap-2 px-3 py-2 rounded-full border border-purple-200 bg-white/80 text-xs font-semibold text-gray-600 hover:text-purple-700 hover:border-purple-300 hover:bg-purple-50 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
      >
        <BookOpen className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-purple-500" />
        User Guide
      </Link>
    </aside>
  );
}