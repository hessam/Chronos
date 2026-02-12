import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function SignUpPage() {
    const signUp = useAuthStore((s) => s.signUp);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setLoading(true);

        try {
            await signUp(email, password, name);
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Sign up failed');
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className="auth-layout">
                <div className="auth-card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 'var(--space-2)' }}>✉️</div>
                    <h1 className="auth-title">Check your email</h1>
                    <p className="auth-subtitle">
                        We sent a verification link to <strong>{email}</strong>.
                        Click the link to activate your account.
                    </p>
                    <Link to="/login" className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }}>
                        Back to login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-layout">
            <div className="auth-card">
                <h1 className="auth-title">Create your account</h1>
                <p className="auth-subtitle">Start building your narrative universe</p>

                {error && (
                    <div style={{ background: 'var(--error-muted)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-1) var(--space-2)', marginBottom: 'var(--space-2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="label">Full Name</label>
                        <input
                            type="text"
                            className="input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Email</label>
                        <input
                            type="email"
                            className="input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Password</label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 8 characters"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Confirm Password</label>
                        <input
                            type="password"
                            className="input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat password"
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-2)' }} disabled={loading}>
                        {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Create Account'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
