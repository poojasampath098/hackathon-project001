import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Send,
  Mic,
  X,
  Plus,
  Square,
  FileText,
  Image,
  Bot,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Upload,
  Loader,
  Paperclip,
} from "lucide-react";
import Badge from "../components/ui/Badge";
import TopBar from "../components/layout/TopBar";
import { taskApi } from "../services/task.api";
import { aiApi } from "../services/ai.api";
import { artifactApi } from "../services/artifact.api";
import { scheduleTypes, frequencyOptions, defaultNextRun } from "../utils/taskSchedule";

const quickActions = ["Schedule a task", "Check status", "View recent logs"];

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

const initialMessages = [];

// Chat thread this page talks to (matches the "Data Extraction Specialist" agent).
const AGENT_THREAD_ID = "data-extraction";

// Menu items for the + button
const MENU_ITEMS = [
  { label: "Upload Files", icon: FileText, accept: "*/*" },
  { label: "Photos", icon: Image, accept: "image/*" },
  //{ label: "Screenshot", icon: Camera, accept: null },
];

const initialNewTask = () => ({
  name: "",
  scheduleType: "once",
  nextRunAt: defaultNextRun(),
  frequency: "daily",
  runWithoutApproval: false,
});

export default function Agents() {
  const navigate = useNavigate();
  const [scheduled, setScheduled] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState(initialNewTask());

  useEffect(() => {
    let cancelled = false;
    taskApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setScheduled(res?.data?.tasks || []);
        setTasksError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setTasksError("Could not load scheduled tasks");
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Calendar state
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => new Date().getDate());

  const monthDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  // Chat state
  const [messages, setMessages] = useState(initialMessages);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  // Toast state
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ---- NEW: menu & voice states ----
  const [showMenu, setShowMenu] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const menuRef = useRef(null);

  // ---- File upload state ----
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // ---- Pending composer attachments (not yet sent as a chat message) ----
  const [composerAttachments, setComposerAttachments] = useState([]);

  // ---- Voice recording refs ----
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingMimeRef = useRef(null);
  const voiceIdRef = useRef(0);

  // ---- Speech recognition refs ----
  const recognitionRef = useRef(null);
  const recognitionFinalRef = useRef("");
  const recognitionInterimRef = useRef("");
  const voiceFinishRef = useRef(false);

  // ---- Live waveform refs ----
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const waveformRef = useRef(null);
  const WAVEFORM_BARS = 30;

  // Extract a human-friendly error message from an API error. The backend may
  // return the real reason in err.response.data.error/message — never show the
  // generic "AI service is currently unavailable" banner for these.
  const errorMessage = (err, fallback = "Something went wrong") => {
    if (!err) return fallback;
    const data = err.response?.data;
    const detail = data?.error || data?.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
    return fallback;
  };

  // Pick a MIME type the browser supports, preferring OPUS/WebM.
  const chooseRecordingMime = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "",
    ];
    const found = candidates.find((c) => !c || (window.MediaRecorder && window.MediaRecorder.isTypeSupported(c)));
    return found !== undefined ? found : "";
  };

  // Stop and release the microphone stream.
  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const showToast = (message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  // ---- Load persisted chat history for this thread on mount ----
  useEffect(() => {
    let cancelled = false;
    aiApi
      .history(AGENT_THREAD_ID)
      .then((res) => {
        if (cancelled) return;
        const persisted = Array.isArray(res?.data?.messages) ? res.data.messages : [];
        if (persisted.length === 0) return;
        setMessages(
          persisted.map((m) => ({
            id: m.id || Date.now() + Math.random(),
            role: m.role,
            type: m.messageType === "error" ? "error" : m.messageType || "text",
            text: m.content || "",
            attachments: Array.isArray(m.attachments)
              ? m.attachments.map((a) => ({
                  id: a.artifactId || a.id,
                  name: a.name || "file",
                  artifact: { content: { mimetype: a.mimetype || "", secureUrl: a.secureUrl || null } },
                }))
              : [],
          }))
        );
      })
      .catch(() => {
        // Silent: history is best-effort; start with an empty conversation.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showMenu]);

  // Unified send: sends the typed text together with all pending attachment ids
  // in a single request, then clears the composer. Surfaces the real backend
  // error (not the generic banner) for non-network failures.
  const performChatSend = async (text, attachments) => {
    const pending = attachments || [];
    const ids = pending.map((a) => a.id).filter(Boolean);
    const hasText = Boolean(text);
    const hasFiles = ids.length > 0;

    const attachmentMap = pending.map((a) => ({
      id: a.id,
      name: a.name,
      artifact: a.artifact,
    }));
    const loadingText = hasText ? text : hasFiles ? "Analyzing attachment" : "";

    const userMsg = {
      id: Date.now(),
      role: "user",
      text,
      attachments: attachmentMap,
      type: hasFiles && hasText ? "composed" : hasFiles ? "file" : "text",
    };
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: Date.now() + 1, role: "agent", type: "loading", text: loadingText },
    ]);
    setChatInput("");
    setComposerAttachments([]);

    try {
      const res = await aiApi.chat(text, ids, AGENT_THREAD_ID);
      const reply = res?.data?.data?.response || res?.data?.response || "I couldn't find an answer.";
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "loading" && m.text === loadingText
            ? { id: Date.now() + 2, role: "agent", text: reply }
            : m
        )
      );
    } catch (err) {
      const isNetwork = typeof err?.status !== "number";
      const detail = isNetwork
        ? "Network error — could not reach the agent. Please try again."
        : errorMessage(err, "The agent could not process your request.");
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "loading" && m.text === loadingText
            ? { id: Date.now() + 2, role: "agent", type: "error", text: detail }
            : m
        )
      );
    }
  };

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text && composerAttachments.length === 0) return;
    await performChatSend(text, composerAttachments);
  }, [chatInput, composerAttachments]);

  const handleChatKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleQuickAction = (action) => {
    setChatInput(action);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTask.name.trim()) return;
    const taskName = newTask.name.trim();
    const runDate = new Date(newTask.nextRunAt);
    if (Number.isNaN(runDate.getTime())) {
      showToast("Select a valid date and time for the first run", "error");
      return;
    }
    try {
      await taskApi.create({
        name: taskName,
        scheduleType: newTask.scheduleType,
        nextRunAt: runDate.toISOString(),
        frequency: newTask.scheduleType === "recurring" ? newTask.frequency : "once",
        requiresApproval: !newTask.runWithoutApproval,
      });
      const res = await taskApi.getAll();
      setScheduled(res?.data?.tasks || []);
      setNewTask(initialNewTask());
      setShowModal(false);
      showToast(`'${taskName}' created successfully`);
    } catch (err) {
      showToast(err.message || "Failed to create task", "error");
    }
  };

  // ---- Menu action (file upload) ----
  const handleMenuAction = (item) => {
    setShowMenu(false);
    if (fileInputRef.current) {
      if (item.accept) fileInputRef.current.accept = item.accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // ---- Hidden file input change: stage for later, or send immediately when no text ----
  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      showToast("Each file must be 5MB or smaller", "error");
      e.target.value = "";
      return;
    }
    e.target.value = "";
    if (chatInput.trim().length === 0) {
      // No typed message: attach + send immediately as a file-only chat message.
      void sendFilesImmediately(files);
    } else {
      // Text typed: keep staging so they combine with the message on send.
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  // Upload files (no typed message) and send them at once.
  const sendFilesImmediately = async (files) => {
    setUploadingFiles(true);
    const uploaded = [];
    try {
      for (const file of files) {
        const res = await artifactApi.upload(file);
        const artifact = res?.data?.artifact || null;
        if (artifact?.id) {
          uploaded.push({ id: artifact.id, name: artifact.name || file.name, artifact });
        }
      }
      if (uploaded.length === 0) {
        showToast("No files were uploaded", "error");
        return;
      }
      await performChatSend("", uploaded);
      showToast("Attachment sent");
    } catch (err) {
      showToast(errorMessage(err, "File upload failed"), "error");
    } finally {
      setUploadingFiles(false);
    }
  };

  // ---- Remove a queued file ----
  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ---- Remove a pending composer attachment ----
  const removeComposerAttachment = (id) => {
    setComposerAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- Attachment display helpers (image preview vs generic file) ----
  const isImageAttachment = (att) => {
    const mime = att?.artifact?.content?.mimetype || att?.artifact?.metadata?.mimetype || "";
    return /^image\//i.test(mime) || Boolean(att?.artifact?.content?.secureUrl);
  };
  const attachmentImageUrl = (att) => att?.artifact?.content?.secureUrl || null;

  // ---- Upload queued files ----
  const handleUploadFiles = async () => {
    if (selectedFiles.length === 0) return;
    setUploadingFiles(true);
    const newAttachments = [];
    try {
      for (const file of selectedFiles) {
        const res = await artifactApi.upload(file);
        const uploaded = res?.data?.artifact || null;
        if (uploaded?.id) {
          newAttachments.push({ id: uploaded.id, name: uploaded.name || file.name, artifact: uploaded });
        }
      }
      if (newAttachments.length > 0) {
        setComposerAttachments((prev) => [...prev, ...newAttachments]);
      }
      setSelectedFiles([]);
      showToast(
        `${newAttachments.length === 1 ? "Attachment" : "Attachments"} added to your message`
      );
    } catch (err) {
      showToast(err.message || "File upload failed", "error");
    } finally {
      setUploadingFiles(false);
    }
  };

  // ---- Live Web Audio waveform while recording ----
  const startWaveform = (stream) => {
    stopWaveform();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = waveformRef.current;

      const draw = () => {
        analyser.getByteFrequencyData(data);
        if (bars) {
          const nodeCount = bars.children.length || WAVEFORM_BARS;
          for (let i = 0; i < nodeCount; i++) {
            const bar = bars.children[i];
            if (!bar) continue;
            const bin = Math.floor((i / nodeCount) * data.length);
            const value = data[bin] || 0;
            const height = Math.max(6, Math.round((value / 255) * 18));
            bar.style.height = `${height}px`;
          }
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch {
      // AudioContext waveform is best-effort; recording still works.
      audioCtxRef.current = null;
    }
  };

  const stopWaveform = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  function cleanupRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordingMimeRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    stopWaveform();
    stopMediaStream();
    voiceFinishRef.current = true;
  }

  // ---- Finalize the recording: send the recognized text, or attach the audio ----
  const handleRecordingStop = async () => {
    const chunks = audioChunksRef.current;
    const mime = recordingMimeRef.current;
    let blob;
    try {
      blob = new Blob(chunks, { type: mime || "audio/webm" });
    } catch {
      blob = new Blob(chunks);
    }
    const transcript = `${recognitionFinalRef.current} ${recognitionInterimRef.current}`.trim();
    cleanupRecording();

    if (!blob || blob.size === 0) {
      setVoiceStatus("idle");
      setLiveTranscript("");
      showToast("Recording was empty", "error");
      return;
    }

    if (transcript) {
      // Recognized speech becomes the user's message and is sent to the agent.
      setLiveTranscript("");
      await performChatSend(transcript, []);
      setVoiceStatus("idle");
      return;
    }

    // Fallback: no transcript (no speech support or nothing recognized).
    // Upload the audio and still send a message so the agent always replies.
    const ext = mime && mime.includes("mp4")
      ? "m4a"
      : mime && mime.includes("ogg")
      ? "ogg"
      : "webm";
    const file = new File([blob], `voice-message-${voiceIdRef.current++}.${ext}`, {
      type: blob.type || "audio/webm",
    });

    try {
      const res = await artifactApi.upload(file);
      const artifact = res?.data?.artifact || null;
      if (!artifact?.id) {
        showToast("Voice message upload failed", "error");
        return;
      }
      await performChatSend("", [{ id: artifact.id, name: "Voice message", artifact }]);
    } catch (err) {
      showToast(errorMessage(err, "Voice message upload failed"), "error");
    } finally {
      setVoiceStatus("idle");
      setLiveTranscript("");
    }
  }

  useEffect(() => {
    // Release mic, audio graph, recorder and speech recognition on unmount
    return () => {
      voiceFinishRef.current = true;
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
      }
      cleanupRecording();
    };
  }, []);

  // Best-effort live transcription while recording (audio is sent as fallback).
  const startSpeechRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            recognitionFinalRef.current += recognitionFinalRef.current ? ` ${text}` : text;
          } else {
            interim += text;
          }
        }
        recognitionInterimRef.current = interim;
        setLiveTranscript(`${recognitionFinalRef.current} ${interim}`.trim());
      };
      rec.onerror = () => {
        // Speech errors (no-speech/aborted/network) are non-fatal: audio still records.
      };
      rec.onend = () => {
        recognitionRef.current = null;
        if (!voiceFinishRef.current) {
          try {
            rec.start();
          } catch {
            // ignore
          }
        }
      };
      rec.start();
      recognitionRef.current = rec;
    } catch {
      recognitionRef.current = null;
    }
  };

  // ---- Mic: start / stop real recording ----
  const startVoiceRecording = async () => {
    if (voiceStatus !== "idle") return;
    if (!window.MediaRecorder) {
      showToast("Voice recording is not supported in this browser", "error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = chooseRecordingMime();
      recordingMimeRef.current = mime;
      audioChunksRef.current = [];
      voiceFinishRef.current = false;
      recognitionFinalRef.current = "";
      recognitionInterimRef.current = "";
      setLiveTranscript("");

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = handleRecordingStop;
      recorder.onerror = () => {
        showToast("Recording failed", "error");
        setVoiceStatus("idle");
        setLiveTranscript("");
        cleanupRecording();
      };
      mediaRecorderRef.current = recorder;
      try {
        recorder.start();
      } catch {
        showToast("Could not start recording", "error");
        setVoiceStatus("idle");
        setLiveTranscript("");
        cleanupRecording();
        return;
      }
      startWaveform(stream);
      startSpeechRecognition();
      setVoiceStatus("recording");
    } catch {
      // Microphone permission denied or audio device unavailable.
      showToast("Microphone access denied or unavailable", "error");
      setVoiceStatus("idle");
      setLiveTranscript("");
      cleanupRecording();
    }
  };

  // Stop recording: flush final speech results before finalizing the message.
  const stopVoiceRecording = () => {
    if (voiceStatus !== "recording") return;
    voiceFinishRef.current = true;
    setVoiceStatus("processing");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    // Let SpeechRecognition deliver its final results (~250ms) before finalizing.
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    }, 250);
  };

  return (
    <div className="p-6 flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Agent Operations
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage scheduling and interact with your autonomous agents.
            </p>
          </div>
          <TopBar />
        </div>

        <div className="grid grid-cols-3 gap-5 flex-1">
          {/* Left: Chat Card */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm p-5 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-900">
                Talk to your Agent
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Data Extraction Specialist •{" "}
                <span className="text-green-500">Online</span>
              </p>
            </div>

            <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[340px] mb-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Bot className="w-8 h-8 text-gray-300" />
                  <p className="text-xs text-gray-400 max-w-[220px]">
                    Send a message to start a conversation with your agent.
                  </p>
                </div>
              )}
              {messages.map((msg) => {
                if (msg.role === "agent" && msg.type === "loading") {
                  return (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="border border-purple-200 bg-purple-50/50 rounded-xl rounded-tl-sm px-4 py-3 max-w-md">
                        <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1.5">
                          Thinking
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                          <p className="text-xs text-gray-500">Processing your request...</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (msg.role === "agent" && msg.type === "error") {
                  return (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="border border-red-200 bg-red-50/60 rounded-xl rounded-tl-sm px-4 py-3 max-w-md">
                        <p className="text-xs font-bold text-red-600 leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (msg.role === "agent") {
                  return (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="bg-gray-100 rounded-xl rounded-tl-sm px-3.5 py-2.5 max-w-md">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (msg.type === "composed") {
                  return (
                    <div key={msg.id} className="flex gap-2.5 justify-end">
                      <div className="bg-purple-600 rounded-xl rounded-tr-sm px-3.5 py-2.5 max-w-md flex flex-col gap-1.5">
                        {(msg.attachments || []).map((att) => {
                          const isImg =
                            /^image\//i.test(
                              att?.artifact?.content?.mimetype || att?.artifact?.metadata?.mimetype || ""
                            ) || Boolean(att?.artifact?.content?.secureUrl);
                          const imgUrl = att?.artifact?.content?.secureUrl || null;
                          return isImg && imgUrl ? (
                            <img
                              key={att.id}
                              src={imgUrl}
                              alt={att.name}
                              className="max-h-40 rounded object-cover"
                            />
                          ) : (
                            <div key={att.id} className="flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5 text-white/90" />
                              <p className="text-xs text-white">{att.name}</p>
                            </div>
                          );
                        })}
                        {msg.text ? (
                          <p className="text-xs text-white leading-relaxed">{msg.text}</p>
                        ) : null}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">A</span>
                      </div>
                    </div>
                  );
                }
                if (msg.type === "file") {
                  const fileAtts = msg.attachments && msg.attachments.length > 0 ? msg.attachments : [];
                  return (
                    <div key={msg.id} className="flex gap-2.5 justify-end">
                      <div className="bg-purple-600 rounded-xl rounded-tr-sm px-3.5 py-2.5 max-w-md flex flex-col gap-1">
                        {(fileAtts).map((att, i) => {
                          const isImg =
                            /^image\//i.test(
                              att?.artifact?.content?.mimetype || att?.artifact?.metadata?.mimetype || att?.mimetype || ""
                            ) || Boolean(att?.artifact?.content?.secureUrl || att?.secureUrl);
                          const imgUrl = att?.artifact?.content?.secureUrl || att?.secureUrl || null;
                          const name = att?.name || fileAtts[0]?.name || "";
                          if (isImg && imgUrl) {
                            return (
                              <img key={att.id || i} src={imgUrl} alt={name} className="max-h-40 rounded object-cover" />
                            );
                          }
                          return (
                            <div key={att.id || i} className="flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5 text-white/90" />
                              <p className="text-xs text-white font-medium">{name}</p>
                            </div>
                          );
                        })}
                        {msg.text ? (
                          <p className="text-xs text-purple-100">{msg.text}</p>
                        ) : null}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">A</span>
                      </div>
                    </div>
                  );
                }
                if (msg.type === "audio" && msg.url) {
                  return (
                    <div key={msg.id} className="flex gap-2.5 justify-end">
                      <div className="bg-purple-600 rounded-xl rounded-tr-sm px-3.5 py-2.5 max-w-md flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-white/90" />
                          <p className="text-xs text-white font-medium">Voice message</p>
                        </div>
                        <audio controls src={msg.url} className="w-56" />
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">A</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className="flex gap-2.5 justify-end">
                    <div className="bg-purple-600 rounded-xl rounded-tr-sm px-3.5 py-2.5 max-w-md">
                      <p className="text-xs text-white leading-relaxed">
                        {msg.text}
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">A</span>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mb-3">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  className="px-3 py-1.5 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded-full hover:bg-purple-100 hover:border-purple-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                >
                  {action}
                </button>
              ))}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* Queued files + Upload */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-col gap-2 mb-2">
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((f, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-[11px] text-purple-700"
                    >
                      <Paperclip className="w-3 h-3" />
                      {f.name}
                      <button
                        onClick={() => removeSelectedFile(i)}
                        className="text-purple-400 hover:text-purple-700 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleUploadFiles}
                  disabled={uploadingFiles}
                  className="flex items-center gap-1.5 w-fit px-3 py-1.5 text-[11px] font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-50"
                >
                  {uploadingFiles ? (
                    <Loader className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploadingFiles
                    ? "Uploading..."
                    : `Upload ${selectedFiles.length === 1 ? "File" : "Files"}`}
                </button>
              </div>
            )}

            {/* Pending composer attachments */}
            {composerAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {composerAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-[11px] text-purple-700"
                  >
                    {isImageAttachment(att) && attachmentImageUrl(att) ? (
                      <img
                        src={attachmentImageUrl(att)}
                        alt={att.name}
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5" />
                    )}
                    <span className="max-w-[160px] truncate">{att.name}</span>
                    <button
                      onClick={() => removeComposerAttachment(att.id)}
                      className="text-purple-400 hover:text-purple-700 transition"
                      title="Remove attachment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ---- CHAT INPUT WITH + MENU, VOICE & SEND ---- */}
            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-purple-300 focus-within:shadow-[0_0_8px_rgba(139,92,246,0.15)] transition-all duration-150">
              {voiceStatus === "recording" || voiceStatus === "processing" ? (
                <>
                  {/* Recording / processing replaces the text input with a live waveform */}
                  <div className="flex items-center gap-2 h-6 flex-1 min-w-0">
                    <Mic className="w-4 h-4 text-purple-600 shrink-0" />
                    {voiceStatus === "processing" && !liveTranscript ? (
                      <Loader className="w-3.5 h-3.5 text-purple-600 animate-spin shrink-0" />
                    ) : null}
                    <span className="text-xs text-gray-500 min-w-0 truncate shrink">
                      {voiceStatus === "processing"
                        ? liveTranscript || "Transcribing your voice message..."
                        : liveTranscript || "Listening..."}
                    </span>
                    <div
                      ref={waveformRef}
                      className="flex items-center gap-[3px] flex-1 justify-end px-1 overflow-hidden"
                      aria-hidden="true"
                    >
                      {Array.from({ length: WAVEFORM_BARS }).map((_, i) => (
                        <span
                          key={i}
                          className="w-[3px] flex-1 max-w-[6px] rounded-full bg-purple-500"
                          style={{ height: 8, transition: "height 90ms ease-out" }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={stopVoiceRecording}
                    disabled={voiceStatus === "processing"}
                    className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 hover:-translate-y-0.5 hover:scale-[1.05] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Stop and send voice message"
                    aria-label="Stop recording and send"
                  >
                    <Square className="w-4 h-4 text-white" />
                  </button>
                </>
              ) : (
                <>
                  {/* Plus button with menu */}
                  <div ref={menuRef} className="relative">
                    <button
                      onClick={() => setShowMenu((v) => !v)}
                      className="p-1.5 rounded-lg hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.05] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    >
                      <Plus className="w-4 h-4 text-purple-600" />
                    </button>
                    {showMenu && (
                      <div
                        className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[180px] overflow-hidden z-10"
                        style={{ backdropFilter: "blur(16px)" }}
                      >
                        {MENU_ITEMS.map((item) => (
                          <button
                            key={item.label}
                            onClick={() => handleMenuAction(item)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-black-400 hover:bg-purple-50 transition-colors"
                          >
                            <item.icon className="w-4 h-4 text-black-400" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Ask your agent to perform a task..."
                    className="flex-1 text-xs bg-transparent outline-none placeholder-gray-400"
                  />

                  {/* Mic button */}
                  <button
                    onClick={startVoiceRecording}
                    className="p-1.5 rounded-lg hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.05] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    title="Record a voice message"
                    aria-label="Start voice recording"
                  >
                    <Mic className="w-4 h-4 text-gray-400" />
                  </button>

                  <button
                    onClick={sendMessage}
                    className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 hover:-translate-y-0.5 hover:scale-[1.05] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    title="Send message"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: Scheduled Tasks (unchanged) */}
          <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900">
                Scheduled Tasks
              </h2>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-purple-900 to-purple-600 text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] transition-all duration-200 ease-out active:scale-95 active:shadow-[0_0_8px_rgba(139,92,246,0.3)]"
              >
                <Plus className="w-3 h-3" />
                Create Task
              </button>
            </div>

            {/* Mini Calendar */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-900">
                  {monthNames[calMonth]} {calYear}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={prevMonth}
                    className="p-0.5 rounded hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.1] transition-all duration-200 ease-out active:scale-90 active:shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                  >
                    <ChevronLeft className="w-3 h-3 text-gray-400" />
                  </button>
                  <button
                    onClick={nextMonth}
                    className="p-0.5 rounded hover:bg-purple-100 hover:-translate-y-0.5 hover:scale-[1.1] transition-all duration-200 ease-out active:scale-90 active:shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                  >
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {weekDays.map((d) => (
                  <div
                    key={d}
                    className="text-[9px] font-semibold text-gray-400 py-1"
                  >
                    {d}
                  </div>
                ))}
                {monthDays.map((day, i) => (
                  <button
                    key={i}
                    disabled={!day}
                    onClick={() => day && setSelectedDate(day)}
                    className={`text-[10px] py-1 rounded transition-all duration-150 ${
                      day && selectedDate === day
                        ? "bg-purple-600 text-white font-bold shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                        : day
                        ? "text-gray-600 hover:bg-purple-50 hover:text-purple-700 hover:-translate-y-0.5 cursor-pointer active:scale-90 active:shadow-[0_0_6px_rgba(139,92,246,0.25)]"
                        : ""
                    }`}
                  >
                    {day || ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Upcoming Today */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Upcoming Today
              </p>
              {scheduled.length > 3 && (
                <Link
                  to="/upcoming-today"
                  className="text-xs text-purple-600 font-medium hover:underline"
                  aria-label="View all upcoming tasks today"
                >
                  View All
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-2.5 flex-1">
              {tasksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tasksError ? (
                <p className="text-xs text-gray-400 py-4 text-center">{tasksError}</p>
              ) : scheduled.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No scheduled tasks</p>
              ) : (
                scheduled.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span>{task.time || "—"}</span>
                        <span>•</span>
                        <span>{task.agent || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
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
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Create Task Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold text-gray-900">
                  Create New Task
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-purple-50 hover:-translate-y-0.5 hover:scale-[1.05] transition-all duration-200 ease-out"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Task Name
                  </label>
                  <input
                    type="text"
                    value={newTask.name}
                    onChange={(e) =>
                      setNewTask({ ...newTask, name: e.target.value })
                    }
                    placeholder="e.g. Weekly Data Sync"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Schedule Type
                  </label>
                  <div className="flex gap-2">
                    {scheduleTypes.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setNewTask({ ...newTask, scheduleType: s.value })}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                          newTask.scheduleType === s.value
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
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    {newTask.scheduleType === "recurring" ? "First Run (start date & time)" : "Start Date & Time"}
                  </label>
                  <input
                    type="datetime-local"
                    value={newTask.nextRunAt}
                    onChange={(e) =>
                      setNewTask({ ...newTask, nextRunAt: e.target.value })
                    }
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>

                {newTask.scheduleType === "recurring" && (
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Frequency
                    </label>
                    <div className="flex gap-2">
                      {frequencyOptions.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setNewTask({ ...newTask, frequency: f.value })}
                          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ease-out ${
                            newTask.frequency === f.value
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
                      {newTask.runWithoutApproval
                        ? "Run immediately without approval"
                        : "Require approval before running"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {newTask.runWithoutApproval
                        ? "The task runs at its scheduled time without needing approval."
                        : "The task waits for an approval before a scheduled run executes."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNewTask({ ...newTask, runWithoutApproval: !newTask.runWithoutApproval })
                    }
                    aria-pressed={newTask.runWithoutApproval}
                    className={`w-10 h-6 rounded-full transition relative shrink-0 ${
                      newTask.runWithoutApproval ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition ${
                        newTask.runWithoutApproval ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-900 to-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-[0.98] transition-all duration-200 ease-out mt-1"
                >
                  Create Task
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Toast notification */}
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

