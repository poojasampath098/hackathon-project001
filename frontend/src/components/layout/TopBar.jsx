import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  HelpCircle,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { searchData } from "../../data/searchData";
import { activityApi } from "../../services/activity.api";
import { taskApi } from "../../services/task.api";
import { useAuth } from "../../hooks/useAuth";

const notificationTitles = {
  task_created: "Task Created",
  task_updated: "Task Updated",
  task_completed: "Task Completed",
  task_deleted: "Task Deleted",
  execution_started: "Execution Started",
  execution_completed: "Execution Completed",
  execution_failed: "Execution Failed",
  execution_cancelled: "Execution Cancelled",
  approval_requested: "Approval Requested",
  approval_granted: "Approval Granted",
  approval_rejected: "Approval Rejected",
  ai_request: "AI Request",
  ai_response: "AI Response",
  user_registered: "Account Created",
  user_logged_in: "Signed In",
  schedule_created: "Schedule Created",
  schedule_toggled: "Schedule Updated",
  schedule_deleted: "Schedule Deleted",
  artifact_created: "Artifact Created",
};

function formatRelativeTime(iso) {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function TopBar({ showSearch = true, showHelp = true, rightContent = null }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [taskSearch, setTaskSearch] = useState([]);

  useEffect(() => {
    let cancelled = false;
    taskApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        const tasks = res?.data?.tasks || [];
        setTaskSearch(
          tasks.map((t) => ({
            type: "Task",
            label: t.title || "",
            route: "/active-tasks",
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setTaskSearch([]);
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
        const items = res?.data?.activities || [];
        const mapped = items.slice(0, 8).map((a) => ({
          id: a.id || String(a._id),
          title: notificationTitles[a.type] || "Activity",
          desc: a.message || "",
          time: formatRelativeTime(a.createdAt || a.updatedAt),
          read: !!a.read,
          route: a.executionId
            ? "/executions"
            : a.taskId
            ? "/tasks"
            : undefined,
        }));
        setNotifications(mapped);
      })
      .catch(() => {
        if (cancelled) return;
        setNotifications([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const searchRef = useRef(null);
  const bellRef = useRef(null);
  const profileRef = useRef(null);

  const hasUnread = notifications.some((n) => !n.read);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") { setOpenDropdown(null); }
    };
    const handleClickOutside = (e) => {
      if (
        (openDropdown === "search" && searchRef.current && !searchRef.current.contains(e.target)) ||
        (openDropdown === "bell" && bellRef.current && !bellRef.current.contains(e.target)) ||
        (openDropdown === "profile" && profileRef.current && !profileRef.current.contains(e.target))
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdown]);

  const toggleDropdown = (name) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      const prev = notification.read;
      setNotifications((prevItems) =>
        prevItems.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      activityApi
        .markRead(notification.id)
        .catch(() => {
          // Revert the optimistic read on failure so the unread state reflects
          // what the server actually persisted.
          setNotifications((prevItems) =>
            prevItems.map((n) =>
              n.id === notification.id ? { ...n, read: prev } : n
            )
          );
        });
    }
    setOpenDropdown(null);
    if (notification.route) navigate(notification.route);
  };

  const handleMarkAllRead = () => {
    const was = notifications.map((n) => n.read);
    setNotifications((prevItems) => prevItems.map((n) => ({ ...n, read: true })));
    activityApi
      .markAllRead()
      .catch(() => {
        // Revert the optimistic update so the UI matches the server state.
        setNotifications((prevItems) =>
          prevItems.map((n, i) => ({ ...n, read: was[i] }))
        );
      });
  };

  const handleSearchResultClick = (result) => {
    setOpenDropdown(null);
    setSearchQuery("");
    navigate(result.route);
  };

  const filteredResults = searchQuery.trim()
    ? [...taskSearch, ...searchData].filter((r) =>
        r.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "User"
    : "User";
  const avatarLetter = (displayName[0] || "A").toUpperCase();

  return (
    <div className="flex items-center justify-end gap-3">
      {rightContent}

      {showSearch && (
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => toggleDropdown("search")}
            className="flex items-center gap-2 w-64 lg:w-72 pl-3.5 pr-2 py-2 rounded-full border border-gray-200 bg-gray-50 hover:border-violet-200 hover:bg-violet-50/40 transition-all duration-200 ease-out text-left"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-xs text-gray-400 truncate">
              Search tasks, agents, or anything
            </span>
            <span className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 font-medium shrink-0">
              Ctrl+K
            </span>
          </button>
          {openDropdown === "search" && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search tasks, agents, or logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {searchQuery.trim() === "" ? (
                  <p className="px-4 py-4 text-xs text-gray-400 text-center">
                    Type to search tasks, agents, and pages...
                  </p>
                ) : filteredResults.length > 0 ? (
                  <>
                    {/* Group results by type */}
                    {["Task", "Page"].map((type) => {
                      const typeResults = filteredResults.filter((r) => r.type === type);
                      if (typeResults.length === 0) return null;
                      return (
                        <div key={type}>
                          <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase">
                              {type}s
                            </p>
                          </div>
                          {typeResults.map((r, i) => (
                            <div
                              key={`${type}-${i}`}
                              onClick={() => handleSearchResultClick(r)}
                              className="px-4 py-2.5 hover:bg-violet-50 cursor-pointer transition border-b border-gray-50 last:border-0"
                            >
                              <p className="text-xs text-gray-700">{r.label}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="px-4 py-4 text-xs text-gray-400 text-center">
                    No results found
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

{showHelp && (
        <button
          onClick={() => { setOpenDropdown(null); navigate("/user-guide"); }}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-violet-50/50 hover:border-violet-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(109,40,217,0.35)] transition-all duration-200 ease-out shrink-0"
          title="Open User Guide"
          aria-label="Open User Guide"
        >
          <HelpCircle className="w-4 h-4 text-gray-500" />
        </button>
      )}

      <div className="relative" ref={bellRef}>
        <button
onClick={() => toggleDropdown("bell")}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-violet-50/50 hover:border-violet-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(109,40,217,0.35)] transition-all duration-200 ease-out relative shrink-0"
        >
          <Bell className="w-4 h-4 text-gray-500" />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
        {openDropdown === "bell" && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-900">Notifications</p>
<button
                onClick={handleMarkAllRead}
                className="text-[10px] text-violet-600 font-medium hover:text-violet-700"
              >
                Mark all as read
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">
                  No notifications yet
                </p>
              ) : (
                notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-violet-50 transition cursor-pointer ${
                    !n.read ? "bg-violet-50/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{n.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{n.desc}</p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                </div>
              ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={profileRef}>
<button
          onClick={() => toggleDropdown("profile")}
          className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden hover:opacity-95 hover:-translate-y-0.5 hover:scale-[1.05] hover:shadow-[0_8px_18px_-8px_rgba(109,40,217,0.4)] transition-all duration-200 ease-out"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{avatarLetter}</span>
            </div>
          )}
        </button>
        {openDropdown === "profile" && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{avatarLetter}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900">{displayName}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{user?.email || ""}</p>
                </div>
              </div>
            </div>
            <div className="py-1">
              <button
                onClick={() => { navigate("/profile"); setOpenDropdown(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 hover:bg-violet-50 transition text-left"
              >
                <User className="w-4 h-4 text-gray-400" />
                Profile
              </button>
              <button
                onClick={() => { navigate("/settings"); setOpenDropdown(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 hover:bg-violet-50 transition text-left"
              >
                <Settings className="w-4 h-4 text-gray-400" />
                Settings
              </button>
            </div>
            <div className="border-t border-gray-100 py-1">
<button
                onClick={() => { logout(); navigate("/login"); setOpenDropdown(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 transition text-left"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
