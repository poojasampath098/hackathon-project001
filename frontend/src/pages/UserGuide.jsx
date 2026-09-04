import { useState } from "react";
import {
  Rocket,
  UserPlus,
  LogIn,
  LayoutDashboard,
  Bot,
  ClipboardList,
  User,
  Calendar,
  Play,
  Zap,
  ShieldCheck,
  Activity,
  FileText,
  UserCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  Mic,
  Paperclip,
  Search,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";

function Pill({ children }) {
  return (
    <span className="inline-block bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded text-[10px]">
      {children}
    </span>
  );
}

function IconPill({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded text-[10px]">
      <Icon className="w-3 h-3" />
      {children}
    </span>
  );
}

function P({ children }) {
  return <p className="text-xs text-gray-600 leading-relaxed">{children}</p>;
}

function Bullets({ items, tone = "ok" }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed px-3 py-2.5 rounded-xl bg-gray-50/60 border border-gray-100/60 backdrop-blur-sm transition-all duration-200 hover:bg-purple-50/50 hover:border-purple-100/80"
        >
          {tone === "warn" ? (
            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusTable({ rows }) {
  const dotMap = {
    Pending: "bg-yellow-400",
    Running: "bg-blue-500",
    Completed: "bg-green-500",
    Failed: "bg-red-500",
    Cancelled: "bg-gray-400",
    Approved: "bg-green-500",
    Rejected: "bg-red-500",
  };
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100/70 shadow-sm">
      <div className="grid grid-cols-[150px_1fr] bg-gradient-to-r from-purple-50/90 to-gray-50 px-4 py-3 text-[10px] font-semibold text-purple-700 uppercase tracking-wide border-b border-gray-100">
        <div>Status</div>
        <div>What it means</div>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`grid grid-cols-[150px_1fr] px-4 py-3 text-xs border-b border-gray-50 last:border-0 transition-colors duration-200 ${
            i % 2 === 1 ? "bg-gray-50/40" : "bg-white/80"
          } hover:bg-purple-50/40`}
        >
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <span className={`w-1.5 h-1.5 rounded-full ${dotMap[row.status] || "bg-gray-300"}`} />
            {row.status}
          </div>
          <div className="text-gray-600 leading-relaxed">{row.meaning}</div>
        </div>
      ))}
    </div>
  );
}

