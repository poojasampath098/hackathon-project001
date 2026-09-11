import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="aether-shell min-h-screen">
      <Sidebar />
<main className="ml-[240px] min-h-screen flex flex-col pt-0 px-3 sm:px-4 lg:px-5">
  <div className="flex-1 flex flex-col bg-white/70 backdrop-blur-sm border border-violet-100/50 rounded-2xl shadow-sm pt-0 px-3 sm:px-4 lg:px-5 pb-3 sm:pb-4 lg:pb-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}