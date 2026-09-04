import { useState, useEffect, useRef } from "react";
import { Search, Bell, Plus, X, Trash2, Pencil, Calendar, CheckCircle2, XCircle, Power } from "lucide-react";
import Badge from "../components/ui/Badge";
import { scheduleApi } from "../services/schedule.api";
import { taskApi } from "../services/task.api";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function frequencyBadge(frequency) {
  switch (frequency) {
    case "daily":
      return <Badge variant="blue">Daily</Badge>;
    case "weekly":
      return <Badge variant="purple">Weekly</Badge>;
    case "monthly":
      return <Badge variant="indigo">Monthly</Badge>;
    default:
      return <Badge variant="gray">Once</Badge>;
  }
}

function enabledBadge(enabled) {
  return enabled ? <Badge variant="green">Enabled</Badge> : <Badge variant="red">Disabled</Badge>;
}

const emptyForm = { taskId: "", frequency: "once", nextRunAt: "" };

export default function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const initRef = useRef(false);
  const toastTimer = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      scheduleApi
        .getAll()
        .then((res) => {
          setSchedules(res?.data?.schedules || []);
          setError(null);
        })
        .catch((err) => {
          setError(err.message || "Could not load schedules");
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (schedule) => {
    setEditing(schedule);
    setForm({
      taskId: schedule.taskId || "",
      frequency: schedule.frequency || "once",
      nextRunAt: toLocalInput(schedule.nextRunAt),
      enabled: schedule.enabled !== false,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        taskId: form.taskId,
        frequency: form.frequency,
        nextRunAt: new Date(form.nextRunAt).toISOString(),
      };
      if (editing) {
        payload.enabled = form.enabled;
        const res = await scheduleApi.update(editing._id || editing.id, payload);
        const updated = res?.data?.schedule;
        const id = editing._id || editing.id;
        setSchedules((prev) => prev.map((s) => ((s._id || s.id) === id ? updated : s)));
        showToast("Schedule updated");
      } else {
        const res = await scheduleApi.create(payload);
        const created = res?.data?.schedule;
        setSchedules((prev) => [created, ...prev]);
        showToast("Schedule created");
      }
      setModalOpen(false);
    } catch (err) {
      showToast(err.message || "Failed to save schedule", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule) => {
    const id = schedule._id || schedule.id;
    try {
      const res = await scheduleApi.toggle(id, !schedule.enabled);
      const updated = res?.data?.schedule;
      setSchedules((prev) => prev.map((s) => ((s._id || s.id) === id ? updated : s)));
      showToast(updated ? `Schedule ${updated.enabled ? "enabled" : "disabled"}` : "Schedule updated");
    } catch (err) {
      showToast(err.message || "Failed to update schedule", "error");
    }
  };

  const handleDelete = async (schedule) => {
    const id = schedule._id || schedule.id;
    try {
      await scheduleApi.delete(id);
      setSchedules((prev) => prev.filter((s) => (s._id || s.id) !== id));
      showToast("Schedule deleted");
    } catch (err) {
      showToast(err.message || "Failed to delete schedule", "error");
    }
  };

  const canSubmit = Boolean(form.taskId) && Boolean(form.nextRunAt);

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Schedules</h1>
            <Badge variant="gray">
              {loading ? "..." : `${schedules.length} total`}
            </Badge>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out"
          >
            <Plus className="w-3.5 h-3.5" />
            New Schedule
          </button>
        </div>
        <p className="text-sm text-gray-500 -mt-4 max-w-2xl">
          Schedule existing tasks to run once or on a recurring basis.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center">
            <p className="text-sm text-gray-400">No schedules yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((schedule) => {
              const id = schedule._id || schedule.id;
              const task = tasks[schedule.taskId] || {};
              return (
                <div
                  key={id}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate max-w-[360px]">
                        {task.title || (schedule.taskId ? `Task ${schedule.taskId}` : "Untitled task")}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                        {frequencyBadge(schedule.frequency)}
                        {enabledBadge(schedule.enabled)}
                        <span>Next: {formatDate(schedule.nextRunAt)}</span>
                        <span>&middot;</span>
                        <span>Last: {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : "Never"}</span>
                        <span>&middot;</span>
                        <span>Created: {formatDate(schedule.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(schedule)}
                      title="Edit schedule"
                      className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.3)] transition-all duration-200 ease-out"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(schedule)}
                      title={schedule.enabled ? "Disable schedule" : "Enable schedule"}
                      className={`p-2 rounded-lg transition-all duration-200 ease-out ${
                        schedule.enabled
                          ? "text-green-500 hover:bg-green-50 hover:-translate-y-0.5 hover:scale-[1.02]"
                          : "text-gray-400 hover:bg-gray-100 hover:-translate-y-0.5 hover:scale-[1.02]"
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(schedule)}
                      title="Delete schedule"
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(239,68,68,0.2)] transition-all duration-200 ease-out"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold text-gray-900">
                  {editing ? "Edit Schedule" : "New Schedule"}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.05] transition-all duration-200 ease-out"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Task
                  </label>
                  <select
                    value={form.taskId}
                    onChange={(e) => setForm({ ...form, taskId: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  >
                    <option value="">Select a task</option>
                    {Object.values(tasks).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title || `Task ${t.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Frequency
                  </label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Next Run
                  </label>
                  <input
                    type="datetime-local"
                    value={form.nextRunAt}
                    onChange={(e) => setForm({ ...form, nextRunAt: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>

                {editing && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Enabled
                    </label>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, enabled: !form.enabled })}
                      className={`w-10 h-6 rounded-full transition relative ${
                        form.enabled ? "bg-green-500" : "bg-gray-300"
                      }`}
                      aria-pressed={form.enabled}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                          form.enabled ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !canSubmit}
                  className="w-full bg-gradient-to-r from-purple-900 to-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-[0.98] transition-all duration-200 ease-out disabled:opacity-50 mt-1"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Schedule"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Toast */}
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
      </main>
  );
}