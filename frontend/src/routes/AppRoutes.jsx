import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';

const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const CreateTask = lazy(() => import('../pages/CreateTask'));
const TaskDetails = lazy(() => import('../pages/TaskDetails'));
const LiveExecution = lazy(() => import('../pages/LiveExecution'));
const Agents = lazy(() => import('../pages/Agents'));
const ResearchResults = lazy(() => import('../pages/ResearchResults'));
const ResultDetails = lazy(() => import('../pages/ResultDetails'));
const Analytics = lazy(() => import('../pages/Analytics'));
const Approvals = lazy(() => import('../pages/Approvals'));
const Artifacts = lazy(() => import('../pages/Artifacts'));
const ArtifactPreview = lazy(() => import('../pages/ArtifactPreview'));
const Activity = lazy(() => import('../pages/Activity'));
const Schedules = lazy(() => import('../pages/Schedules'));
const Profile = lazy(() => import('../pages/Profile'));
const Settings = lazy(() => import('../pages/Settings'));
const UserGuide = lazy(() => import('../pages/UserGuide'));
const ActiveTasks = lazy(() => import('../pages/ActiveTasks'));
const CompletedToday = lazy(() => import('../pages/CompletedToday'));
const UpcomingToday = lazy(() => import('../pages/UpcomingToday'));
const PendingApprovals = lazy(() => import('../pages/PendingApprovals'));
const AgentsRunning = lazy(() => import('../pages/AgentsRunning'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Suspense fallback={<RouteFallback />}><Login /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<RouteFallback />}><Register /></Suspense>} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<RouteFallback />}><Dashboard /></Suspense>} />
        <Route path="/agents" element={<Suspense fallback={<RouteFallback />}><Agents /></Suspense>} />
        <Route path="/executions" element={<Suspense fallback={<RouteFallback />}><LiveExecution /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><Settings /></Suspense>} />
        <Route path="/tasks/create" element={<Suspense fallback={<RouteFallback />}><CreateTask /></Suspense>} />
        <Route path="/tasks/:id" element={<Suspense fallback={<RouteFallback />}><TaskDetails /></Suspense>} />
        <Route path="/tasks/:id/live" element={<Suspense fallback={<RouteFallback />}><LiveExecution /></Suspense>} />
        <Route path="/research" element={<Suspense fallback={<RouteFallback />}><ResearchResults /></Suspense>} />
        <Route path="/research/:id" element={<Suspense fallback={<RouteFallback />}><ResultDetails /></Suspense>} />
        <Route path="/analytics" element={<Suspense fallback={<RouteFallback />}><Analytics /></Suspense>} />
        <Route path="/approvals" element={<Suspense fallback={<RouteFallback />}><Approvals /></Suspense>} />
        <Route path="/artifacts" element={<Suspense fallback={<RouteFallback />}><Artifacts /></Suspense>} />
        <Route path="/artifacts/:id" element={<Suspense fallback={<RouteFallback />}><ArtifactPreview /></Suspense>} />
        <Route path="/activity" element={<Suspense fallback={<RouteFallback />}><Activity /></Suspense>} />
        <Route path="/schedules" element={<Suspense fallback={<RouteFallback />}><Schedules /></Suspense>} />
        <Route path="/profile" element={<Suspense fallback={<RouteFallback />}><Profile /></Suspense>} />
        <Route path="/user-guide" element={<Suspense fallback={<RouteFallback />}><UserGuide /></Suspense>} />
        <Route path="/active-tasks" element={<Suspense fallback={<RouteFallback />}><ActiveTasks /></Suspense>} />
        <Route path="/completed-today" element={<Suspense fallback={<RouteFallback />}><CompletedToday /></Suspense>} />
        <Route path="/upcoming-today" element={<Suspense fallback={<RouteFallback />}><UpcomingToday /></Suspense>} />
        <Route path="/pending-approvals" element={<Suspense fallback={<RouteFallback />}><PendingApprovals /></Suspense>} />
        <Route path="/agents-running" element={<Suspense fallback={<RouteFallback />}><AgentsRunning /></Suspense>} />
      </Route>
    </Routes>
  );
}