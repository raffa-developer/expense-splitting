import { Loader2 } from "lucide-react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { RouteTransition } from "@/components/route-transition";
import { useAuth } from "@/auth";
import { DashboardPage } from "@/pages/DashboardPage";
import { GroupPage } from "@/pages/GroupPage";
import { GroupsPage } from "@/pages/GroupsPage";
import { LoginPage } from "@/pages/LoginPage";

function FullPageSpinner() {
  return (
    <div className="grid min-h-svh place-items-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageSpinner />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppShell>
      <RouteTransition routeKey={location.pathname}>
        <Outlet />
      </RouteTransition>
    </AppShell>
  );
}

function PublicOnly() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageSpinner />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
