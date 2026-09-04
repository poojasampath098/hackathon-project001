import { useState, useEffect, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  MoreHorizontal,
  Activity,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Users,
  CirclePlay,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import TopBar from "../components/layout/TopBar";
import TrendIndicator from "../components/ui/TrendIndicator";
import { dashboardApi } from "../services/dashboard.api";
import { AuthContext } from "../context/AuthContext";

const DONUT_COLORS = ["#7c3aed", "#d1d5db"];

const AMBIENT_BG = [
  `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'520'%20height%3D'520'%20viewBox%3D'0%200%20520%20520'%3E%0A%3Cg%20stroke%3D'%238b5cf6'%20stroke-width%3D'0.8'%20stroke-opacity%3D'0.18'%20fill%3D'none'%3E%0A%3Cpath%20d%3D'M80%20120%20L200%2095%20L300%20150%20L235%20252%20L390%20305%20L305%20418'%2F%3E%0A%3Cpath%20d%3D'M120%20180%20L235%20252%20L150%20330'%2F%3E%0A%3C%2Fg%3E%0A%3Cg%20fill%3D'%238b5cf6'%20fill-opacity%3D'0.35'%3E%0A%3Ccircle%20cx%3D'80'%20cy%3D'120'%20r%3D'2.4'%2F%3E%3Ccircle%20cx%3D'200'%20cy%3D'95'%20r%3D'2.4'%2F%3E%3Ccircle%20cx%3D'300'%20cy%3D'150'%20r%3D'2.4'%2F%3E%0A%3Ccircle%20cx%3D'235'%20cy%3D'252'%20r%3D'3'%2F%3E%3Ccircle%20cx%3D'390'%20cy%3D'305'%20r%3D'2.4'%2F%3E%3Ccircle%20cx%3D'305'%20cy%3D'418'%20r%3D'2.4'%2F%3E%0A%3Ccircle%20cx%3D'120'%20cy%3D'180'%20r%3D'2'%2F%3E%3Ccircle%20cx%3D'150'%20cy%3D'330'%20r%3D'2.2'%2F%3E%0A%3C%2Fg%3E%0A%3Cg%20fill%3D'%238b5cf6'%20fill-opacity%3D'0.28'%3E%0A%3Ccircle%20cx%3D'420'%20cy%3D'120'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'452'%20cy%3D'262'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'92'%20cy%3D'360'%20r%3D'1.4'%2F%3E%0A%3Ccircle%20cx%3D'330'%20cy%3D'92'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'252'%20cy%3D'412'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'470'%20cy%3D'420'%20r%3D'1.4'%2F%3E%0A%3Ccircle%20cx%3D'182'%20cy%3D'60'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'62'%20cy%3D'278'%20r%3D'1.4'%2F%3E%3Ccircle%20cx%3D'360'%20cy%3D'470'%20r%3D'1.4'%2F%3E%0A%3Ccircle%20cx%3D'472'%20cy%3D'190'%20r%3D'1.4'%2F%3E%0A%3C%2Fg%3E%0A%3C%2Fsvg%3E")`,
  "radial-gradient(620px 420px at 85% -8%, rgba(196,181,253,0.07), transparent 62%)",
  "radial-gradient(520px 360px at -4% 6%, rgba(221,214,254,0.22), transparent 62%)",
  "radial-gradient(640px 400px at 102% 58%, rgba(199,186,252,0.06), transparent 62%)",
  "radial-gradient(560px 380px at 6% 104%, rgba(165,180,252,0.05), transparent 62%)",
  "linear-gradient(180deg, #ffffff 0%, #faf9fe 50%, #f5f3fb 100%)",
].join(", ");

const AMBIENT_SIZE = "520px 520px, 100% 100%, 100% 100%, 100% 100%, 100% 100%";
const AMBIENT_REPEAT = "repeat, no-repeat, no-repeat, no-repeat, no-repeat";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function weekdayShort(dateStr) {
  if (!dateStr) return dateStr || "";
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function percentValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function activityMeta(type) {
  const t = type || "";
  if (!t) return { label: "Logged", color: "bg-gray-100 text-gray-600", icon: <CheckCircle2 className="w-4 h-4 text-gray-500" /> };
  if (t.includes("failed")) return { label: "Failed", color: "bg-red-100 text-red-700", icon: <XCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("cancell")) return { label: "Cancelled", color: "bg-gray-100 text-gray-600", icon: <Activity className="w-4 h-4 text-gray-500" /> };
  if (t.includes("complete")) return { label: "Completed", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("start")) return { label: "Running", color: "bg-purple-100 text-purple-700", icon: <Activity className="w-4 h-4 text-purple-500" /> };
  if (t.includes("created")) return { label: "Created", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("deleted")) return { label: "Deleted", color: "bg-gray-100 text-gray-600", icon: <XCircle className="w-4 h-4 text-gray-500" /> };
  if (t.includes("requested")) return { label: "Requested", color: "bg-yellow-100 text-yellow-700", icon: <Activity className="w-4 h-4 text-yellow-500" /> };
  if (t.includes("granted")) return { label: "Approved", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("rejected")) return { label: "Rejected", color: "bg-red-100 text-red-700", icon: <XCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("ai_")) return { label: "AI", color: "bg-purple-100 text-purple-700", icon: <Activity className="w-4 h-4 text-purple-500" /> };
  if (t.includes("logged_in")) return { label: "Login", color: "bg-blue-100 text-blue-700", icon: <CheckCircle2 className="w-4 h-4 text-blue-500" /> };
  if (t.includes("registered")) return { label: "Signup", color: "bg-blue-100 text-blue-700", icon: <CheckCircle2 className="w-4 h-4 text-blue-500" /> };
  return { label: t, color: "bg-gray-100 text-gray-600", icon: <CheckCircle2 className="w-4 h-4 text-gray-500" /> };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "User"
    : "User";

  // API data state
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .getSummary()
      .then((res) => {
        if (cancelled) return;
        setSummary(res?.data || null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSummary(null);
        setError(err.message || "Could not load dashboard summary");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const statTrend = (key, flat) => ({
    current: summary?.trends?.[key]?.current ?? flat,
    previous: summary?.trends?.[key]?.previous ?? flat,
  });

  const stats = summary
    ? [
        {
          label: "Active Tasks",
          value: String(summary.activeTasks ?? 0),
          to: "/active-tasks",
          icon: <ClipboardCheck className="w-5 h-5 text-white" />,
          badge: "bg-gradient-to-br from-purple-600 to-purple-700 shadow-[0_8px_18px_-8px_rgba(124,58,237,0.5)]",
          ...statTrend("activeTasks", summary.activeTasks ?? 0),
        },
        {
          label: "Completed Tasks",
          value: String(summary.completedTasks ?? 0),
          to: "/completed-today",
          icon: <CheckCircle2 className="w-5 h-5 text-white" />,
          badge: "bg-gradient-to-br from-purple-500 to-purple-600 shadow-[0_8px_18px_-8px_rgba(168,85,247,0.5)]",
          ...statTrend("completedTasks", summary.completedTasks ?? 0),
        },
        {
          label: "Pending Approvals",
          value: String(summary.pendingApprovals ?? 0),
          to: "/pending-approvals",
          icon: <Users className="w-5 h-5 text-white" />,
          badge: "bg-gradient-to-br from-purple-400 to-purple-500 shadow-[0_8px_18px_-8px_rgba(192,132,252,0.5)]",
          ...statTrend("pendingApprovals", summary.pendingApprovals ?? 0),
        },
        {
          label: "Running Executions",
          value: String(summary.runningExecutions ?? 0),
          to: "/executions",
          icon: <CirclePlay className="w-5 h-5 text-white" />,
          badge: "bg-gradient-to-br from-purple-300 to-purple-400 shadow-[0_8px_18px_-8px_rgba(216,180,254,0.5)]",
          ...statTrend("runningExecutions", summary.runningExecutions ?? 0),
        },
      ]
    : [];

  const barData = summary
    ? [
        { label: "CPU", value: percentValue(summary.liveExecutions?.cpu?.usagePercent) },
        { label: "RAM", value: percentValue(summary.liveExecutions?.memory?.usagePercent) },
        { label: "NET", value: null },
        { label: "GPU", value: percentValue(summary.liveExecutions?.gpu?.[0]?.usagePercent) },
      ]
    : [];

  const successRate =
    typeof summary?.agentSuccessRate?.successRate === "number"
      ? summary.agentSuccessRate.successRate
      : 0;
  const donutData = [
    { name: "Success", value: successRate },
    { name: "Failed", value: 100 - successRate },
  ];
  const successPct = donutData[0].value;

  const weeklyData = (summary?.taskActivityThisWeek || []).map((d) => ({
    day: weekdayShort(d.date),
    tasks: d.count,
  }));

  const displayActivities = (summary?.recentActivity || []).slice(0, 5).map((a) => {
    const meta = activityMeta(a.type);
    return {
      name: a.message || a.type || "Activity",
      sub: formatDate(a.createdAt),
      status: meta.label,
      color: meta.color,
      icon: meta.icon,
    };
  });

  return (
    <div className="p-6 flex flex-col gap-6 relative isolate">
      {/* Ambient Aether backdrop (decorative only, sits behind all cards) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: AMBIENT_BG,
          backgroundSize: AMBIENT_SIZE,
          backgroundRepeat: AMBIENT_REPEAT,
        }}
      />
      {/* Top Bar (shared header: search, help, notifications, profile) */}
      <TopBar />

      {/* Welcome Card */}
      <div className="relative bg-gradient-to-br from-white via-purple-50/50 to-purple-100/30 border border-purple-100/70 rounded-2xl shadow-sm p-6 overflow-hidden hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_16px_36px_-16px_rgba(147,51,234,0.30)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-[radial-gradient(circle_at_center,rgba(196,181,253,0.5),transparent_70%)] blur-2xl pointer-events-none" />
        <svg
          viewBox="0 0 120 90"
          className="absolute -right-3 -bottom-5 w-44 h-auto text-purple-400/30 pointer-events-none hidden md:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M60 8 L100 30 L60 52 L20 30 Z" />
          <path d="M20 30 L20 70 L60 92 L60 52" />
          <path d="M60 52 L60 92 L100 70 L100 30" />
        </svg>
        <h1 className="text-xl font-bold text-gray-900 relative">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-gray-500 mt-1 relative max-w-xl">
          {loading
            ? "Loading your workspace overview..."
            : error
            ? "Could not load your workspace summary."
            : `${summary.activeTasks} active task${summary.activeTasks === 1 ? "" : "s"}, ${summary.runningExecutions} running execution${summary.runningExecutions === 1 ? "" : "s"}, ${summary.pendingApprovals} pending approval${summary.pendingApprovals === 1 ? "" : "s"}.`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-400">Loading your dashboard...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                onClick={() => navigate(stat.to)}
                className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 relative overflow-hidden hover:bg-white/95 hover:border-purple-200/70 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_16px_36px_-14px_rgba(147,51,234,0.32)] cursor-pointer transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.badge}`}>
                    {stat.icon}
                  </div>
                  <span className="text-xs text-gray-500 font-medium leading-snug">
                    {stat.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
                <TrendIndicator current={stat.current} previous={stat.previous} />
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Task Activity Chart */}
            <div className="col-span-1 lg:col-span-2 bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_16px_36px_-16px_rgba(147,51,234,0.28)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">
                  Task Activity This Week
                </h2>
                <button className="p-1 rounded hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out">
                  <MoreHorizontal className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {weeklyData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center">
                  <p className="text-xs text-gray-400">No task activity recorded this week</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="tasks"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#purpleGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Agent Success Rate Donut */}
            <div className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col items-center justify-center hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_16px_36px_-16px_rgba(147,51,234,0.28)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <h2 className="text-sm font-bold text-gray-900 mb-2 w-full">
                Agent Success Rate
              </h2>
              <div className="relative w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={68}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {donutData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={DONUT_COLORS[index]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{successPct}%</span>
                  <span className="text-[10px] text-gray-400">Success</span>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  <span className="text-[10px] text-gray-500">Success ({successPct}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                  <span className="text-[10px] text-gray-500">Failed ({100 - successPct}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent Activity */}
            <div className="col-span-1 lg:col-span-2 bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col min-h-[340px] hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_16px_36px_-16px_rgba(147,51,234,0.28)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">
                  Recent Activity
                </h2>
                <Link
                  to="/activity"
                  className="text-xs text-purple-600 font-medium hover:underline"
                >
                  View All
                </Link>
              </div>
              {displayActivities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 rounded-xl bg-purple-50/80 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">No recent activity</p>
                    <p className="text-[10px] text-gray-300 mt-1">
                      Events will appear here as they happen
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-start gap-3">
                  {displayActivities.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 rounded-lg hover:bg-purple-50/40 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <div>
                          <p className="text-xs font-semibold text-gray-900">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {item.sub}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${item.color}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Executions */}
            <div className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col min-h-[340px] hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_16px_36px_-16px_rgba(147,51,234,0.28)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <div className="mb-1">
                <h2 className="text-sm font-bold text-gray-900">
                  Live Executions
                </h2>
                <p className="text-[10px] text-gray-400">
                  Real-time processing
                </p>
              </div>
              <div className="flex-1 flex items-center mt-3">
                <div className="w-full h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const { label, value } = payload[0].payload;
                            return (
                              <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-3 py-2">
                                <p className="text-xs font-bold text-gray-900">{label}</p>
                                <p className="text-xs text-purple-600 font-semibold mt-0.5">
                                  {value == null ? "Unavailable" : `Load: ${value}%`}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={entry.value != null && entry.value > 75 ? "#7c3aed" : "#c4b5fd"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500 font-medium">
                  Network Load
                </span>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                  Unavailable
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}