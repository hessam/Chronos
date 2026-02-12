import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ProjectsPage from './pages/ProjectsPage';
import WorkspacePage from './pages/WorkspacePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="loading-center">
                <div className="spinner" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="loading-center">
                <div className="spinner" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/projects" replace />;
    }

    return <>{children}</>;
}

export default function App() {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
                <Route path="/signup" element={<AuthRoute><SignUpPage /></AuthRoute>} />
                <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
                <Route path="/project/:projectId" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
