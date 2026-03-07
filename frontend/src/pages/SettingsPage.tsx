import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    loadAISettings,
    saveAISettings,
    PROVIDER_LABELS,
    type AIProvider,
    type AISettings,
} from '../services/aiService';

export default function SettingsPage() {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<AISettings>(loadAISettings);
    const [saved, setSaved] = useState(false);
    const [showKeys, setShowKeys] = useState<Partial<Record<AIProvider, boolean>>>({});

    useEffect(() => {
        if (saved) {
            const timer = setTimeout(() => setSaved(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [saved]);

    const handleSave = () => {
        saveAISettings(settings);
        setSaved(true);
    };

    const setApiKey = (provider: AIProvider, key: string) => {
        setSettings(prev => ({
            ...prev,
            apiKeys: { ...prev.apiKeys, [provider]: key },
        }));
    };


    const allProviders: AIProvider[] = ['anthropic'];

    return (
        <div style={{
            maxWidth: 680,
            margin: '0 auto',
            padding: 'var(--space-4)',
            minHeight: '100vh',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
                <div>
                    <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>⚙️ AI Settings</h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 2 }}>
                        Configure AI providers for idea generation, consistency checking, and more.
                    </p>
                </div>
            </div>


            {/* API Keys */}
            <div className="card" style={{ marginBottom: 'var(--space-3)', borderColor: 'var(--border)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔑 API Keys
                </h3>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
                    Keys are stored locally in your browser. They are never sent to Chronos servers.
                </p>
                {allProviders.map(provider => (
                    <div key={provider} className="form-group">
                        <label className="label">{PROVIDER_LABELS[provider]} API Key</label>
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                            <input
                                className="input"
                                type={showKeys[provider] ? 'text' : 'password'}
                                value={settings.apiKeys[provider] || ''}
                                onChange={(e) => setApiKey(provider, e.target.value)}
                                placeholder={
                                    provider === 'openai' ? 'sk-...' :
                                        provider === 'anthropic' ? 'sk-ant-...' :
                                            'AI...'
                                }
                                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                            />
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
                                style={{ minWidth: 36 }}
                            >
                                {showKeys[provider] ? '🙈' : '👁'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Save */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                {saved && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        color: 'var(--success)',
                        fontSize: 'var(--text-sm)',
                        animation: 'fade-in 0.2s ease-out',
                    }}>
                        ✓ Settings saved
                    </div>
                )}
                <button className="btn btn-primary" onClick={handleSave}>
                    💾 Save Settings
                </button>
            </div>
        </div>
    );
}
