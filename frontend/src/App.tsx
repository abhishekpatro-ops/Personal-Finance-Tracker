import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { AppShell } from "./layout/AppShell";
import { AccountsPage } from "./pages/AccountsPage/AccountsPage";
import { BudgetsPage } from "./pages/BudgetsPage/BudgetsPage";
import { CategoriesPage } from "./pages/CategoriesPage/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage/GoalsPage";
import { LoginPage } from "./pages/LoginPage/LoginPage";
import { RecurringPage } from "./pages/RecurringPage/RecurringPage";
import { ReportsPage } from "./pages/ReportsPage/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage/SettingsPage";
import { SignUpPage } from "./pages/SignUpPage/SignUpPage";
import { TransactionsPage } from "./pages/TransactionsPage/TransactionsPage";

function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicOnly() {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
