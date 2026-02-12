import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    loadAISettings,
    saveAISettings,
    AI_MODELS,
    PROVIDER_LABELS,
    PROVIDER_COLORS,
    getModelsForProvider,
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

    const availableModels = getModelsForProvider(settings.defaultProvider);
    const allProviders: AIProvider[] = ['openai', 'anthropic', 'google'];

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

            {/* Default Provider */}
            <div className="card" style={{ marginBottom: 'var(--space-3)', borderColor: 'var(--border)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🤖 Default Provider
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-1)' }}>
                    {allProviders.map(provider => {
                        const isActive = settings.defaultProvider === provider;
                        const hasKey = !!settings.apiKeys[provider];
                        return (
                            <button
                                key={provider}
                                onClick={() => {
                                    const models = getModelsForProvider(provider);
                                    setSettings(prev => ({
                                        ...prev,
                                        defaultProvider: provider,
                                        defaultModel: models[0]?.id || prev.defaultModel,
                                    }));
                                }}
                                style={{
                                    padding: 'var(--space-2)',
                                    borderRadius: 'var(--radius-md)',
                                    border: `2px solid ${isActive ? PROVIDER_COLORS[provider] : 'var(--border)'}`,
                                    background: isActive ? `${PROVIDER_COLORS[provider]}15` : 'var(--bg-tertiary)',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all 0.15s',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{PROVIDER_LABELS[provider]}</div>
                                <div style={{
                                    fontSize: 'var(--text-xs)',
                                    color: hasKey ? 'var(--success)' : 'var(--text-tertiary)',
                                    marginTop: 4,
                                }}>
                                    {hasKey ? '✓ Key configured' : 'No key set'}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Model Selection */}
            <div className="card" style={{ marginBottom: 'var(--space-3)', borderColor: 'var(--border)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🧠 Model Selection
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    {availableModels.map(model => {
                        const isActive = settings.defaultModel === model.id;
                        return (
                            <button
                                key={model.id}
                                onClick={() => setSettings(prev => ({ ...prev, defaultModel: model.id }))}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px var(--space-2)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                                    background: isActive ? 'var(--accent-muted)' : 'var(--bg-primary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    color: 'var(--text-primary)',
                                    textAlign: 'left',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: 'var(--text-base)' }}>{model.name}</div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                        {model.id} • {(model.maxTokens / 1000).toFixed(0)}K context
                                    </div>
                                </div>
                                <div style={{
                                    fontSize: 'var(--text-sm)',
                                    color: model.costPer1kTokens < 0.1 ? 'var(--success)' : model.costPer1kTokens < 0.5 ? 'var(--warning)' : 'var(--error)',
                                    fontWeight: 600,
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    ${model.costPer1kTokens.toFixed(3)}/1K
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* All models reference */}
                <details style={{ marginTop: 'var(--space-2)' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        All {AI_MODELS.length} supported models
                    </summary>
                    <div style={{
                        marginTop: 'var(--space-1)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                        display: 'grid',
                        gap: 4,
                    }}>
                        {AI_MODELS.map(m => (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span>{PROVIDER_LABELS[m.provider]} — {m.name}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                                    ${m.costPer1kTokens.toFixed(3)}/1K
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
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
