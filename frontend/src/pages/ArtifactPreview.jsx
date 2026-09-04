import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Trash2, FileText, Search, Bell, XCircle, CheckCircle2 } from "lucide-react";
import Badge from "../components/ui/Badge";
import { artifactApi } from "../services/artifact.api";

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

function formatContent(content) {
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
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

export default function ArtifactPreview() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    let cancelled = false;
    artifactApi
      .getById(id)
      .then((res) => {
        if (cancelled) return;
        setItem(res?.data?.artifact || null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load artifact");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleDownload = async () => {
    if (!item) return;
    const artifactId = item._id || item.id;
    try {
      const res = await artifactApi.download(artifactId);
      showDownloadedContent(res?.data ?? res, item.name);
      showToast("Artifact downloaded");
    } catch (err) {
      showToast(err.message || "Download failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    const artifactId = item._id || item.id;
    try {
      await artifactApi.delete(artifactId);
      showToast("Artifact deleted");
      navigate("/artifacts");
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
          onClick={() => navigate("/artifacts")}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Artifacts
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : !item ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-sm text-gray-400">Artifact not found</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">
                    {item.name || "Untitled"}
                  </h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    {typeBadge(item.type)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(239,68,68,0.25)] active:scale-95 transition-all duration-200 ease-out"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Details</h2>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400 text-xs">Task</span>
                    <span className="text-gray-800 text-xs font-medium truncate max-w-[200px]">
                      {item.taskId || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400 text-xs">Execution</span>
                    <span className="text-gray-800 text-xs font-medium truncate max-w-[200px]">
                      {item.executionId || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400 text-xs">Created</span>
                    <span className="text-gray-800 text-xs font-medium">{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400 text-xs">Updated</span>
                    <span className="text-gray-800 text-xs font-medium">{formatDate(item.updatedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Metadata</h2>
                <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto flex-1">
                  {item.metadata && Object.keys(item.metadata).length > 0
                    ? formatContent(item.metadata)
                    : "—"}
                </pre>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Content</h2>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-[420px]">
                {item.content !== undefined && item.content !== null
                  ? formatContent(item.content)
                  : "—"}
              </pre>
            </div>
          </>
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