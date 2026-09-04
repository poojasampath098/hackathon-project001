import { useState, useRef, useEffect, useContext } from "react";
import {
  CheckCircle2,
  XCircle,
  Camera,
  ClipboardCheck,
  Bot,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { userApi } from "../services/user.api";
import { activityApi } from "../services/activity.api";
import { analyticsApi } from "../services/analytics.api";
import { AuthContext } from "../context/AuthContext";

function formatActivityTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function formatStatValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return value.toLocaleString();
}

export default function Profile() {
  const { user, updateUser } = useContext(AuthContext);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const role = "Workspace Administrator";
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [activityItems, setActivityItems] = useState([]);
  const [extraActivityItems, setExtraActivityItems] = useState([]);
  const [activityError, setActivityError] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (msg, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Fetch real profile from backend
  useEffect(() => {
    let cancelled = false;
    userApi
      .getProfile()
      .then((res) => {
        if (cancelled) return;
        const p = res?.data?.user;
        if (!p) return;
        if (p.firstName !== undefined) setFirstName(p.firstName || "");
        if (p.lastName !== undefined) setLastName(p.lastName || "");
        if (p.email) setEmail(p.email);
        if (p.avatar) setAvatar(p.avatar);
      })
      .catch((err) => {
        if (cancelled) return;
        setProfileError(err.message || "Could not load profile");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch real statistics from analytics
  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        const d = res?.data;
        if (!d) return;
        const approvalTotal = d.approvalStats?.total ?? 0;
        const approvalPending = d.approvalStats?.byStatus?.pending ?? 0;
        setStats({
          tasksCreated: d.taskStats?.total ?? 0,
          approvalsReviewed: Math.max(0, approvalTotal - approvalPending),
          totalExecutions: d.executionStats?.total ?? 0,
        });
        setStatsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatsError(err.message || "Could not load statistics");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    activityApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        const activities = Array.isArray(res?.data?.activities) ? res.data.activities : [];
        const mapped = activities.map((a, i) => ({
          id: a._id || a.id || i + 1,
          text: a.message || a.type || "Activity",
          createdAt: a.createdAt,
          type: a.type,
        }));
        setActivityItems(mapped.length > 4 ? mapped.slice(0, 4) : mapped);
        setExtraActivityItems(mapped.length > 4 ? mapped.slice(4) : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setActivityError(err.message || "Could not load activities");
        setActivityItems([]);
        setExtraActivityItems([]);
      });
    return () => { cancelled = true; };
  }, []);

  const displayActivity = showAllActivity
    ? [...activityItems, ...extraActivityItems]
    : activityItems;

  const statCards = [
    { label: "Tasks Created", value: stats ? formatStatValue(stats.tasksCreated) : "—", icon: ClipboardCheck },
    { label: "Approvals Reviewed", value: stats ? formatStatValue(stats.approvalsReviewed) : "—", icon: CheckCircle2 },
    { label: "Total Executions", value: stats ? formatStatValue(stats.totalExecutions) : "—", icon: Bot },
  ];

  const initials = (
    (firstName ? firstName[0] : "") + (lastName ? lastName[0] : "")
  ).toUpperCase();
  const initialsText = initials || (email ? email[0].toUpperCase() : "?");

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showToast("Please choose a JPG, PNG or WebP image", true);
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image must be 2MB or smaller", true);
      e.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let savedAvatar = avatar;
      if (selectedFile) {
        const uploadRes = await userApi.uploadAvatar(selectedFile);
        const uploadedUrl = uploadRes?.data?.user?.avatar;
        if (!uploadedUrl) {
          showToast("Could not upload profile photo", true);
          return;
        }
        savedAvatar = uploadedUrl;
      }

      const res = await userApi.updateProfile({ firstName, lastName, avatar: savedAvatar });
      const updated = res?.data?.user;
      const savedFirstName = updated?.firstName !== undefined ? updated.firstName : firstName;
      const savedLastName = updated?.lastName !== undefined ? updated.lastName : lastName;
      setFirstName(savedFirstName);
      setLastName(savedLastName);
      setAvatar(savedAvatar);
      updateUser({ firstName: savedFirstName, lastName: savedLastName, avatar: savedAvatar });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      showToast("Profile updated successfully");
    } catch (err) {
      showToast(err.message || "Could not update profile", true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 flex flex-col gap-6 min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div />
        <TopBar showHelp />
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
          Manage your personal information, workspace settings, and review your
          recent platform activity.
        </p>
        {profileError && (
          <p className="text-xs text-red-500 mt-2">{profileError}</p>
        )}
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl shadow-sm p-6 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
        <div className="flex gap-8">
          {/* Photo + badge */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            {(previewUrl || avatar) ? (
              <img src={previewUrl || avatar} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">
                  {initialsText}
                </span>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900">
                {firstName} {lastName}
              </p>
              {role && (
                <span className="inline-block mt-1 text-[10px] font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">
                  {role}
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] text-gray-400 hover:text-purple-600 hover:-translate-y-0.5 transition-all duration-200 ease-out flex items-center gap-1"
            >
              <Camera className="w-3 h-3" />
              Change Photo
            </button>
          </div>

          {/* Fields */}
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {statsError && (
        <p className="text-xs text-red-500">Could not load profile statistics</p>
      )}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl shadow-sm px-5 py-4 flex items-center gap-4 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
              <s.icon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Recent Activity</h2>
          <button
            onClick={() => setShowAllActivity((p) => !p)}
            className="text-[11px] text-purple-600 hover:text-purple-700 font-semibold transition"
          >
            {showAllActivity ? "Show less" : "View all"}
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {activityError ? (
            <p className="text-xs text-red-500 px-6 py-4">{activityError}</p>
          ) : displayActivity.length === 0 ? (
            <p className="text-xs text-gray-400 px-6 py-4">No activity recorded yet</p>
          ) : (
            displayActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition"
              >
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 break-words">{item.text}</p>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                  {item.createdAt ? formatActivityTime(item.createdAt) : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[100]"
          style={{ animation: "fadeIn 0.15s ease-out" }}
        >
          <div
            className={`flex items-center gap-2.5 bg-white border rounded-xl shadow-lg px-4 py-3 min-w-[240px] ${
              toast.error ? "border-red-200" : "border-green-200"
            }`}
          >
            {toast.error ? (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            )}
            <p className="text-xs font-medium text-gray-800">{toast.msg}</p>
          </div>
        </div>
      )}
    </div>
  );
}