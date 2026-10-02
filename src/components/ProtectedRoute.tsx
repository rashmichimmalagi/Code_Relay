import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const {
    user,
    profile,
    loading,
  } = useAuth();

  const location = useLocation();

  /*
   * Wait until InsForge finishes restoring
   * the authenticated session and profile.
   */
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-5">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />

          <p className="text-sm text-slate-500">
            Restoring your CodeRelay session…
          </p>
        </div>
      </div>
    );
  }

  /*
   * No authenticated user.
   */
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  /*
   * IMPORTANT:
   * Admin accounts must never access student pages.
   *
   * The backend may store the role as "admin" or "ADMIN",
   * so normalize it before checking.
   */
  const role = String(
    profile?.role ?? ""
  ).toLowerCase();

  const isAdmin =
    role === "admin" ||
    role === "super_admin";

  if (isAdmin) {
    return (
      <Navigate
        to="/admin/dashboard"
        replace
      />
    );
  }

  /*
   * Authenticated student.
   */
  return <>{children}</>;
}