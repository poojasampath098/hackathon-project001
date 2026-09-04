import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Search, Bell } from "lucide-react";
import Badge from "../components/ui/Badge";
import { approvalApi } from "../services/approval.api";
import { taskApi } from "../services/task.api";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function statusBadge(status) {
  switch (status) {
    case "pending":
      return <Badge variant="yellow" pulse>Pending</Badge>;
    case "approved":
      return <Badge variant="green">Approved</Badge>;
    case "rejected":
      return <Badge variant="red">Rejected</Badge>;
    default:
      return <Badge variant="gray">{status || "Unknown"}</Badge>;
  }
}

const tabs = ["All", "Pending", "Approved", "Rejected"];

export default function Approvals() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    let cancelled = false;
    approvalApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setItems(res?.data?.approvals || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load approvals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
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
    return () => { cancelled = true; };
  }, []);

  const visible = items.filter(
    (a) => activeTab === "All" || a.status === activeTab.toLowerCase()
  );

  return (
    <main className="w-full min-h-screen bg-transparent px-6 lg:px-8 py-6 flex flex-col gap-6">
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

        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Approvals</h1>
          <Badge variant="gray">
            {loading ? "..." : `${items.length} total`}
          </Badge>
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                activeTab === tab
                  ? "bg-purple-600 text-white hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.4)] active:scale-95"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.3)] active:scale-95"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">
              {items.length === 0 ? "No approvals yet" : "No approvals match this filter"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((item) => {
              const id = item._id || item.id;
              const task = tasks[item.taskId] || {};
              return (
                <div
                  key={id}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {task.title || `Task ${item.taskId}`}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400">
                        <Bot className="w-3 h-3" />
                        <span>Execution {item.executionId}</span>
                        <span>&middot;</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      {item.reason && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {item.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {statusBadge(item.status)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </main>
  );
}