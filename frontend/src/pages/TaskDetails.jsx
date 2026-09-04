import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import Badge from "../components/ui/Badge";
import { taskApi } from "../services/task.api";
import { executionApi } from "../services/execution.api";
import { artifactApi } from "../services/artifact.api";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
};

const formatDuration = (ms) => {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return "—";
  const total = Math.max(0, Number(ms));
  if (total < 1000) return `${(total / 1000).toFixed(2)}s`;
  const seconds = Math.floor(total / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
};

function statusBadge(status) {
  switch (status) {
    case "completed":
      return <Badge variant="green">Completed</Badge>;
    case "running":
      return <Badge variant="blue">Running</Badge>;
    case "failed":
      return <Badge variant="red">Failed</Badge>;
    case "cancelled":
      return <Badge variant="gray">Cancelled</Badge>;
    default:
      return <Badge variant="yellow">Pending</Badge>;
  }
}

function artifactTypeBadge(type) {
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
      return <Badge variant="gray">{type || "Artifact"}</Badge>;
  }
}

// The engine stores the agent's deliverable inside execution.output.output
// (a plain-text string) with metadata on the surrounding object.
function resolveResultText(execution) {
  const output = execution && execution.output;
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output.output === "string") return output.output;
  if (typeof output.message === "string") return output.message;
  if (typeof output.content === "string") return output.content;
  return "";
}

function hasResult(execution) {
  if (!execution || execution.status !== "completed") return false;
  return resolveResultText(execution).length > 0;
}