const sections = [
  {
    id: "getting-started",
    label: "Welcome & Getting Started",
    icon: Rocket,
    desc: "An overview of the Aether Platform and the quickest way to get productive.",
    body: (
      <>
        <P>
          Aether Platform helps you create tasks, delegate them to an AI agent,
          schedule them to run automatically, review approvals, and keep the
          outputs your agents produce — all from a single workspace.
        </P>
        <P>
          When you sign in, you land on the <Pill>Dashboard</Pill>. You move
          around using the sidebar on the left, which contains{" "}
          <Pill>New Task</Pill>, <Pill>Dashboard</Pill>, <Pill>Agents</Pill>,{" "}
          <Pill>Executions</Pill>, <Pill>Schedules</Pill>, <Pill>Settings</Pill>{" "}
          and this <Pill>User Guide</Pill>. The top bar gives you a page search,{" "}
          notifications, a help shortcut and your account menu.
        </P>
        <Bullets
          items={[
            "Create a task, give it a priority and assign it to an agent.",
            "Chat with your AI assistant on the Agents page — ask questions, attach files or send a voice message.",
            "Schedule tasks to run once, daily, weekly or monthly on the Schedules page.",
            "Watch runs live on the Executions page and approve requests on Pending Approvals.",
            "Download the outputs your agents produce from the Artifacts page.",
          ]}
        />
        <P>
          Everything you see is scoped to your account. If you are not signed in,
          protected pages redirect you to the login screen.
        </P>
      </>
    ),
  },
  {
    id: "creating-account",
    label: "Creating an Account",
    icon: UserPlus,
    desc: "Registration is a three-step flow with email verification.",
    body: (
      <>
        <P>
          Open the <Pill>Create Account</Pill> form (from the login screen choose{" "}
          <Pill>Register / Login here</Pill>). Registration verifies your email
          with a one-time code before the account is created.
        </P>
        <Bullets
          items={[
            <span key="s1">
              <b className="text-gray-800">Step 1 — Email.</b> Enter your email
              address and press <Pill>Send Code</Pill>.
            </span>,
            <span key="s2">
              <b className="text-gray-800">Step 2 — Verify.</b> Enter the 6-digit
              code you received and press <Pill>Verify OTP</Pill>. You can{" "}
              <Pill>Resend OTP</Pill> (a 15-second cooldown applies) or change the
              email address.
            </span>,
            <span key="s3">
              <b className="text-gray-800">Step 3 — Details.</b> Add your full
              name, a password (at least 8 characters and one number) and confirm
              it, then press <Pill>Create Account</Pill>.
            </span>,
          ]}
        />
        <P>
          Once you create the account you are signed in automatically and taken
          to the Dashboard — no separate login needed.
        </P>
        <Bullets
          tone="warn"
          items={[
            "If your email is already registered you will see an error with a \u201CLogin here\u201D link — sign in to that account instead.",
            "You can also use \u201CContinue with Google\u201D to sign up or sign in with your Google account.",
          ]}
        />
      </>
    ),
  },
  {
    id: "login",
    label: "Login",
    icon: LogIn,
    desc: "Signing in with your email address and password.",
    body: (
      <>
        <P>
          On the login screen, enter the email address and password you chose
          during registration and press <Pill>Sign In</Pill>. You are taken to
          the Dashboard and stay signed in for the session.
        </P>
        <Bullets
          items={[
            "No account yet? Use the \u201CCreate Account\u201D option on the registration screen.",
            "If you are signed out or your session ends, protected pages redirect you back to the login screen.",
          ]}
        />
        <Bullets
          tone="warn"
          items={[
            "The \u201CForgot Password?\u201D link on the login form is a placeholder — there is no password-reset flow in this version. If you lose access, register a new account with a different email address.",
          ]}
        />
      </>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    desc: "Your workspace overview and live numbers at a glance.",
    body: (
      <>
        <P>
          The Dashboard greets you by name and shows a live summary of what is
          happening in your workspace — active tasks, running executions and
          pending approvals.
        </P>
        <Bullets
          items={[
            <span key="d1">
              <b className="text-gray-800">Stat cards</b> — Active Tasks, Completed
              Tasks, Pending Approvals and Running Executions. Each card opens the
              matching page when clicked.
            </span>,
            <span key="d2">
              <b className="text-gray-800">Task Activity This Week</b> — an area
              chart of how many tasks were created or updated each day.
            </span>,
            <span key="d3">
              <b className="text-gray-800">Agent Success Rate</b> — the percentage
              of executions that completed successfully.
            </span>,
            <span key="d4">
              <b className="text-gray-800">Live Executions</b> — CPU, RAM and GPU
              load bars (network load is reported as unavailable).
            </span>,
            <span key="d5">
              <b className="text-gray-800">Recent Activity</b> — your latest five
              activity events.
            </span>,
          ]}
        />
        <P>
          The top-right search can jump to pages and your tasks; the bell shows
          notifications built from your activity; your avatar menu offers{" "}
          <Pill>Profile</Pill>, <Pill>Settings</Pill> and <Pill>Log Out</Pill>.
          A dedicated <Pill>Analytics</Pill> page (reachable from search) breaks
          down totals by task status and priority, execution status, approval
          status and activity type.
        </P>
      </>
    ),
  },
  {
    id: "ai-chat",
    label: "AI Assistant & Chat",
    icon: Bot,
    desc: "Chatting with your AI agent, sharing files and recording voice messages.",
    body: (
      <>
        <P>
          Open <Pill>Agents</Pill> — the page is called{" "}
          <Pill>Agent Operations</Pill>. The left panel,{" "}
          <Pill>Talk to your Agent</Pill>, connects you to the{" "}
          <Pill>Data Extraction Specialist</Pill> agent, which shows as{" "}
          <span className="text-green-500 font-semibold">Online</span>.
        </P>
        <Bullets
          items={[
            <span key="a1">
              <b className="text-gray-800">Send a message</b> — type into the box
              and press Enter or the send button. While the agent is working you
              see a \u201CProcessing your request...\u201D bubble.
            </span>,
            <span key="a2">
              <b className="text-gray-800">Quick actions</b> — chips like{" "}
              <Pill>Schedule a task</Pill>, <Pill>Check status</Pill> and{" "}
              <Pill>View recent logs</Pill> prefill the input for you.
            </span>,
            <span key="a3">
              <b className="text-gray-800">Attach files</b> — use the + button to
              pick <Pill>Upload Files</Pill> or <Pill>Photos</Pill>. Each file must
              be 5 MB or smaller; images preview inline in the conversation.
            </span>,
            <span key="a4">
              <b className="text-gray-800">Voice messages</b> — press the{" "}
              <IconPill icon={Mic}>microphone</IconPill> button to record (the
              browser asks for mic permission). The recording is attached as a
              playable voice message.
            </span>,
            <span key="a5">
              <b className="text-gray-800">History</b> — your past messages and
              replies reload when you return to the page.
            </span>,
          ]}
        />
        <P>
          If the AI service cannot be reached you will see a{" "}
          <span className="text-red-500 font-medium">
            Network error — could not reach the agent
          </span>{" "}
          message; other failures show the underlying reason returned by the
          server. Uploaded files are stored as artifacts and appear on the{" "}
          <Pill>Artifacts</Pill> page.
        </P>
        <P>
          A separate <Pill>Research Results</Pill> page (reachable from search)
          lets you type a query, press <Pill>Research</Pill> and read the AI
          research answer in place.
        </P>
      </>
    ),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: ClipboardList,
    desc: "Creating, viewing and managing the work your agents handle.",
    body: (
      <>
        <P>
          There are two ways to create a task:
        </P>
        <Bullets
          items={[
            <span key="t1">
              <b className="text-gray-800">New Task</b> in the sidebar — a
              three-step wizard.
            </span>,
            <span key="t2">
              <b className="text-gray-800">Create Task</b> in the modal on the
              Agents page.
            </span>,
          ]}
        />
        <P>
          The wizard has three steps — <Pill>Details</Pill>,{" "}
          <Pill>Agent &amp; Schedule</Pill> and <Pill>Review</Pill>:
        </P>
        <Bullets
          items={[
            <span key="t3">
              <b className="text-gray-800">Details</b> — task name (required, it
              enables the next step), a description, and a priority of{" "}
              <Pill>Low</Pill>, <Pill>Medium</Pill> or <Pill>High</Pill>.
            </span>,
            <span key="t4">
              <b className="text-gray-800">Agent &amp; Schedule</b> — assign an
              agent name, pick a schedule type and a time.
            </span>,
            <span key="t5">
              <b className="text-gray-800">Review</b> — check everything and press{" "}
              <Pill>Create Task</Pill>. You return to the Agents page and the new
              task appears under Scheduled Tasks.
            </span>,
          ]}
        />
        <P>
          Every task has a name, description, priority, status, an assigned agent
          and schedule information. Open a task by tapping its name on the{" "}
          <Pill>Active Tasks</Pill> or <Pill>Completed Today</Pill> pages — the
          detail page shows the description plus its ID, agent, schedule, time,
          priority, whether approval is required, and creation/update timestamps,
          with <Pill>Mark Complete</Pill> and <Pill>Delete</Pill> actions.
        </P>
      </>
    ),
  },
  {
    id: "assign-agent",
    label: "Assign Agent",
    icon: User,
    desc: "Naming the agent that owns a task.",
    body: (
      <>
        <P>
          On the <Pill>Agent &amp; Schedule</Pill> step, the{" "}
          <Pill>Assign Agent</Pill> field is a free-text name for the agent that
          is responsible for the task — for example{" "}
          <em>&quot;Weekly Data Agent&quot;</em>.
        </P>
        <Bullets
          items={[
            "The name is used as a label across tasks, executions, scheduled lists and running-agent cards.",
            "The field is optional — leave it blank and the app simply shows \u201C—\u201D for the agent.",
            "Agents are not individually deployed from this UI. You interact with the AI agent through the chat on the Agents page, and scheduled task runs happen automatically.",
          ]}
        />
      </>
    ),
  },
  {
    id: "scheduling",
    label: "Scheduling",
    icon: Calendar,
    desc: "How tasks get triggered — once, daily, weekly or monthly.",
    body: (
      <>
        <P>
          Scheduling works in two parts:
        </P>
        <Bullets
          items={[
            <span key="sc1">
              <b className="text-gray-800">On the task itself</b> — when creating a
              task you set a <Pill>Schedule Type</Pill> of{" "}
              <Pill>Once</Pill> or <Pill>Recurring</Pill> plus a{" "}
              <Pill>Time</Pill> (defaults to 09:00). For recurring tasks the time
              appears on the task detail page.
            </span>,
            <span key="sc2">
              <b className="text-gray-800">On the Schedules page</b> — this is the
              real scheduler. Open <Pill>Schedules</Pill> in the sidebar and press{" "}
              <Pill>New Schedule</Pill>, then choose a task, a frequency of{" "}
              <Pill>Once</Pill>, <Pill>Daily</Pill>, <Pill>Weekly</Pill> or{" "}
              <Pill>Monthly</Pill>, and a <Pill>Next Run</Pill> date and time.
            </span>,
          ]}
        />
        <P>
          Each schedule row shows the task name, a frequency badge, an{" "}
          <Pill>Enabled</Pill>/<Pill>Disabled</Pill> badge, the next run time, the
          last run time (or <em>Never</em>) and the creation time. Row actions let
          you <b className="text-gray-800">edit</b> (change the task, frequency or
          next run, and toggle it on/off), <b className="text-gray-800">enable or
          disable</b> with the power switch, or <b className="text-gray-800">
          delete</b> the schedule.
        </P>
        <Bullets
          items={[
            "A schedule fires its task automatically at the next run time.",
            "Every run creates an Execution you can inspect on the Executions page.",
            "Daily, weekly and monthly schedules roll the next run forward; a Once schedule runs a single time.",
            "Triggers are logged to your activity feed.",
          ]}
        />
      </>
    ),
  },
  {
    id: "running-tasks",
    label: "Running Tasks",
    icon: Play,
    desc: "How runs happen and where you watch them.",
    body: (
      <>
        <P>
          Runs happen automatically: when a scheduled task fires, the platform
          creates an execution and starts working through it. Each run updates the
          task status as it goes.
        </P>
        <Bullets
          items={[
            <span key="r1">
              <b className="text-gray-800">Dashboard</b> — the Running Executions
              stat shows how many runs are active right now.
            </span>,
            <span key="r2">
              <b className="text-gray-800">Agents Running</b> — cards for each
              active run showing the executing task, step progress (for example
              2/5) and when it started.
            </span>,
            <span key="r3">
              <b className="text-gray-800">Executions page</b> — the Live Log
              Stream panel shows steps with timestamps and durations in real time.
            </span>,
          ]}
        />
        <P>
          When a run finishes successfully its task is marked{" "}
          <Pill>Completed</Pill>; if it stopped with an error the task is marked{" "}
          <Pill>Failed</Pill> and the executions table shows the error. Successful
          runs can produce output that appears on the{" "}
          <Pill>Artifacts</Pill> page.
        </P>
      </>
    ),
  },
  {
    id: "executions",
    label: "Executions",
    icon: Zap,
    desc: "Every run of your tasks and how to read it.",
    body: (
      <>
        <P>
          The <Pill>Executions</Pill> page (Execution History) lists every run of
          your tasks in a table: <b className="text-gray-800">Task Name</b>,{" "}
          <b className="text-gray-800">Agent</b>,{" "}
          <b className="text-gray-800">Status</b>,{" "}
          <b className="text-gray-800">Started At</b> and{" "}
          <b className="text-gray-800">Duration</b>.
        </P>
        <Bullets
          items={[
            "The search box filters by task or agent name.",
            "The filter panel lets you narrow down to a specific agent.",
            "The tabs switch between All, Running and Failed runs.",
            "Status badges use Pending, Running, Completed, Failed and Cancelled.",
          ]}
        />
        <P>
          Beside the table, the dark <b className="text-gray-800">Live Log
          Stream</b> shows the steps of the viewed run — each step has a status
          (pending, running, completed, failed or skipped), its name and duration.
          On a task&apos;s live page the stream updates in real time, and the
          indicator turns green when the connection is live.
        </P>
      </>
    ),
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: ShieldCheck,
    desc: "Requests for a human decision before a run continues.",
    body: (
      <>
        <P>
          Some executions ask for a human decision before they proceed. When that
          happens, an approval request is created automatically and shown on the{" "}
          <Pill>Approvals</Pill> page.
        </P>
        <Bullets
          items={[
            "The Approvals page lists every request — filter with All, Pending, Approved or Rejected tabs.",
            "Each row shows the related task, an execution reference, when the request was created, and the reason for the request.",
            "Status is shown with a Pending, Approved or Rejected badge.",
          ]}
        />
        <P>
          To act on a request, use the {" "}
          <Pill>Pending Approvals</Pill> page (opened from the Dashboard&apos;s
          pending-approval stat). Each card shows the task, reason and execution
          reference with <Pill>Approve</Pill> and <Pill>Reject</Pill> buttons. If
          a request is assigned to a specific reviewer, only that reviewer can
          decide; otherwise any signed-in user can approve or reject it. Acting on
          a request you are not allowed to review shows an error and the request
          stays pending.
        </P>
      </>
    ),
  },
  {
    id: "activities",
    label: "Activities",
    icon: Activity,
    desc: "The full history of what happened in your workspace.",
    body: (
      <>
        <P>
          The <Pill>Activity</Pill> page is a complete, time-ordered log of your
          workspace. Every meaningful event is recorded with a short message, a
          type badge and a timestamp.
        </P>
        <Bullets
          items={[
            "Tasks — created, updated, completed and deleted.",
            "Executions — started, completed, failed and cancelled.",
            "Approvals — requested, granted and rejected.",
            "Schedules — created, toggled and deleted.",
            "Other events — AI requests/responses, artifact creation, logins and registrations.",
          ]}
        />
        <P>
          Each entry can be removed with its delete action. Shorter previews of
          your most recent activity also appear on the Dashboard and on your
          Profile page.
        </P>
      </>
    ),
  },
  {
    id: "artifacts",
    label: "Artifacts & Generated Results",
    icon: FileText,
    desc: "The outputs and files your agents produce.",
    body: (
      <>
        <P>
          The <Pill>Artifacts</Pill> page collects the outputs your agents generate
          — AI responses, execution outputs, reports and documents — plus the
          files you upload in the agent chat.
        </P>
        <Bullets
          items={[
            "Each row shows the artifact name, its related task and execution (when applicable), a type badge (Execution Output, AI Response, Document or Report) and the creation date.",
            "Download saves the artifact content to your computer as a JSON file.",
            "Delete removes the artifact from your workspace.",
          ]}
        />
        <P>
          Tap an artifact name to open its preview page, which shows{" "}
          <b className="text-gray-800">Details</b> (task, execution, created and
          updated times), <b className="text-gray-800">Metadata</b> and the{" "}
          <b className="text-gray-800">Content</b> rendered as formatted JSON.
        </P>
      </>
    ),
  },
  {
    id: "profile",
    label: "Profile & Account",
    icon: UserCircle,
    desc: "Your personal details, account settings and activity.",
    body: (
      <>
        <P>
          Your avatar menu (top right) holds <Pill>Profile</Pill>,{" "}
          <Pill>Settings</Pill> and <Pill>Log Out</Pill>.
        </P>
        <Bullets
          items={[
            <span key="p1">
              <b className="text-gray-800">Profile</b> — edit your first and last
              name, change your photo (JPG, PNG or WebP, up to 2 MB) and save your
              changes. Your email address is read-only. The page also shows counts
              for tasks created, approvals reviewed and total executions, plus a
              Recent Activity list.
            </span>,
            <span key="p2">
              <b className="text-gray-800">Settings</b> — the same profile
              information card, plus Notification Preferences toggles for agent
              execution alerts and system updates, and a Save action.
            </span>,
          ]}
        />
        <P>
          Changes you save are reflected in the sidebar and top-bar greeting
          immediately. Log Out returns you to the login screen.
        </P>
      </>
    ),
  },
  {
    id: "task-status",
    label: "Task Status Guide",
    icon: CheckCircle2,
    desc: "The statuses a task can move through.",
    body: (
      <>
        <StatusTable
          rows={[
            {
              status: "Pending",
              meaning:
                "The task has been created and is waiting to run. It shows as \u201CScheduled\u201D (or \u201CRecurring\u201D for recurring tasks).",
            },
            {
              status: "Running",
              meaning:
                "Shown as in-progress — an execution is actively working on the task right now.",
            },
            {
              status: "Completed",
              meaning:
                "The task finished successfully and its outputs are available.",
            },
            {
              status: "Failed",
              meaning:
                "The run stopped with an error. The error message is available on the executions table and live log.",
            },
            {
              status: "Cancelled",
              meaning:
                "The run was stopped before it finished.",
            },
          ]}
        />
        <P>
          You can also mark a task complete manually from its detail page, and
          delete tasks you no longer need.
        </P>
      </>
    ),
  },
  {
    id: "approval-status",
    label: "Approval Status Guide",
    icon: ShieldCheck,
    desc: "The statuses an approval request can take.",
    body: (
      <>
        <StatusTable
          rows={[
            {
              status: "Pending",
              meaning:
                "The request is waiting for a decision. It appears on the Pending Approvals page.",
            },
            {
              status: "Approved",
              meaning:
                "The request was granted and the execution can proceed.",
            },
            {
              status: "Rejected",
              meaning:
                "The request was denied. A scheduled run that requires approval will not execute until an approval is granted.",
            },
          ]}
        />
        <Bullets
          tone="warn"
          items={[
            "If a request is assigned to a specific reviewer, only that reviewer can approve or reject it.",
            "Otherwise any signed-in user can act on the request, including the person who triggered it.",
          ]}
        />
      </>
    ),
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    icon: AlertTriangle,
    desc: "Common issues and how to resolve them.",
    body: (
      <>
        <Bullets
          tone="warn"
          items={[
            <span key="x1">
              <b className="text-gray-800">Can&apos;t sign in?</b> Make sure you
              completed the email verification during registration. If you never
              received the code, try the resend option.
            </span>,
            <span key="x2">
              <b className="text-gray-800">\u201CThis email is already registered.\u201D</b>{" "}
              Choose the login link instead — accounts are unique per email.
            </span>,
            <span key="x3">
              <b className="text-gray-800">Agent chat says \u201CNetwork error\u201D.</b>{" "}
              The app could not reach the AI service. Wait a moment and try again.
            </span>,
            <span key="x4">
              <b className="text-gray-800">Attachment upload rejected.</b> Each
              file must be 5 MB or smaller — reduce the file size.
            </span>,
            <span key="x5">
              <b className="text-gray-800">Microphone not working.</b> Allow
              microphone permission for the site and use a supported browser;
              otherwise you will see a \u201Cnot supported\u201D message.
            </span>,
            <span key="x6">
              <b className="text-gray-800">Profile photo rejected.</b> Use a JPG,
              PNG or WebP image no larger than 2 MB.
            </span>,
            <span key="x7">
              <b className="text-gray-800">No runs on the Executions page.</b> Runs
              are created when scheduled tasks fire. Check the Schedules page for
              an enabled schedule with a future next-run time.
            </span>,
            <span key="x8">
              <b className="text-gray-800">A scheduled run is waiting.</b> If it
              requires approval, approve the pending request before it can
              execute.
            </span>,
            <span key="x9">
              <b className="text-gray-800">\u201CConnecting\u201D in the live log.</b>{" "}
              Open a specific task run to watch its steps stream in real time.
            </span>,
          ]}
        />
      </>
    ),
  },
  {
    id: "quick-start",
    label: "Quick Start",
    icon: BookOpen,
    desc: "Five steps to your first automated workflow.",
    body: (
      <>
        <Bullets
          items={[
            <span key="q1">
              <b className="text-gray-800">1. Create your account.</b> Register
              with your email, verify the code and choose a password — you are
              signed in automatically.
            </span>,
            <span key="q2">
              <b className="text-gray-800">2. Meet your agent.</b> Open{" "}
              <Pill>Agents</Pill> and say hello in the chat, or go straight to
              your <Pill>Dashboard</Pill> for an overview.
            </span>,
            <span key="q3">
              <b className="text-gray-800">3. Create a task.</b> Use{" "}
              <Pill>New Task</Pill>, give it a name and priority, and (optionally)
              assign it to an agent.
            </span>,
            <span key="q4">
              <b className="text-gray-800">4. Schedule it.</b> On{" "}
              <Pill>Schedules</Pill>, create a schedule — pick your task, the
              frequency and the next run time.
            </span>,
            <span key="q5">
              <b className="text-gray-800">5. Watch it run.</b> Follow progress on{" "}
              <Pill>Executions</Pill> and <Pill>Agents Running</Pill>, approve any
              pending requests, and download results from <Pill>Artifacts</Pill>.
            </span>,
          ]}
        />
        <div className="flex items-center gap-2 pt-1">
          <Paperclip className="w-3.5 h-3.5 text-gray-400" />
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <Mic className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] text-gray-400">
            Anything else? Use the top-bar search to jump to a page — including
            this guide.
          </span>
        </div>
      </>
    ),
  },
];

