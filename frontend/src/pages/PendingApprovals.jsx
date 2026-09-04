import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Search, Bell, XCircle, CheckCircle2 } from "lucide-react";
import Badge from "../components/ui/Badge";
import { approvalApi } from "../services/approval.api";
import { taskApi } from "../services/task.api";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export default function PendingApprovals() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    approvalApi
      .getPending()
      .then((res) => {
        if (cancelled) return;
        setItems(res?.data?.approvals || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load pending approvals");
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

  const handleApprove = async (id) => {
    try {
      await approvalApi.approve(id);
      setItems((prev) =>
        prev.filter((a) => (a._id || a.id) !== id)
      );
      showToast("Approval approved successfully");
    } catch (err) {
      showToast(err.message || "Failed to approve", "error");
    }
  };

  const handleReject = async (id) => {
    try {
      await approvalApi.reject(id);
      setItems((prev) =>
        prev.filter((a) => (a._id || a.id) !== id)
      );
      showToast("Approval rejected");
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    }
  };

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
          <h1 className="text-xl font-bold text-gray-900">Pending Approvals</h1>
          <Badge variant="yellow" pulse>
            {loading ? "..." : `${items.length} pending`}
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">No pending approvals</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {items.map((item) => {
              const id = item._id || item.id;
              const task = tasks[item.taskId] || {};
              return (
                <div
                  key={id}
                  className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4 border border-gray-100 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        {task.title || `Task ${item.taskId}`}
                      </p>
                    </div>
                    <Badge variant="yellow" pulse>Pending</Badge>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed">
                    {item.reason || "Approval requested for this task."}
                  </p>

                  <p className="text-[10px] text-gray-400">
                    Execution {item.executionId} &middot; Created {formatDate(item.createdAt)}
                  </p>

                  <div className="flex items-center gap-2 mt-auto">
                    <button
                      onClick={() => handleReject(id)}
                      className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.25)] active:scale-95 transition-all duration-200 ease-out"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(id)}
                      className="flex-1 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-900 to-purple-600 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Toast */}
        {toast && (
        <div
          className="fixed top-5 right-5 z-[100]"
          style={{ animation: "fadeIn 0.15s ease-out" }}
        >
          <div
            className={`flex items-center gap-2.5 bg-white rounded-xl shadow-lg px-4 py-3 min-w-[240px] ${
              toast.type === "error" ? "border border-red-200" : "border border-green-200"
            }`}
          >
            {toast.type === "error" ? (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            )}
            <p className="text-xs font-medium text-gray-800">{toast.message}</p>
          </div>
        </div>
        )}
    </main>
  );
}