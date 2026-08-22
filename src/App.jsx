import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ProfileProvider } from "./context/ProfileContext.jsx";
import { SurveyProvider } from "./context/SurveyContext.jsx";
import RequireApproved from "./components/RequireApproved.jsx";
import RequireAdmin from "./components/RequireAdmin.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SurveyFormPage from "./pages/SurveyFormPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import CompleteSignupPage from "./pages/CompleteSignupPage.jsx";

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <SurveyProvider>
          <BrowserRouter>
            <Routes>
              <Route
                path="/"
                element={
                  <RequireApproved>
                    <DashboardPage />
                  </RequireApproved>
                }
              />
              <Route
                path="/survey/:id"
                element={
                  <RequireApproved>
                    <SurveyFormPage />
                  </RequireApproved>
                }
              />
              <Route
                path="/report/:id"
                element={
                  <RequireApproved>
                    <ReportPage />
                  </RequireApproved>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireApproved>
                    <SettingsPage />
                  </RequireApproved>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminPage />
                  </RequireAdmin>
                }
              />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/complete-signup" element={<CompleteSignupPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SurveyProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}