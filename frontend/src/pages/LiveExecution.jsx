import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  Filter,
  ChevronDown,
} from "lucide-react";
import Badge from "../components/ui/Badge";
import { executionApi } from "../services/execution.api";
import { taskApi } from "../services/task.api";
import { useSSE } from "../hooks/useSSE";

const filters = ["All", "Running", "Failed"];

const statusByFilter = {
  All: null,
  Running: "running",
  Failed: "failed",
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  if (typeof ms === "string") return ms;
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatStepTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString();
}

function statusBadge(status) {
  switch (status) {
    case "running":
      return <Badge variant="blue" pulse>Running</Badge>;
    case "completed":
      return <Badge variant="green">Completed</Badge>;
    case "failed":
      return <Badge variant="red">Failed</Badge>;
    case "cancelled":
      return <Badge variant="gray">Cancelled</Badge>;
    case "pending":
      return <Badge variant="yellow">Pending</Badge>;
    default:
      return <Badge variant="gray">{status || "Unknown"}</Badge>;
  }
}

const stepColors = {
  pending: "text-yellow-400",
  running: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
  skipped: "text-gray-500",
};

const eventColors = {
  task_created: "text-blue-400",
  task_updated: "text-blue-400",
  task_completed: "text-green-400",
  task_deleted: "text-red-400",
  execution_started: "text-blue-400",
  execution_completed: "text-green-400",
  execution_failed: "text-red-400",
  execution_cancelled: "text-gray-400",
};

export default function LiveExecution() {
  const { taskId } = useParams();
  const sse = useSSE(taskId);
  const [activeFilter, setActiveFilter] = useState("All");
  const [executions, setExecutions] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAgent, setFilterAgent] = useState("All");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await (taskId
          ? executionApi.getByTask(taskId)
          : executionApi.getAll());
        if (cancelled) return;
        setExecutions(res?.data?.executions || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setExecutions([]);
        setError(err.message || "Could not load executions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    taskApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        const map = {};
        (res?.data?.tasks || []).forEach((t) => {
          map[t.id] = t;
        });
        setTasks(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const rows = executions.map((e) => {
    const task = tasks[e.taskId] || {};
    return {
      id: e.id,
      taskName: task.title || `Task ${e.taskId}`,
      agent: task.agent || "—",
      status: e.status,
      started: formatDate(e.startedAt),
      duration: formatDuration(e.duration),
      error: e.error,
      output: e.output,
      steps: e.steps || [],
    };
  });

  const agentOptions = ["All", ...new Set(rows.map((r) => r.agent).filter((a) => a !== "—"))];

  const filtered = rows
    .filter((r) => !statusByFilter[activeFilter] || r.status === statusByFilter[activeFilter])
    .filter((r) => filterAgent === "All" || r.agent === filterAgent)
    .filter(
      (r) =>
        r.taskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.agent.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const stream = filtered[0];
  const liveLines = (sse.events || []).filter(
    (ev) => ev && typeof ev.message === "string" && ev.message.trim()
  );

  return (
    <div className="p-6 flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Execution History
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Monitor and manage autonomous agent tasks in real-time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 w-56"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setFilterOpen((p) => !p)}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out"
              >
                <Filter className="w-4 h-4 text-gray-500" />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4">
                  <p className="text-xs font-bold text-gray-900 mb-3">Filters</p>
                  <div className="mb-3">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Agent</label>
                    <div className="relative">
                      <select
                        value={filterAgent}
                        onChange={(e) => setFilterAgent(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                      >
                        {agentOptions.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <button
                    onClick={() => { setFilterAgent("All"); setFilterOpen(false); }}
                    className="text-[10px] text-purple-600 font-medium hover:text-purple-700"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                activeFilter === f
                  ? "bg-purple-600 text-white hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.4)] active:scale-95"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.3)] active:scale-95"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 flex-1">
          {/* Recent Tasks Table */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">Recent Tasks</h2>
              <button
                onClick={() => setShowAll((p) => !p)}
                className="text-xs text-purple-600 font-medium hover:underline"
              >
                {showAll ? "Show Less" : "View All"}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-[10px] font-semibold text-gray-400 uppercase pb-3 pr-4">
                        Task Name
                      </th>
                      <th className="text-[10px] font-semibold text-gray-400 uppercase pb-3 pr-4">
                        Agent
                      </th>
                      <th className="text-[10px] font-semibold text-gray-400 uppercase pb-3 pr-4">
                        Status
                      </th>
                      <th className="text-[10px] font-semibold text-gray-400 uppercase pb-3 pr-4">
                        Started At
                      </th>
                      <th className="text-[10px] font-semibold text-gray-400 uppercase pb-3">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="text-xs font-semibold text-gray-900">
                            {row.taskName}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="text-xs text-gray-500">{row.agent}</p>
                        </td>
                        <td className="py-3 pr-4">
                          {statusBadge(row.status)}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="text-xs text-gray-500">{row.started}</p>
                        </td>
                        <td className="py-3">
                          <p className="text-xs text-gray-500">{row.duration}</p>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-gray-400">
                          {error || "No executions found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live Log Stream */}
          <div className="bg-gray-900 rounded-xl shadow-sm p-4 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Live Log Stream</h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  {taskId ? (
                    sse.connected ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    )
                  ) : (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </>
                  )}
                </span>
                <span className="text-[10px] font-bold text-red-400 uppercase">
                  {taskId ? (sse.connected ? "Live" : "Connecting") : "Live"}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[420px] space-y-2 font-mono text-[11px] leading-relaxed">
              {liveLines.length > 0 ? (
                liveLines.map((ev, i) => (
                  <div key={`${ev.timestamp}-${i}`} className="flex gap-2">
                    <span className="text-gray-500 shrink-0">{formatStepTime(ev.timestamp)}</span>
                    <span
                      className={`shrink-0 font-bold ${eventColors[ev.type] || "text-gray-400"}`}
                    >
                      [{(ev.type || "event").toUpperCase()}]
                    </span>
                    <span className="text-gray-300">{ev.message}</span>
                  </div>
                ))
              ) : stream && stream.steps && stream.steps.length > 0 ? (
                stream.steps.map((step, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-500 shrink-0">{formatStepTime(step.startedAt)}</span>
                    <span
                      className={`shrink-0 font-bold ${stepColors[step.status] || "text-gray-400"}`}
                    >
                      [{(step.status || "pending").toUpperCase()}]
                    </span>
                    <span className="text-gray-300">{step.name}</span>
                    <span className="text-gray-500 ml-auto shrink-0">{formatDuration(step.duration)}</span>
                  </div>
                ))
              ) : stream && stream.error ? (
                <p className="text-red-400">Error: {stream.error}</p>
              ) : (
                <p className="text-gray-500">
                  {error || "No execution steps available."}
                </p>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}