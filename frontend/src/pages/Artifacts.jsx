import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, FileText, Trash2, Search, Bell, XCircle, CheckCircle2 } from "lucide-react";
import Badge from "../components/ui/Badge";
import { artifactApi } from "../services/artifact.api";
import { taskApi } from "../services/task.api";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function typeBadge(type) {
  switch (type) {
    case "execution_output":
      return <Badge variant="yellow">Execution Output</Badge>;
    case "ai_response":
      return <Badge variant="purple">AI Response</Badge>;
    case "document":
      return <Badge variant="blue">Document</Badge>;
    case "report":
      return <Badge variant="green">Report</Badge>;
    default:
      return <Badge variant="gray">{type || "Unknown"}</Badge>;
  }
}

function showDownloadedContent(content, name) {
  const value = content && typeof content === "object" ? content : { content };
  const json = JSON.stringify(value, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(name || "artifact").replace(/[^a-zA-Z0-9_\-. ]/g, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Artifacts() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const initRef = useRef(false);
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
    if (!initRef.current) {
      initRef.current = true;
      artifactApi
        .getAll()
        .then((res) => {
          setItems(res?.data?.artifacts || []);
          setError(null);
        })
        .catch((err) => {
          setError(err.message || "Could not load artifacts");
        })
        .finally(() => setLoading(false));
    }
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

  const handleDownload = async (id, name) => {
    try {
      const res = await artifactApi.download(id);
      showDownloadedContent(res?.data ?? res, name);
      const safe = (name || "artifact").replace(/[^a-zA-Z0-9_\-. ]/g, "_");
      showToast(`${safe || "Artifact"} downloaded`);
    } catch (err) {
      showToast(err.message || "Download failed", "error");
    }
  };

  const handleDelete = async (id) => {
    try {
      await artifactApi.delete(id);
      setItems((prev) => prev.filter((a) => (a._id || a.id) !== id));
      showToast("Artifact deleted");
    } catch (err) {
      showToast(err.message || "Failed to delete artifact", "error");
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
          <h1 className="text-xl font-bold text-gray-900">Artifacts</h1>
          <Badge variant="gray">
            {loading ? "..." : `${items.length} total`}
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
            <p className="text-sm text-gray-400">No artifacts yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const id = item._id || item.id;
              const task = tasks[item.taskId] || {};
              return (
                <div
                  key={id}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/artifacts/${id}`)}
                        className="text-sm font-semibold text-gray-900 hover:text-purple-700 truncate max-w-[360px] block text-left"
                      >
                        {item.name || "Untitled"}
                      </button>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400">
                        {task.title && (
                          <>
                            <span className="truncate max-w-[220px]">{task.title}</span>
                            <span>&middot;</span>
                          </>
                        )}
                        <span>{item.taskId ? `Task ${item.taskId}` : "No task"}</span>
                        {item.executionId && (
                          <>
                            <span>&middot;</span>
                            <span>Execution {item.executionId}</span>
                          </>
                        )}
                        <span>&middot;</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {typeBadge(item.type)}
                    <button
                      onClick={() => handleDownload(id, item.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(239,68,68,0.25)] active:scale-95 transition-all duration-200 ease-out"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
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