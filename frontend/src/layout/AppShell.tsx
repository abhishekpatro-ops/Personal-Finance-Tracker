import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const THEME_KEY = "pft_theme";

type ThemeMode = "light" | "dark";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Transactions", "/transactions"],
  ["Categories", "/categories"],
  ["Budgets", "/budgets"],
  ["Goals", "/goals"],
  ["Reports", "/reports"],
  ["Insights", "/insights"],
  ["Rules", "/rules"],
  ["Recurring", "/recurring"],
  ["Accounts", "/accounts"],
  ["Shared", "/shared-accounts"],
  ["Settings", "/settings"]
] as const;

type ToastState = {
  message: string;
  variant: "success" | "error";
};

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getDisplayUserName(token: string | null) {
  if (!token) return "User";
  const payload = decodeJwtPayload(token);
  if (!payload) return "User";

  const directName =
    payload.name ??
    payload.unique_name ??
    payload.preferred_username ??
    payload.given_name ??
    payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"];

  if (typeof directName === "string" && directName.trim()) {
    return directName.trim();
  }

  const email = payload.email ?? payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"];
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0];
  }

  const subject = payload.sub ?? payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
  if (typeof subject === "string" && subject.trim()) {
    return subject.trim();
  }

  return "User";
}

function pageTitleFromPath(pathname: string) {
  const matched = navItems.find(([, path]) => pathname.startsWith(path));
  return matched?.[0] ?? "MoneyPilot";
}

export function AppShell() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === "dark" ? "dark" : "light";
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const storedDisplayName = useAuthStore((s) => s.displayName);
  const setTokens = useAuthStore((s) => s.setTokens);
  const clearTokens = useAuthStore((s) => s.clearTokens);

  const resolvedName = getDisplayUserName(accessToken);
  const displayName = storedDisplayName?.trim() ? storedDisplayName : resolvedName;

  useEffect(() => {
    if (!storedDisplayName?.trim() && accessToken && refreshToken && resolvedName !== "User") {
      setTokens(accessToken, refreshToken, resolvedName);
    }
  }, [storedDisplayName, accessToken, refreshToken, resolvedName, setTokens]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2600);
  }

  function handleSignOut() {
    clearTokens();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMobileNavOpen ? "mobile-open" : ""}`}>
        <h1>MoneyPilot</h1>
        <nav>
          {navItems.map(([label, path]) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setIsMobileNavOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-user-name" title={displayName}>{displayName}</p>
          <div className="sidebar-theme-toggle" role="group" aria-label="Theme toggle">
            <button
              type="button"
              className={`sidebar-theme-option ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
            <button
              type="button"
              className={`sidebar-theme-option ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
          </div>
          <button type="button" className="sidebar-signout" onClick={handleSignOut}>Sign Out</button>
        </div>
      </aside>

      {isMobileNavOpen ? (
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open menu"
            >
              Menu
            </button>
            <p className="page-title">{pageTitleFromPath(location.pathname)}</p>
          </div>
        </header>

        <Outlet />
        {toast ? <div className={`app-toast app-toast-${toast.variant}`}>{toast.message}</div> : null}
      </main>
    </div>
  );
}

