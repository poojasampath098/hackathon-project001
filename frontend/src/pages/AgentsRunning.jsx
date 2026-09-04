import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  Filter,
  BarChart3,
  Loader2,
} from "lucide-react";
import Badge from "../components/ui/Badge";
import { executionApi } from "../services/execution.api";
import { taskApi } from "../services/task.api";

export default function AgentsRunning() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const exRes = await executionApi.getAll();
        if (cancelled) return;
        const executions = (exRes?.data?.executions || []).filter(
          (e) => e.status === "running"
        );
        const taskIds = [...new Set(executions.map((e) => e.taskId).filter(Boolean))];
        const taskRes = taskIds.length
          ? await taskApi.getAll().catch(() => null)
          : null;
        if (cancelled) return;
        const tasks = taskRes?.data?.tasks || [];
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        const mapped = executions.slice(0, 12).map((e) => {
          const task = taskMap.get(e.taskId) || {};
          return {
            id: e.id || String(e._id),
            agent: task.agent || e.agent || "—",
            task: task.title || "Untitled task",
            startedAt: e.startedAt || e.createdAt || null,
            steps: Array.isArray(e.steps) ? e.steps.length : 0,
            runningSteps: Array.isArray(e.steps)
              ? e.steps.filter((s) => s.status === "running").length
              : 0,
          };
        });
        setRows(mapped);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(err.message || "Could not load running agents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const runningCount = rows.length;

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
          <h1 className="text-xl font-bold text-gray-900">Agents Running</h1>
          {!loading && runningCount > 0 && (
            <Badge variant="green" pulse>
              {runningCount} active
            </Badge>
          )}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
          <Filter className="w-3 h-3" />
          Filter
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading running agents...
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : runningCount === 0 ? (
        <div className="py-16 text-center">
          <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No agents are currently running.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {rows.map((agent) => (
            <div
              key={agent.id}
              className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">
                      {(agent.agent || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {agent.agent}
                    </p>
                    <p className="text-[10px] text-gray-400">Active agent</p>
                  </div>
                </div>
                <button className="p-1 rounded hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out">
                  <MoreHorizontal className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Executing Task
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {agent.task}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">
                    Steps
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {agent.runningSteps}/{agent.steps}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">
                    Started
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {agent.startedAt
                      ? new Date(agent.startedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
