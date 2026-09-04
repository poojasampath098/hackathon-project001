import { useState, useEffect } from "react";
import { Search, Bell, Trash2, CheckCircle2, XCircle, Activity as ActivityIcon, Bot, X, LogIn, RefreshCw } from "lucide-react";
import Badge from "../components/ui/Badge";
import { activityApi } from "../services/activity.api";

function timeAgo(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function typePresentation(type) {
  const t = type || "";
  if (t.includes("failed")) return { label: "Failed", variant: "red", icon: <XCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("cancell")) return { label: "Cancelled", variant: "gray", icon: <ActivityIcon className="w-4 h-4 text-gray-500" /> };
  if (t.includes("completed")) return { label: "Completed", variant: "green", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("started")) return { label: "Started", variant: "purple", icon: <ActivityIcon className="w-4 h-4 text-purple-500" /> };
  if (t.includes("created")) return { label: "Created", variant: "green", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("updated")) return { label: "Updated", variant: "blue", icon: <RefreshCw className="w-4 h-4 text-blue-500" /> };
  if (t.includes("deleted")) return { label: "Deleted", variant: "gray", icon: <XCircle className="w-4 h-4 text-gray-500" /> };
  if (t.includes("requested")) return { label: "Requested", variant: "yellow", icon: <ActivityIcon className="w-4 h-4 text-yellow-500" /> };
  if (t.includes("granted")) return { label: "Granted", variant: "green", icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> };
  if (t.includes("rejected")) return { label: "Rejected", variant: "red", icon: <XCircle className="w-4 h-4 text-red-500" /> };
  if (t.includes("toggled")) return { label: "Toggled", variant: "blue", icon: <RefreshCw className="w-4 h-4 text-blue-500" /> };
  if (t.includes("ai_")) return { label: "AI", variant: "purple", icon: <Bot className="w-4 h-4 text-purple-500" /> };
  if (t.includes("logged_in")) return { label: "Login", variant: "blue", icon: <LogIn className="w-4 h-4 text-blue-500" /> };
  if (t.includes("registered")) return { label: "Registered", variant: "blue", icon: <CheckCircle2 className="w-4 h-4 text-blue-500" /> };
  return { label: t || "Activity", variant: "gray", icon: <ActivityIcon className="w-4 h-4 text-gray-500" /> };
}

export default function Activity() {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
const [toast, setToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    activityApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setItems(res?.data?.activities || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load activities");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (id) => {
    try {
      await activityApi.delete(id);
      setItems((prev) => (prev || []).filter((a) => (a._id || a.id) !== id));
      setToast("Activity deleted");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(err.message || "Failed to delete activity");
      setTimeout(() => setToast(null), 3000);
    }
  };

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
        <h1 className="text-xl font-bold text-gray-900">Activity</h1>
        {!loading && !error && (
          <Badge variant="gray">{items ? `${items.length} total` : "0 total"}</Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <p className="text-sm text-gray-400">No activity recorded yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
          <div className="divide-y divide-gray-50">
{items.map((item, i) => {
              const id = item._id || item.id;
              const meta = typePresentation(item.type);
              return (
                <div
                  key={id}
                  className="activity-pop-in flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition"
                  style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
                >
                  <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 break-words">
                      {item.message || item.type || "Activity"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {item.taskId && (
                        <span className="text-[10px] text-gray-400">Task {item.taskId}</span>
                      )}
                      {item.executionId && (
                        <span className="text-[10px] text-gray-400">Execution {item.executionId}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                    {timeAgo(item.createdAt)}
                  </span>
                  <button
                    onClick={() => handleDelete(id)}
                    title="Delete activity"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(239,68,68,0.2)] transition-all duration-200 ease-out shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[100]">
          <div
            className={`flex items-center gap-2.5 bg-white rounded-xl shadow-lg px-4 py-3 min-w-[240px] border ${
              toast.includes("Activity deleted") ? "border-green-200" : "border-red-200"
            }`}
          >
            {toast.includes("Activity deleted") ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <X className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <p className="text-xs font-medium text-gray-800">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
