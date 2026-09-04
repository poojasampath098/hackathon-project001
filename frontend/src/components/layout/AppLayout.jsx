import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="aether-shell min-h-screen">
      <Sidebar />
      <main className="ml-[240px] min-h-screen flex flex-col p-4 sm:p-5 lg:p-6">
        <div className="flex-1 bg-white/70 backdrop-blur-sm border border-purple-100/50 rounded-2xl shadow-sm p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}