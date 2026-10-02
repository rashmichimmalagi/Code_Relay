import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";

import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

import {
  SignupPage,
  VerifyEmailPage,
  LoginPage,
} from "./pages/AuthPages";

import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CreateTeamPage } from "./pages/CreateTeamPage";
import { TeamStatusPage } from "./pages/TeamStatusPage";

import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminSignupPage } from "./pages/AdminSignupPage";
import { PasswordRecoveryPage } from "./pages/PasswordRecoveryPage";

import AdminDashboardPage from "./pages/AdminDashboardPage";
import { AdminTeamManagementPage } from "./pages/AdminTeamManagementPage";
import AdminRound2Page from "./pages/AdminRound2Page";

function App() {
  return (
    <AuthProvider>
      <Routes>

        {/* =========================
            PUBLIC PAGES
        ========================== */}

        <Route
          path="/"
          element={<LandingPage />}
        />

        <Route
          path="/signup"
          element={<SignupPage />}
        />

        <Route
          path="/verify-email"
          element={<VerifyEmailPage />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/reset-password"
          element={<PasswordRecoveryPage />}
        />

        {/* =========================
            STUDENT PROTECTED PAGES
        ========================== */}

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/team/create"
          element={
            <ProtectedRoute>
              <Layout>
                <CreateTeamPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/team/status"
          element={
            <ProtectedRoute>
              <Layout>
                <TeamStatusPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* =========================
            ADMIN AUTHENTICATION
        ========================== */}

        <Route
          path="/admin/login"
          element={<AdminLoginPage />}
        />

        <Route
          path="/admin/signin"
          element={<AdminLoginPage />}
        />

        <Route
          path="/admin/signup"
          element={<AdminSignupPage />}
        />

        {/* =========================
            ADMIN PROTECTED PAGES
        ========================== */}

        <Route
          path="/admin"
          element={<Navigate to="/admin/dashboard" replace />}
        />

        <Route
          path="/admin/dashboard"
          element={
            <AdminProtectedRoute>
              <Layout>
                <AdminDashboardPage />
              </Layout>
            </AdminProtectedRoute>
          }
        />

        <Route
          path="/admin/teams"
          element={
            <AdminProtectedRoute>
              <Layout>
                <AdminTeamManagementPage />
              </Layout>
            </AdminProtectedRoute>
          }
        />

        <Route
          path="/admin/round2"
          element={
            <AdminProtectedRoute>
              <Layout>
                <AdminRound2Page />
              </Layout>
            </AdminProtectedRoute>
          }
        />

        {/* =========================
            FALLBACK
        ========================== */}

        <Route
          path="*"
          element={<LandingPage />}
        />

      </Routes>
    </AuthProvider>
  );
}

export default App;