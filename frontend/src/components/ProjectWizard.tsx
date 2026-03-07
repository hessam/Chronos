import { useState, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import StoryIntake from './StoryIntake';

const GENRES = [
    { value: 'fantasy', label: '🗡️ Fantasy', desc: 'Epic quests, magic systems, world-building' },
    { value: 'scifi', label: '🚀 Sci-Fi', desc: 'Space, technology, alternate futures' },
    { value: 'thriller', label: '🔪 Thriller', desc: 'Suspense, crime, mystery' },
    { value: 'romance', label: '💕 Romance', desc: 'Relationships, emotional arcs' },
    { value: 'historical', label: '📜 Historical', desc: 'Real eras, parallel timelines' },
    { value: 'literary', label: '📖 Literary', desc: 'Character-driven, literary fiction' },
    { value: 'other', label: '✨ Other', desc: 'Something unique' },
];

const START_MODES = [
    {
        value: 'blank',
        icon: '📄',
        label: 'Blank Canvas',
        desc: 'Start from scratch — add characters, events, and timelines manually',
    },
    {
        value: 'premise',
        icon: '💡',
        label: 'From a Premise',
        desc: 'Describe your story idea and Chronos will extract characters, events, and relationships',
    },
    {
        value: 'characters',
        icon: '👥',
        label: 'Start with Characters',
        desc: 'Build your cast first, then create events and timelines around them',
    },
];

interface ProjectWizardProps {
    onClose: () => void;
}

export default function ProjectWizard({ onClose }: ProjectWizardProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(1);

    // Step 1
    const [name, setName] = useState('');
    const [genre, setGenre] = useState('');

    // Step 2
    const [startMode, setStartMode] = useState('blank');

    // Step 3
    const [premise, setPremise] = useState('');
    const [error, setError] = useState('');
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: (body: { name: string; description: string }) =>
            api.createProject(body),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            if (startMode === 'premise') {
                setCreatedProjectId(data.project.id);
            } else {
                navigate(`/project/${data.project.id}`);
            }
        },
        onError: (err: Error) => setError(err.message),
    });

    const handleFinish = (e?: FormEvent) => {
        e?.preventDefault();
        const description = premise || `A ${genre || 'new'} project`;
        createMutation.mutate({
            name: name.trim(),
            description: description.trim(),
        });
    };

    const canProceed = () => {
        if (step === 1) return name.trim().length > 0;
        if (step === 2) return !!startMode;
        if (step === 3 && startMode === 'premise') return premise.trim().length > 20;
        return true;
    };

    if (createdProjectId && startMode === 'premise') {
        return (
            <div className="modal-overlay">
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', padding: 0 }}>
                    <StoryIntake
                        projectId={createdProjectId}
                        premise={premise}
                        onComplete={() => navigate(`/project/${createdProjectId}`)}
                        onSkip={() => navigate(`/project/${createdProjectId}`)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 520, width: '100%' }}
            >
                {/* Progress bar */}
                <div style={{
                    display: 'flex', gap: 4, marginBottom: 'var(--space-3)',
                }}>
                    {[1, 2, 3].map(s => (
                        <div key={s} style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: s <= step ? 'var(--accent)' : 'var(--border)',
                            transition: 'background 0.3s',
                        }} />
                    ))}
                </div>

                {/* Step 1: Name + Genre */}
                {step === 1 && (
                    <div>
                        <h2 className="modal-title" style={{ marginBottom: 4 }}>Name your project</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                            What's your story called?
                        </p>

                        <div className="form-group">
                            <input
                                className="input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="The Shattered Timeline"
                                autoFocus
                                style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}
                            />
                        </div>

                        <div style={{ marginTop: 'var(--space-3)' }}>
                            <label className="label" style={{ marginBottom: 8 }}>Genre (optional)</label>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: 6,
                            }}>
                                {GENRES.map(g => (
                                    <button
                                        key={g.value}
                                        type="button"
                                        onClick={() => setGenre(g.value === genre ? '' : g.value)}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: 'var(--radius-md)',
                                            border: genre === g.value
                                                ? '2px solid var(--accent)' : '1px solid var(--border)',
                                            background: genre === g.value
                                                ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{g.label}</div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{g.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Starting Mode */}
                {step === 2 && (
                    <div>
                        <h2 className="modal-title" style={{ marginBottom: 4 }}>How do you want to start?</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                            Choose your starting point for "<strong>{name}</strong>"
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {START_MODES.map(mode => (
                                <button
                                    key={mode.value}
                                    type="button"
                                    onClick={() => setStartMode(mode.value)}
                                    style={{
                                        padding: '14px 16px',
                                        borderRadius: 'var(--radius-md)',
                                        border: startMode === mode.value
                                            ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        background: startMode === mode.value
                                            ? 'rgba(99,102,241,0.08)' : 'var(--bg-secondary)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <span style={{ fontSize: 24 }}>{mode.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{mode.label}</div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                                            {mode.desc}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3: Premise / Summary */}
                {step === 3 && (
                    <div>
                        <h2 className="modal-title" style={{ marginBottom: 4 }}>
                            {startMode === 'premise' ? 'Tell me about your story' : 'Almost there!'}
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                            {startMode === 'premise'
                                ? 'Describe your story premise and Chronos will extract characters, events, and timelines for you.'
                                : startMode === 'characters'
                                    ? 'Add a brief description to help you get started. You can add characters right away in the workspace.'
                                    : 'Add a brief description (optional). Your blank workspace is ready.'}
                        </p>

                        <textarea
                            className="textarea"
                            value={premise}
                            onChange={(e) => setPremise(e.target.value)}
                            placeholder={startMode === 'premise'
                                ? 'In a world where time fractures into parallel streams after The Great Collapse, a historian named Lyra discovers she can walk between timelines. She must find her missing daughter who was swept into an unstable branch where the Roman Empire never fell...'
                                : 'A brief description of your story...'}
                            rows={startMode === 'premise' ? 6 : 3}
                            autoFocus={startMode === 'premise'}
                            style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6 }}
                        />

                        {startMode === 'premise' && premise.length > 0 && premise.length < 20 && (
                            <p style={{
                                fontSize: 'var(--text-xs)', color: '#f59e0b', marginTop: 4,
                            }}>
                                Tell me more! A few sentences will help Chronos extract better entities.
                            </p>
                        )}
                    </div>
                )}

                {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

                {/* Actions */}
                <div className="modal-actions" style={{ marginTop: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        {step > 1 ? (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setStep(step - 1)}
                            >
                                ← Back
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        {step < 3 ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setStep(step + 1)}
                                disabled={!canProceed()}
                            >
                                Next →
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleFinish()}
                                disabled={createMutation.isPending || (startMode === 'premise' && !canProceed())}
                            >
                                {createMutation.isPending ? 'Creating...' : '🚀 Create Project'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