// Only real URLs that actually appear in the stored result payload are shown.
function extractSources(execution) {
  const sources = [];
  const output = execution && execution.output;
  const seen = new Set();

  const add = (value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const m = value.match(/https?:\/\/[^\s)"'<>]+/g);
    if (!m) return;
    m.forEach((url) => {
      const clean = url.replace(/[.,;:!?]+$/, "");
      if (!seen.has(clean)) {
        seen.add(clean);
        sources.push(clean);
      }
    });
  };

  if (output && typeof output === "object") {
    ["sources", "sourceUrls", "source_urls", "urls", "references", "links"].forEach((key) => {
      const value = output[key];
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
    });
    if (typeof output.output === "string") add(output.output);
    if (typeof output.content === "string") add(output.content);
  }

  return sources;
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function downloadArtifactFile(content, name) {
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

export default function TaskDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef(null);

  const [executions, setExecutions] = useState([]);
  const [executionsLoading, setExecutionsLoading] = useState(true);

  const [resultExec, setResultExec] = useState(null);
  const [resultArtifacts, setResultArtifacts] = useState([]);
  const [resultArtifactsLoading, setResultArtifactsLoading] = useState(false);
  const [previewArtifactId, setPreviewArtifactId] = useState(null);

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    taskApi
      .getById(id)
      .then((res) => {
        if (cancelled) return;
        setTask(res?.data?.task || null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load task");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    executionApi
      .getByTask(id)
      .then((res) => {
        if (cancelled) return;
        setExecutions(Array.isArray(res?.data?.executions) ? res.data.executions : []);
      })
      .catch(() => {
        if (cancelled) return;
        setExecutions([]);
      })
      .finally(() => {
        if (!cancelled) setExecutionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const openResult = async (execution) => {
    setResultExec(execution);
    setPreviewArtifactId(null);
    const executionId = execution?.id || execution?._id;
    if (!executionId) return;
    setResultArtifactsLoading(true);
    try {
      const res = await artifactApi.getByExecution(executionId);
      setResultArtifacts(Array.isArray(res?.data?.artifacts) ? res.data.artifacts : []);
    } catch {
      setResultArtifacts([]);
    } finally {
      setResultArtifactsLoading(false);
    }
  };

  const closeResult = () => {
    setResultExec(null);
    setResultArtifacts([]);
    setPreviewArtifactId(null);
  };

  const handleArtifactDownload = async (artifact) => {
    const artifactId = artifact?._id || artifact?.id;
    if (!artifactId) return;
    try {
      const res = await artifactApi.download(artifactId);
      downloadArtifactFile(res?.data ?? res, artifact.name);
      showToast("Artifact downloaded");
    } catch (err) {
      showToast(err.message || "Download failed", "error");
    }
  };

  const handlePatch = async (status) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await taskApi.patch(id, { status });
      setTask(res?.data?.task || task);
      showToast("Task updated successfully");
    } catch (err) {
      showToast(err.message || "Failed to update task", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await taskApi.delete(id);
      showToast("Task deleted successfully");
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err) {
      setBusy(false);
      showToast(err.message || "Failed to delete task", "error");
    }
  };

  const infoItems = [
    { label: "ID", value: task?.id },
    { label: "Agent", value: task?.agent || "—" },
    { label: "Schedule", value: capitalize(task?.scheduleType) },
    { label: "Time", value: task?.time || "—" },
    { label: "Priority", value: capitalize(task?.priority) },
    {
      label: "Approval",
      value: task?.requiresApproval ? "Required" : "Not required",
    },
    { label: "Created", value: formatDate(task?.createdAt) },
    { label: "Updated", value: formatDate(task?.updatedAt) },
  ];

  const resultText = resultExec ? resolveResultText(resultExec) : "";
  const resultSources = resultExec ? extractSources(resultExec) : [];

  return (
    <div className="p-6 flex flex-col gap-6 min-h-screen">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      ) : !task ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400">Task not found</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">
                  {(task.agent || "T").charAt(0)}
                </span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={task.badgeVariant}>{task.badge}</Badge>
                  <Badge variant={task.priority === "high" ? "red" : task.priority === "low" ? "gray" : "yellow"}>
                    {capitalize(task.priority)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {task.status !== "completed" && (
                <button
                  onClick={() => handlePatch("completed")}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Complete
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(239,68,68,0.25)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl flex flex-col gap-5 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">
                Description
              </p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {task.description || "No description provided."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {infoItems.map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                    {item.label}
                  </p>
                  <p className="text-xs font-semibold text-gray-800 mt-0.5 truncate">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {task.scheduleType === "recurring" && task.time && (
              <div className="flex items-center gap-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Recurring
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {task.time}
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="w-3 h-3" /> {task.agent || "No agent"}
                </span>
              </div>
            )}
          </div>

          {/* Execution History / Result */}
          <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Execution History
              </h2>
              <span className="text-[10px] text-gray-400">
                {executions.length} {executions.length === 1 ? "run" : "runs"}
              </span>
            </div>

            {executionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : executions.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                No executions yet. This task has not been run.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {executions.map((exec, index) => {
                  const executionId = exec.id || exec._id;
                  const hasOutput = hasResult(exec);
                  return (
                    <div
                      key={executionId || index}
                      className="border border-gray-100 rounded-xl p-3.5 flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {statusBadge(exec.status)}
                          {exec.status === "running" && (
                            <span className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-400">
                          <span>Started {formatDate(exec.startedAt)}</span>
                          {exec.completedAt && (
                            <span>Completed {formatDate(exec.completedAt)}</span>
                          )}
                          <span>Duration {formatDuration(exec.duration)}</span>
                        </div>
                        {exec.status === "failed" && exec.error && (
                          <p className="text-[11px] text-red-600 mt-1.5 break-words">
                            Execution failed: {exec.error}
                          </p>
                        )}
                        {exec.status === "pending" && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            Waiting for execution
                          </p>
                        )}
                        {exec.status === "running" && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            Execution in progress...
                          </p>
                        )}
                        {exec.status === "completed" && !hasOutput && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            Completed — no result was produced
                          </p>
                        )}
                      </div>
                      {hasOutput ? (
                        <button
                          onClick={() => openResult(exec)}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Result
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Result modal */}
      {resultExec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  Task Result
                </p>
                <h3 className="text-sm font-bold text-gray-900 truncate mt-0.5">
                  {task?.title || "Execution result"}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {statusBadge(resultExec.status)}
                  <span className="text-[11px] text-gray-400">
                    Ran {formatDate(resultExec.startedAt)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Duration {formatDuration(resultExec.duration)}
                  </span>
                </div>
              </div>
              <button
                onClick={closeResult}
                className="p-1.5 rounded-lg hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.05] transition-all duration-200 ease-out shrink-0"
                aria-label="Close result"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto flex flex-col gap-5">
              {resultText ? (
                <section>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Summary / Result
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-4 overflow-x-auto">
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                      {resultText}
                    </p>
                  </div>
                </section>
              ) : (
                <section>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Summary / Result
                  </h4>
                  <div className="bg-gray-50 rounded-xl p-4 overflow-x-auto">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                      {resultExec.output !== undefined && resultExec.output !== null
                        ? formatJson(resultExec.output)
                        : "No result payload was stored for this execution."}
                    </pre>
                  </div>
                </section>
              )}

              {resultSources.length > 0 ? (
                <section>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Sources
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {resultSources.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:text-purple-700 hover:underline break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <section>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Sources
                  </h4>
                  <p className="text-xs text-gray-400">
                    This execution recorded no source URLs.
                  </p>
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    Artifacts
                  </h4>
                  <span className="text-[10px] text-gray-400">
                    {resultArtifactsLoading
                      ? "Loading..."
                      : `${resultArtifacts.length} artifact${resultArtifacts.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                {resultArtifactsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : resultArtifacts.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No artifacts were stored for this run.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {resultArtifacts.map((artifact) => {
                      const artifactId = artifact._id || artifact.id;
                      const isOpen = previewArtifactId === artifactId;
                      return (
                        <div
                          key={artifactId}
                          className="border border-gray-100 rounded-xl p-3.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800 truncate">
                                {artifact.name || "Untitled artifact"}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {artifactTypeBadge(artifact.type)}
                                <span className="text-[10px] text-gray-400">
                                  {formatDate(artifact.createdAt)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                setPreviewArtifactId(isOpen ? null : artifactId)
                              }
                              className="text-[10px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out active:scale-95 shrink-0"
                            >
                              {isOpen ? "Hide" : "Preview"}
                            </button>
                            <button
                              onClick={() => handleArtifactDownload(artifact)}
                              className="flex items-center gap-1 text-[10px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg hover:-translate-y-0.5 hover:scale-[1.02] transition-all duration-200 ease-out active:scale-95 shrink-0"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          </div>
                          {isOpen && (
                            <pre className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-[280px]">
                              {artifact.content !== undefined && artifact.content !== null
                                ? formatJson(artifact.content)
                                : "—"}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                  Execution
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                      Status
                    </p>
                    <div className="mt-1">{statusBadge(resultExec.status)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                      Duration
                    </p>
                    <p className="text-xs font-semibold text-gray-800 mt-1">
                      {formatDuration(resultExec.duration)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                      Started
                    </p>
                    <p className="text-xs font-semibold text-gray-800 mt-1">
                      {formatDate(resultExec.startedAt)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3.5 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                      Completed
                    </p>
                    <p className="text-xs font-semibold text-gray-800 mt-1">
                      {formatDate(resultExec.completedAt)}
                    </p>
                  </div>
                </div>

                {(resultExec.steps || []).length > 0 && (
                  <div className="mt-3 bg-gray-50 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                      Execution Flow
                    </p>
                    <div className="flex flex-col gap-2">
                      {(resultExec.steps || []).map((step, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                              step.status === "completed"
                                ? "bg-green-500"
                                : step.status === "failed"
                                ? "bg-red-500"
                                : step.status === "skipped"
                                ? "bg-gray-300"
                                : "bg-amber-400"
                            }`}
                          />
                          <span className="text-gray-700 font-medium truncate">
                            {step.name}
                          </span>
                          {step.status === "failed" && step.error ? (
                            <span className="text-red-600 truncate">
                              — {step.error}
                            </span>
                          ) : (
                            <span className="text-gray-400 capitalize">
                              {step.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resultExec.input &&
                  typeof resultExec.input === "object" &&
                  Object.keys(resultExec.input).length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                        Input
                      </p>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                        {formatJson(resultExec.input)}
                      </pre>
                    </div>
                  )}
              </section>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-5 right-5 z-[100]" style={{ animation: "fadeIn 0.15s ease-out" }}>
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
    </div>
  );
}