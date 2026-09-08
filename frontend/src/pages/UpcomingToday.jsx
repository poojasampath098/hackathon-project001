import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Badge from "../components/ui/Badge";
import { taskApi } from "../services/task.api";

export default function UpcomingToday() {
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
        setError(err.message || "Could not load upcoming tasks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-6">
      <button
        onClick={() => navigate("/agents")}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Agents
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Upcoming Today</h1>
          <Badge variant="purple">
            {loading ? "..." : `${tasks.length} upcoming`}
          </Badge>
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
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">No upcoming tasks today</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {task.title}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                  <span>{task.time || "—"}</span>
                  <span>•</span>
                  <span>{task.agent || "—"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant={task.badgeVariant || "blue"}>{task.badge || "Scheduled"}</Badge>
                {task.status === "completed" && (
                  <button
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="text-[10px] font-semibold text-purple-600 hover:text-purple-700 px-2.5 py-1 border border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out"
                  >
                    View Result
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
