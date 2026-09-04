import { useState, useRef, useEffect, useContext } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import Toggle from "../components/ui/Toggle";
import TopBar from "../components/layout/TopBar";
import { userApi } from "../services/user.api";
import { AuthContext } from "../context/AuthContext";

export default function Settings() {
  const { user, updateUser } = useContext(AuthContext);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const role = "Workspace Administrator";
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (msg, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

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

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await userApi.updateProfile({ firstName, lastName });
      const updated = res?.data?.user;
      const savedFirstName = updated?.firstName !== undefined ? updated.firstName : firstName;
      const savedLastName = updated?.lastName !== undefined ? updated.lastName : lastName;
      setFirstName(savedFirstName);
      setLastName(savedLastName);
      updateUser({ firstName: savedFirstName, lastName: savedLastName });
      showToast("Settings saved successfully");
    } catch (err) {
      showToast(err.message || "Could not save settings", true);
    } finally {
      setSaving(false);
    }
  };

  const initials = (
    (firstName ? firstName[0] : "") + (lastName ? lastName[0] : "")
  ).toUpperCase();
  const initialsText = initials || (email ? email[0].toUpperCase() : "?");

  return (
    <div className="p-6 flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage your account and preferences.
            </p>
            {profileError && (
              <p className="text-xs text-red-600 mt-1">
                {profileError} — showing your current session details.
              </p>
            )}
          </div>
          <TopBar />
        </div>

        {/* Right content */}
        <div className="flex flex-col gap-6">
            {/* Profile Information Card */}
            <div className="bg-white rounded-xl shadow-sm p-6 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <h2 className="text-sm font-bold text-gray-900 mb-5">
                Profile Information
              </h2>

              {/* Avatar */}
              <div className="flex items-center gap-5 mb-6">
                {avatar ? (
                  <img src={avatar} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                    <span className="text-white text-xl font-bold">{initialsText}</span>
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-700 px-3 py-1.5 border border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_14px_-6px_rgba(147,51,234,0.35)] active:scale-95 transition-all duration-200 ease-out"
                  >
                    Change Photo
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    JPG, GIF or PNG. Max size of 800K
                  </p>
                </div>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>

              <div className="mb-6 flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-700">
                  Role
                </label>
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full">
                  {role}
                </span>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-gradient-to-r from-purple-900 to-purple-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            {/* Notification Preferences Card */}
            <div className="bg-white rounded-xl shadow-sm p-6 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
              <h2 className="text-sm font-bold text-gray-900 mb-5">
                Notification Preferences
              </h2>

              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Agent Execution Alerts
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Receive notifications when agents complete tasks.
                  </p>
                </div>
                <Toggle defaultChecked />
              </div>

              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    System Updates
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Platform maintenance and new feature announcements.
                  </p>
                </div>
                <Toggle defaultChecked />
              </div>
            </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-5 right-5 z-[100]" style={{ animation: "fadeIn 0.15s ease-out" }}>
            <div className="flex items-center gap-2.5 bg-white border border-green-200 rounded-xl shadow-lg px-4 py-3 min-w-[240px]">
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