export default function UserGuide() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const active = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <>
      <style>{`
        @keyframes guideFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .guide-fade {
          animation: guideFadeIn 260ms ease-out both;
        }
      `}</style>
      <div className="p-6 lg:p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-500 bg-clip-text text-transparent">
              User Guide
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
              Everything you need to get started with Aether Platform — tasks,
              agents, scheduling, approvals and results.
            </p>
          </div>
          <TopBar showHelp />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-7 items-start">
          {/* Left: sections */}
          <div className="lg:col-span-1 lg:sticky lg:top-6 lg:self-start">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100/70 shadow-sm p-4">
              <h2 className="flex items-center gap-2 text-xs font-bold text-gray-900 mb-3 px-1">
                <span className="w-4 h-4 rounded bg-purple-100 flex items-center justify-center">
                  <BookOpen className="w-3 h-3 text-purple-600" />
                </span>
                On this page
              </h2>
              <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ease-out w-full text-left border cursor-pointer ${
                      activeSection === section.id
                        ? "bg-purple-50 text-purple-700 border-purple-200/80 shadow-[0_2px_10px_-4px_rgba(147,51,234,0.25)]"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-purple-50/50 hover:border-purple-100 hover:translate-x-[3px] hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)]"
                    }`}
                  >
                    <section.icon
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                        activeSection === section.id
                          ? "text-purple-600"
                          : "text-gray-400 group-hover:text-purple-500 group-hover:scale-110"
                      }`}
                    />
                    <span className="truncate">{section.label}</span>
                    {activeSection === section.id && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: active section */}
          <div className="lg:col-span-3">
            <div key={active.id} className="guide-fade">
              <div className="relative bg-white/90 backdrop-blur-sm overflow-hidden rounded-2xl border border-gray-100/70 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:border-purple-100 hover:shadow-[0_20px_44px_-18px_rgba(147,51,234,0.35)] hover:ring-1 hover:ring-purple-100/60">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple-500 via-indigo-400 to-transparent" />
                <div className="p-6 lg:p-7">
                  <div className="mb-6">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 ring-1 ring-purple-200/60 flex items-center justify-center shrink-0">
                        <active.icon className="w-5 h-5 text-purple-600" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-500 bg-clip-text text-transparent">
                          {active.label}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">{active.desc}</p>
                      </div>
                    </div>
                    <div className="mt-5 h-px bg-gradient-to-r from-purple-200/80 via-purple-100/40 to-transparent" />
                  </div>
                  <div className="flex flex-col gap-4">{active.body}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}