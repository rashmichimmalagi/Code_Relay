import {
  CheckCircle2,
  Code2,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { BackButton } from "./BackButton";

type NavigationMessage = {
  type: "success" | "info";
  message: string;
};

export function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    profile,
    signOut,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [notification, setNotification] =
    useState<NavigationMessage | null>(null);

  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  const isLandingPage =
    location.pathname === "/";

  /*
   * Normalize role because the database may contain
   * "admin", "ADMIN", "super_admin", etc.
   */
  const role = String(
    profile?.role ?? ""
  ).toLowerCase();

  const isAdmin =
    role === "admin" ||
    role === "super_admin";

  /*
   * Show notification passed through router state.
   */
  useEffect(() => {
    const state = location.state as
      | {
          notification?: NavigationMessage;
        }
      | undefined;

    if (!state?.notification) {
      return;
    }

    setNotification(state.notification);

    navigate(
      location.pathname +
        location.search +
        location.hash,
      {
        replace: true,
        state: {},
      }
    );

    const timer = window.setTimeout(() => {
      setNotification(null);
    }, 4500);

    return () =>
      window.clearTimeout(timer);
  }, [
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

  async function logout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setOpen(false);

    try {
      await signOut();

      sessionStorage.setItem(
        "coderelay_logout_message",
        "You have been signed out successfully. See you soon! 👋"
      );

      navigate("/", {
        replace: true,
      });
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );

      setNotification({
        type: "info",
        message:
          "We couldn't complete sign out. Please try again.",
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  /*
   * Restore logout notification after navigating
   * to the landing page.
   */
  useEffect(() => {
    if (location.pathname !== "/") {
      return;
    }

    const message =
      sessionStorage.getItem(
        "coderelay_logout_message"
      );

    if (!message) {
      return;
    }

    sessionStorage.removeItem(
      "coderelay_logout_message"
    );

    setNotification({
      type: "success",
      message,
    });

    const timer = window.setTimeout(() => {
      setNotification(null);
    }, 4500);

    return () =>
      window.clearTimeout(timer);
  }, [location.pathname]);

  const studentName =
    profile?.full_name?.trim() ||
    user?.name?.trim() ||
    "Student";

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

          {/* Left */}
          <div className="flex items-center gap-3">

            {!isLandingPage && (
              <BackButton
                fallback={isAdmin
                  ? location.pathname === "/admin/dashboard"
                    ? "/"
                    : "/admin/dashboard"
                  : location.pathname === "/dashboard"
                    ? "/"
                    : "/dashboard"}
                preferHistory={location.pathname !== "/dashboard"}
                iconOnly
                className="h-9 w-9 justify-center px-0 py-0"
              />
            )}

            <Link
              to="/"
              className="flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
                <Code2
                  size={20}
                  strokeWidth={2.5}
                />
              </div>

              <div>
                <div className="text-base font-bold tracking-tight">
                  CodeRelay
                </div>

                <div className="hidden text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:block">
                  Technical Competition
                </div>
              </div>
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-2 md:flex">
            {user && isAdmin ? (
              <>
                <Link
                  to="/admin/dashboard"
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    location.pathname === "/admin/dashboard"
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Admin Dashboard
                </Link>
                <Link
                  to="/admin/teams"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  Teams
                </Link>
                <Link
                  to="/admin/round2"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  Round 2
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut size={16} />
                  {isLoggingOut ? "Signing out..." : "Logout"}
                </button>
              </>
            ) : user ? (
              <>
                <Link
                  to="/dashboard"
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    location.pathname ===
                    "/dashboard"
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Dashboard
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut size={16} />

                  {isLoggingOut
                    ? "Signing out..."
                    : "Logout"}
                </button>
              </>
            ) : !user ? (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  Login
                </Link>

                <Link
                  to="/signup"
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Student Sign Up
                </Link>
              </>
            ) : null}
          </nav>

          {/* Mobile menu */}
          <button
            type="button"
            onClick={() =>
              setOpen((value) => !value)
            }
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 md:hidden"
            aria-label="Toggle navigation"
          >
            {open ? (
              <X size={20} />
            ) : (
              <Menu size={20} />
            )}
          </button>
        </div>

        {/* Mobile navigation */}
        {open && (
          <div className="border-t border-white/10 bg-slate-950 px-4 py-4 md:hidden">
            <div className="mx-auto max-w-7xl space-y-2">

              {user && isAdmin ? (
                <>
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs text-slate-500">Signed in as</p>
                    <p className="mt-1 text-sm font-medium text-white">{studentName}</p>
                  </div>
                  <Link to="/admin/dashboard" onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
                    Admin Dashboard
                  </Link>
                  <Link to="/admin/teams" onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
                    Team Management
                  </Link>
                  <Link to="/admin/round2" onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
                    Round 2
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={isLoggingOut}
                    className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <LogOut size={16} />
                    {isLoggingOut ? "Signing out..." : "Logout"}
                  </button>
                </>
              ) : user ? (
                <>
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs text-slate-500">
                      Signed in as
                    </p>

                    <p className="mt-1 text-sm font-medium text-white">
                      {studentName}
                    </p>
                  </div>

                  <Link
                    to="/dashboard"
                    onClick={() =>
                      setOpen(false)
                    }
                    className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    Dashboard
                  </Link>

                  <button
                    type="button"
                    onClick={logout}
                    disabled={isLoggingOut}
                    className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    <LogOut size={16} />

                    {isLoggingOut
                      ? "Signing out..."
                      : "Logout"}
                  </button>
                </>
              ) : !user ? (
                <>
                  <Link
                    to="/login"
                    onClick={() =>
                      setOpen(false)
                    }
                    className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    Login
                  </Link>

                  <Link
                    to="/signup"
                    onClick={() =>
                      setOpen(false)
                    }
                    className="block rounded-lg bg-cyan-400 px-4 py-3 text-center text-sm font-semibold text-slate-950"
                  >
                    Student Sign Up
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {/* Notification */}
      {notification && (
        <div className="fixed right-4 top-20 z-[100] w-[calc(100%-2rem)] max-w-md sm:right-6 sm:top-20">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-slate-900 px-4 py-3 shadow-2xl shadow-black/30">

            <div className="mt-0.5 shrink-0 text-emerald-400">
              <CheckCircle2 size={20} />
            </div>

            <div>
              <p className="text-sm font-medium text-white">
                {notification.message}
              </p>
            </div>

          </div>
        </div>
      )}

      {/* Page */}
      <main>{children}</main>
    </div>
  );
}