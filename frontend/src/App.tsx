import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import WorkspacePage from './pages/WorkspacePage';
import OfflineIndicator from './components/OfflineIndicator';
import { initOfflineListeners } from './services/offlineService';
import React from 'react';

// Route-based code splitting (E6-US3)
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

// Loading fallback
function PageLoader() {
    return (
        <div className="loading-center">
            <div className="spinner" />
            <p style={{ marginTop: 16, color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                Loading...
            </p>
        </div>
    );
}

// ─── Error Boundary ─────────────────────────────────────
// Catches render errors so the app shows a recoverable error instead of a blank page.
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Chronos Error Boundary caught:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '100vh', fontFamily: 'system-ui, sans-serif', padding: 32,
                    background: '#0a0a14', color: '#e0e0e0',
                }}>
                    <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
                    <p style={{ color: '#888', marginBottom: 16, maxWidth: 500, textAlign: 'center' }}>
                        Chronos encountered an unexpected error. Try refreshing the page.
                    </p>
                    <pre style={{
                        background: '#1a1a2e', padding: 16, borderRadius: 8, fontSize: 13,
                        maxWidth: 600, overflow: 'auto', marginBottom: 16, color: '#f87171',
                    }}>
                        {this.state.error?.message}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 24px', borderRadius: 8, border: 'none',
                            background: '#6366f1', color: 'white', cursor: 'pointer',
                            fontSize: 14, fontWeight: 500,
                        }}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// ─── Auth-Guarded Routes ─────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return <PageLoader />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return <PageLoader />;
    }

    if (isAuthenticated) {
        return <Navigate to="/projects" replace />;
    }

    return <>{children}</>;
}

// ─── App Root ────────────────────────────────────────────
export default function App() {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    // Initialize offline listeners (E6-US1)
    useEffect(() => {
        const cleanup = initOfflineListeners();
        return cleanup;
    }, []);

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
                        <Route path="/signup" element={<AuthRoute><SignUpPage /></AuthRoute>} />
                        <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
                        <Route path="/project/:projectId" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
                        <Route path="/project/:projectId/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/projects" replace />} />
                    </Routes>
                </Suspense>
                <OfflineIndicator />
            </BrowserRouter>
        </ErrorBoundary>
    );
}

