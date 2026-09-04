import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, ChevronDown } from "lucide-react";
import Badge from "../components/ui/Badge";
import { taskApi } from "../services/task.api";

const AVATAR_GRADIENTS = [
  "from-purple-400 to-indigo-600",
  "from-blue-400 to-cyan-600",
  "from-red-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-pink-400 to-rose-600",
];

const ACTIVE_STATUSES = ["pending", "in_progress"];

export default function ActiveTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentFilter, setAgentFilter] = useState("All Agents");
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    taskApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setTasks(res?.data?.tasks || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load active tasks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTasks = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status));
  const agents = [...new Set(activeTasks.map((t) => t.agent).filter(Boolean))].sort();

  const visibleTasks = activeTasks.filter((t) => {
    if (agentFilter !== "All Agents" && t.agent !== agentFilter) return false;
    if (highPriorityOnly && t.priority !== "high") return false;
    return true;
  });

  const clearFilters = () => {
    setAgentFilter("All Agents");
    setHighPriorityOnly(false);
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Dashboard
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Active Tasks</h1>
          <Badge variant="purple" pulse>
            {loading ? "..." : `${activeTasks.length} Active`}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="appearance-none px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition pr-7"
            >
              <option>All Agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setHighPriorityOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ease-out ${
              highPriorityOnly
                ? "text-purple-600 bg-purple-50 border-purple-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)]"
                : "text-gray-600 border-gray-200 bg-white hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)]"
            }`}
          >
            High Priority
          </button>
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      ) : activeTasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">No active tasks</p>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">No active tasks match the selected filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleTasks.map((task, i) => (
            <div
              key={task.id}
              className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
            >
              <div className="relative shrink-0">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center`}
                >
                  <span className="text-white text-xs font-bold">
                    {(task.agent || "T").charAt(0)}
                  </span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              </div>

              <div className="flex-1 min-w-0">
                <button
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {task.title}
                    </p>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-3">
                      {task.time || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-400">
                      Agent: {task.agent || "—"}
                    </p>
                    <Badge variant={task.badgeVariant}>{task.badge}</Badge>
                  </div>
                </button>
              </div>

              <button className="p-1 rounded hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out shrink-0">
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}