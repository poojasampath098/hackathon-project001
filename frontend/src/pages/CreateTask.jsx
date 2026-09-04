import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { taskApi } from "../services/task.api";
import {
  scheduleTypes,
  frequencyOptions,
  frequencyLabels,
  defaultNextRun,
  formatDateTime,
} from "../utils/taskSchedule";

const steps = ["Details", "Schedule", "Review"];

export default function CreateTask() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");

  // Step 2
  const [scheduleType, setScheduleType] = useState("once");
  const [nextRunAt, setNextRunAt] = useState(defaultNextRun);
  const [frequency, setFrequency] = useState("daily");
  const [runWithoutApproval, setRunWithoutApproval] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const completed = step > 1;
  const completed2 = step > 2;

  const nextStep = () => {
    if (step < 3) setStep((s) => s + 1);
  };
  const prevStep = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleCreate = async () => {
    if (!taskName.trim()) return;
    const runDate = new Date(nextRunAt);
    if (Number.isNaN(runDate.getTime())) {
      showToast("Select a valid date and time for the first run", "error");
      return;
    }
    try {
      await taskApi.create({
        name: taskName.trim(),
        description,
        priority: priority.toLowerCase(),
        scheduleType,
        nextRunAt: runDate.toISOString(),
        frequency: scheduleType === "recurring" ? frequency : "once",
        requiresApproval: !runWithoutApproval,
      });
    } catch (err) {
      showToast(err.message || "Failed to create task", "error");
      return;
    }
    showToast(`'${taskName}' created successfully`);
    setTimeout(() => navigate("/agents"), 800);
  };

  return (
    <div className="p-6 flex flex-col gap-6 min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div />
        <TopBar />
      </div>

      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Create Task</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Set up a new task for your agents to handle
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 max-w-md">
        {steps.map((label, i) => {
          const num = i + 1;
          const isActive = num === step;
          const isDone = num < step;
          return (
            <div key={label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition ${
                    isDone
                      ? "bg-purple-600 text-white"
                      : isActive
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-400 border border-gray-200"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    num
                  )}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    isActive || isDone ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-[2px] w-10 mx-2 rounded-full transition ${
                    num < step ? "bg-purple-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Task Name
              </label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g., Data Extraction Routine"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what the agent needs to accomplish..."
                rows={4}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 placeholder:text-gray-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Priority
              </label>
              <div className="flex gap-2">
                {["Low", "Medium", "High"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                      priority === p
                        ? "bg-purple-600 text-white hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.4)] active:scale-95"
                        : "bg-gray-100 text-gray-500 hover:bg-purple-100/70 hover:-translate-y-0.5 active:scale-95"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2">
              <button
                onClick={() => navigate(-1)}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={nextStep}
                disabled={!taskName.trim()}
                className="bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Schedule Type
              </label>
              <div className="flex gap-2">
                {scheduleTypes.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setScheduleType(s.value)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                      scheduleType === s.value
                        ? "bg-purple-600 text-white hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.4)] active:scale-95"
                        : "bg-gray-100 text-gray-500 hover:bg-purple-100/70 hover:-translate-y-0.5 active:scale-95"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                {scheduleType === "recurring" ? "First Run (start date & time)" : "Start Date & Time"}
              </label>
              <input
                type="datetime-local"
                value={nextRunAt}
                onChange={(e) => setNextRunAt(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
              />
            </div>

            {scheduleType === "recurring" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Frequency
                </label>
                <div className="flex gap-2">
                  {frequencyOptions.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                        frequency === f.value
                          ? "bg-purple-600 text-white hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.4)] active:scale-95"
                          : "bg-gray-100 text-gray-500 hover:bg-purple-100/70 hover:-translate-y-0.5 active:scale-95"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="pr-4">
                <p className="text-xs font-semibold text-gray-700">
                  {runWithoutApproval
                    ? "Run immediately without approval"
                    : "Require approval before running"}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {runWithoutApproval
                    ? "The task runs at its scheduled time without needing approval."
                    : "The task waits for an approval before a scheduled run executes."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRunWithoutApproval((v) => !v)}
                aria-pressed={runWithoutApproval}
                className={`w-10 h-6 rounded-full transition relative shrink-0 ${
                  runWithoutApproval ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                    runWithoutApproval ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between mt-2 pt-2">
              <button
                onClick={prevStep}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={!nextRunAt || Number.isNaN(new Date(nextRunAt).getTime())}
                className="bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-gray-900">Review</h2>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Task Name", value: taskName || "—" },
                { label: "Priority", value: priority },
                {
                  label: "Schedule",
                  value: frequencyLabels[scheduleType === "recurring" ? frequency : "once"],
                },
                { label: "First Run", value: formatDateTime(nextRunAt) },
                { label: "Approval", value: runWithoutApproval ? "Not required" : "Required" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-gray-50 rounded-lg px-4 py-3"
                >
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                    {item.label}
                  </p>
                  <p className="text-xs font-semibold text-gray-800 mt-0.5">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {description && (
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  Description
                </p>
                <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
                  {description}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2">
              <button
                onClick={prevStep}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                className="bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out"
              >
                Create Task
              </button>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}
