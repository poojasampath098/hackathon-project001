import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import CreateTask from '../pages/CreateTask';
import TaskDetails from '../pages/TaskDetails';
import LiveExecution from '../pages/LiveExecution';
import Agents from '../pages/Agents';
import ResearchResults from '../pages/ResearchResults';
import ResultDetails from '../pages/ResultDetails';
import Analytics from '../pages/Analytics';
import Approvals from '../pages/Approvals';
import Artifacts from '../pages/Artifacts';
import ArtifactPreview from '../pages/ArtifactPreview';
import Activity from '../pages/Activity';
import Schedules from '../pages/Schedules';
import Profile from '../pages/Profile';
import Settings from '../pages/Settings';
import UserGuide from '../pages/UserGuide';
import ActiveTasks from '../pages/ActiveTasks';
import CompletedToday from '../pages/CompletedToday';
import PendingApprovals from '../pages/PendingApprovals';
import AgentsRunning from '../pages/AgentsRunning';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/executions" element={<LiveExecution />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tasks/create" element={<CreateTask />} />
        <Route path="/tasks/:id" element={<TaskDetails />} />
        <Route path="/tasks/:id/live" element={<LiveExecution />} />
        <Route path="/research" element={<ResearchResults />} />
        <Route path="/research/:id" element={<ResultDetails />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/artifacts" element={<Artifacts />} />
        <Route path="/artifacts/:id" element={<ArtifactPreview />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/user-guide" element={<UserGuide />} />
        <Route path="/active-tasks" element={<ActiveTasks />} />
        <Route path="/completed-today" element={<CompletedToday />} />
        <Route path="/pending-approvals" element={<PendingApprovals />} />
        <Route path="/agents-running" element={<AgentsRunning />} />
      </Route>
    </Routes>
  );
}
