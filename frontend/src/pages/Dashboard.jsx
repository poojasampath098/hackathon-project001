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
  Plus,
  ArrowRight,
  ShieldCheck,
  Zap,
  Target,
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
import robotMascot from "../assets/robot-mascot.png";
import heroVideo from "../assets/hero-video.mp4.mp4";
import TopBar from "../components/layout/TopBar";
import TrendIndicator from "../components/ui/TrendIndicator";
import { dashboardApi } from "../services/dashboard.api";
import { AuthContext } from "../context/AuthContext";

const DONUT_COLORS = ["#7c3aed", "#d1d5db"];

const AMBIENT_BG = [
  "radial-gradient(620px 420px at 85% -8%, rgba(196,181,253,0.06), transparent 62%)",
  "radial-gradient(520px 360px at -4% 6%, rgba(221,214,254,0.16), transparent 62%)",
  "linear-gradient(180deg, #ffffff 0%, #faf9fe 50%, #f5f3fb 100%)",
].join(", ");

const AMBIENT_SIZE = "100% 100%, 100% 100%, 100% 100%";
const AMBIENT_REPEAT = "no-repeat, no-repeat, no-repeat";

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
  if (t.includes("start")) return { label: "Running", color: "bg-violet-100 text-violet-700", icon: <Activity className="w-4 h-4 text-violet-500" /> };
  if (t.includes("created")) return { label: "Created", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("deleted")) return { label: "Deleted", color: "bg-gray-100 text-gray-600", icon: <XCircle className="w-4 h-4 text-gray-500" /> };
  if (t.includes("requested")) return { label: "Requested", color: "bg-yellow-100 text-yellow-700", icon: <Activity className="w-4 h-4 text-yellow-500" /> };
  if (t.includes("granted")) return { label: "Approved", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("rejected")) return { label: "Rejected", color: "bg-red-100 text-red-700", icon: <XCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("ai_")) return { label: "AI", color: "bg-violet-100 text-violet-700", icon: <Activity className="w-4 h-4 text-violet-500" /> };
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
          icon: <ClipboardCheck className="w-4 h-4 text-violet-700" />,
          badge: "bg-gradient-to-br from-violet-100 to-violet-200",
          ...statTrend("activeTasks", summary.activeTasks ?? 0),
        },
        {
          label: "Completed Tasks",
          value: String(summary.completedTasks ?? 0),
          to: "/completed-today",
          icon: <CheckCircle2 className="w-4 h-4 text-violet-700" />,
          badge: "bg-gradient-to-br from-violet-100 to-violet-200",
          ...statTrend("completedTasks", summary.completedTasks ?? 0),
        },
        {
          label: "Pending Approvals",
          value: String(summary.pendingApprovals ?? 0),
          to: "/pending-approvals",
          icon: <Users className="w-4 h-4 text-violet-700" />,
          badge: "bg-gradient-to-br from-violet-100 to-violet-200",
          ...statTrend("pendingApprovals", summary.pendingApprovals ?? 0),
        },
        {
          label: "Running Executions",
          value: String(summary.runningExecutions ?? 0),
          to: "/executions",
          icon: <CirclePlay className="w-4 h-4 text-violet-700" />,
          badge: "bg-gradient-to-br from-violet-100 to-violet-200",
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
    <div className="pt-2 sm:pt-3 px-4 sm:px-5 pb-4 sm:pb-5 flex flex-col gap-5 relative isolate">
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

      {/* Welcome Card */}
      <div className="relative bg-white border border-violet-100/70 rounded-2xl shadow-sm p-5 overflow-hidden hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-[radial-gradient(circle_at_center,rgba(196,181,253,0.4),transparent_70%)] blur-2xl pointer-events-none" />

        {/* Ambient looped video background (decorative only) */}
        <div aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden rounded-2xl pointer-events-none select-none">
          <video
            className="w-full h-full object-cover opacity-45"
            src={heroVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          />
        </div>
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-white/85 via-white/45 to-white/85 pointer-events-none" />

        {/* Top row: badge (left) + search/help/bell/avatar (right) */}
        <div className="relative flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-full px-3 py-1 text-xs font-medium text-violet-700">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-violet-600 to-violet-800" />
            AI-Powered Agentic Platform
          </span>
          <TopBar />
        </div>

        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          {/* Left: greeting */}
          <div className="min-w-0">
<h1
              className="text-[42px] font-bold leading-[1.05] tracking-[-0.02em] text-[#0F172A]"
              style={{ fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" }}
            >
              Welcome back,
              <br />
              <span className="text-[#581C87]">{displayName}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-3 max-w-xl">
              {loading
                ? "Loading your workspace overview..."
                : error
                ? "Could not load your workspace summary."
                : `${summary.activeTasks} active task${summary.activeTasks === 1 ? "" : "s"}, ${summary.runningExecutions} running execution${summary.runningExecutions === 1 ? "" : "s"}, ${summary.pendingApprovals} pending approval${summary.pendingApprovals === 1 ? "" : "s"}.`}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {[
                { label: "Build smarter.", icon: <ShieldCheck className="w-3 h-3 text-violet-600" /> },
                { label: "Automate faster.", icon: <Zap className="w-3 h-3 text-violet-600" /> },
                { label: "Achieve more.", icon: <Target className="w-3 h-3 text-violet-600" /> },
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 border border-violet-200 rounded-full px-3 py-1 text-xs text-violet-700 bg-white/60"
                >
                  {chip.icon}
                  {chip.label}
                </span>
              ))}
            </div>
          </div>

          {/* Right: AI Assistant panel */}
          <div className="w-full lg:w-[300px] shrink-0 bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-600 to-violet-800 text-white flex items-center justify-center shrink-0">
                  <Plus className="w-2.5 h-2.5" />
                </span>
                <span className="text-sm font-bold text-violet-800">AI Assistant</span>
              </div>
              <p className="text-xs text-gray-500 leading-snug">
                Your intelligent partner for better decisions and faster actions.
              </p>
              <button
                onClick={() => navigate("/tasks/create")}
                className="mt-3 inline-flex items-center gap-1.5 bg-gray-900 text-white rounded-full px-4 py-2 text-xs font-medium hover:bg-gray-800 hover:-translate-y-0.5 transition-all duration-200 ease-out"
              >
                Start a new task
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="w-14 h-14 rounded-full bg-white border border-violet-100 flex items-center justify-center shrink-0 overflow-hidden">
              <img src={robotMascot} alt="AI Assistant" className="w-10 h-10 object-contain" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
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
                className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 relative overflow-hidden hover:bg-white/95 hover:border-violet-200/70 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] cursor-pointer transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${stat.badge}`}>
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
            <div className="col-span-1 lg:col-span-2 bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">
                  Task Activity This Week
                </h2>
                <button className="p-1 rounded hover:bg-violet-50 hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out">
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
            <div className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col items-center justify-center hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
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
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
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
            <div className="col-span-1 lg:col-span-2 bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col min-h-[340px] hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">
                  Recent Activity
                </h2>
                <Link
                  to="/activity"
                  className="text-xs text-violet-600 font-medium hover:underline"
                >
                  View All
                </Link>
              </div>
              {displayActivities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 rounded-xl bg-violet-50/80 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-violet-400" />
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
                      className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 rounded-lg hover:bg-violet-50/40 transition-colors duration-150"
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
            <div className="bg-white/85 backdrop-blur-sm border border-gray-100/80 rounded-2xl shadow-sm p-5 flex flex-col min-h-[340px] hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_20px_45px_-12px_rgba(109,40,217,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100">
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
                                <p className="text-xs text-violet-600 font-semibold mt-0.5">
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