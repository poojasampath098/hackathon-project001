import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Bot, Filter } from "lucide-react";
import Badge from "../components/ui/Badge";
import { taskApi } from "../services/task.api";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

function getPeriod(time) {
  if (!time) return "Anytime";
  const lower = time.toLowerCase();
  if (lower.includes("pm")) return "Afternoon";
  if (lower.includes("am")) return "Morning";
  const hour = parseInt(time, 10);
  if (!Number.isNaN(hour)) return hour >= 12 ? "Afternoon" : "Morning";
  return "Anytime";
}

export default function CompletedToday() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setError(err.message || "Could not load completed tasks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const groupOrder = ["Afternoon", "Morning", "Anytime"];
  const groups = groupOrder
    .map((label) => ({
      label,
      tasks: completedTasks.filter((t) => getPeriod(t.time) === label),
    }))
    .filter((g) => g.tasks.length > 0);

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
          <h1 className="text-xl font-bold text-gray-900">Completed Today</h1>
          <Badge variant="green">{loading ? "..." : `${completedTasks.length} completed`}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
            Today
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
            <Filter className="w-3 h-3" />
            Filter
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
      ) : completedTasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">No completed tasks yet</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              {group.label}
            </h2>
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400">
                      <Bot className="w-3 h-3" />
                      <span>{task.agent || "—"}</span>
                      <span>&middot;</span>
                      <span>{task.time || "—"}</span>
                      <span>&middot;</span>
                      <span>{capitalize(task.priority)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="green">COMPLETED</Badge>
                  <button
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="text-[10px] font-semibold text-purple-600 hover:text-purple-700 px-3 py-1.5 border border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out"
                  >
                    View Result
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}