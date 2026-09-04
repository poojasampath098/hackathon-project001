import { useState, useEffect } from "react";
import { Search, Bell } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Badge from "../components/ui/Badge";
import { analyticsApi } from "../services/analytics.api";

const DONUT_COLORS = [
  "#7c3aed",
  "#d1d5db",
  "#fbbf24",
  "#34d399",
  "#f87171",
  "#60a5fa",
];

const BAR_COLOR = "#7c3aed";

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  approved: "Approved",
  rejected: "Rejected",
};

function humanize(key) {
  const label = STATUS_LABELS[key] || key;
  return label.replace(/_/g, " ");
}

function toEntries(obj) {
  return Object.entries(obj || {}).map(([key, value]) => ({
    name: humanize(key),
    value,
  }));
}

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        setData(res?.data || null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err.message || "Could not load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const taskStats = data?.taskStats || {};
  const executionStats = data?.executionStats || {};
  const activityStats = data?.activityStats || {};
  const approvalStats = data?.approvalStats || {};

  const taskStatusData = toEntries(taskStats.byStatus);
  const taskPriorityData = toEntries(taskStats.byPriority);
  const executionStatusData = toEntries(executionStats.byStatus);
  const approvalStatusData = toEntries(approvalStats.byStatus);
  const activityTypeData = toEntries(activityStats.byType);

  const statCards = [
    { label: "Total Tasks", value: String(taskStats.total ?? 0) },
    { label: "Task Completion Rate", value: `${taskStats.completionRate ?? 0}%` },
    { label: "Total Executions", value: String(executionStats.total ?? 0) },
    { label: "Avg Exec Duration", value: formatDuration(executionStats.avgDuration) },
  ];

  const renderBar = (entryData, height) =>
    entryData.length === 0 ? (
      <div className="h-[220px] flex items-center justify-center">
        <p className="text-xs text-gray-400">No data available</p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={entryData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "#f8f7fc" }}
            contentStyle={{
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );

  const renderPie = (entryData, height) =>
    entryData.length === 0 ? (
      <div className="h-[220px] flex items-center justify-center">
        <p className="text-xs text-gray-400">No data available</p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={entryData}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={80}
            dataKey="value"
            paddingAngle={2}
            stroke="none"
          >
            {entryData.map((_, index) => (
              <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    );

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Top Navbar */}
      <div className="flex items-center justify-end gap-4">
        <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
          <Search className="w-4 h-4 text-gray-500" />
        </button>
        <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out relative">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
          <span className="flex w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        {!loading && !error && (
          <Badge variant="purple">Live</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
              >
                <span className="text-xs text-gray-500 font-medium">
                  {stat.label}
                </span>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Task + Execution Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-gray-900">Task Status</h2>
              </div>
              {renderPie(taskStatusData, 220)}
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-gray-900">Task Priority</h2>
              </div>
              {renderBar(taskPriorityData, 220)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-gray-900">Execution Status</h2>
              </div>
              {renderBar(executionStatusData, 220)}
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-gray-900">Approvals</h2>
              </div>
              {renderPie(approvalStatusData, 220)}
            </div>
          </div>

          {/* Activity by Type */}
          <div className="bg-white rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Activity by Type</h2>
              <Badge variant="gray">{activityStats.total ?? 0} total</Badge>
            </div>
            {activityTypeData.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">No activity recorded</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activityTypeData.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 bg-purple-50 rounded-full px-3 py-1.5"
                  >
                    <span className="text-xs text-gray-700">{entry.name}</span>
                    <span className="text-xs font-bold text-purple-700">{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}