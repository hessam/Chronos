import { useState, useEffect } from 'react';
import type { Entity, Relationship } from '../store/appStore';
import { coWriteScene, analyzePacing, analyzeThematicThreading, analyzeConflictEscalation } from '../services/aiService';
import type { CoWriteOptions, SceneCard, PacingResult, ThematicResult, ConflictResult } from '../services/aiService';

interface CoWriteViewProps {
    entities: Entity[];
    relationships: Relationship[];
    onEntityUpdate: (id: string, body: Partial<Entity>) => void;
    projectContext?: string;
}

export default function CoWriteView({
    entities,
    relationships,
    onEntityUpdate,
    projectContext
}: CoWriteViewProps) {
    // Local state
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [draftText, setDraftText] = useState('');
    const [isWriting, setIsWriting] = useState(false);
    const [writeError, setWriteError] = useState<string | null>(null);
    const [wordCount, setWordCount] = useState(0);

    // AI Options state
    const [options, setOptions] = useState<CoWriteOptions>({
        tone: 'commercial',
        pov: 'third_limited',
        tense: 'past',
        targetWordCount: 800,
        includeDialogue: true,
        emotionalIntensity: 3
    });

    // Health state
    const [pacingResult, setPacingResult] = useState<PacingResult | null>(null);
    const [thematicResult, setThematicResult] = useState<ThematicResult | null>(null);
    const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Derived data
    const events = entities
        .filter(e => e.entity_type === 'event')
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const characters = entities.filter(e => e.entity_type === 'character');
    const locations = entities.filter(e => e.entity_type === 'location');
    const themes = entities.filter(e => e.entity_type === 'theme');

    const selectedEvent = events.find(e => e.id === selectedEventId) || events[0];
    const sceneCard = selectedEvent?.properties?.scene_card as SceneCard | undefined;

    // Save options to localStorage on change
    useEffect(() => {
        const saved = localStorage.getItem('chronos_cowrite_options');
        if (saved) {
            try { setOptions(JSON.parse(saved)); } catch (e) { /* ignore */ }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('chronos_cowrite_options', JSON.stringify(options));
    }, [options]);

    // Handle selection change
    useEffect(() => {
        if (selectedEvent) {
            const prose = (selectedEvent.properties?.draft_prose as string) || '';
            setDraftText(prose);
            setWordCount(prose.trim() ? prose.trim().split(/\s+/).length : 0);
        }
    }, [selectedEvent?.id]);

    const handleSaveDraft = (text: string) => {
        setDraftText(text);
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);

        if (selectedEvent) {
            onEntityUpdate(selectedEvent.id, {
                properties: {
                    ...selectedEvent.properties,
                    draft_prose: text
                }
            });
        }
    };

    const handleCoWrite = async () => {
        if (!selectedEvent) return;
        setIsWriting(true);
        setWriteError(null);

        try {
            // Get connected entities via relationships
            const connectedIds = relationships
                .filter(r => r.from_entity_id === selectedEvent.id || r.to_entity_id === selectedEvent.id)
                .map(r => r.from_entity_id === selectedEvent.id ? r.to_entity_id : r.from_entity_id);

            const reqChars = characters
                .filter(c => connectedIds.includes(c.id))
                .map(c => ({
                    name: c.name,
                    description: c.description || '',
                    voiceSamples: c.properties?.voice_samples as any
                }));

            const reqLocs = locations
                .filter(l => connectedIds.includes(l.id))
                .map(l => ({ name: l.name, description: l.description || '' }));

            const reqThemes = themes
                .filter(t => connectedIds.includes(t.id))
                .map(t => ({ name: t.name, description: t.description || '' }));

            const result = await coWriteScene({
                eventName: selectedEvent.name,
                eventDescription: selectedEvent.description || '',
                characters: reqChars,
                locations: reqLocs,
                themes: reqThemes,
                options,
                projectContext
            });

            // Append or replace
            const newText = draftText ? draftText + '\n\n' + result.prose : result.prose;
            handleSaveDraft(newText);

            // Also save the generated scene card if we didn't have one
            if (!sceneCard) {
                onEntityUpdate(selectedEvent.id, {
                    properties: {
                        ...selectedEvent.properties,
                        draft_prose: newText,
                        scene_card: result.sceneCard
                    }
                });
            }

        } catch (err) {
            setWriteError(err instanceof Error ? err.message : 'Co-write failed');
        } finally {
            setIsWriting(false);
        }
    };

    const runFullAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const reqEvents = events.map(e => ({
                id: e.id,
                name: e.name,
                description: e.description || '',
                charactersInvolved: characters.filter(c =>
                    relationships.some(r =>
                        (r.from_entity_id === e.id && r.to_entity_id === c.id) ||
                        (r.from_entity_id === c.id && r.to_entity_id === e.id)
                    )
                ).map(c => c.name),
                emotionLevel: (e.properties?.emotion_level as number) || 0,
                wordCount: ((e.properties?.draft_prose as string) || '').split(/\s+/).length
            }));

            const [pRes, tRes, cRes] = await Promise.all([
                analyzePacing({
                    events: reqEvents,
                    projectName: projectContext || 'Unknown Project'
                }),
                analyzeThematicThreading({
                    events: reqEvents,
                    themes: themes.map(t => ({ name: t.name, description: t.description || '' })),
                    relationships: relationships.map(r => ({
                        from: entities.find(e => e.id === r.from_entity_id)?.name || '',
                        to: entities.find(e => e.id === r.to_entity_id)?.name || '',
                        type: r.relationship_type
                    })),
                    projectName: projectContext || 'Unknown Project'
                }),
                analyzeConflictEscalation({
                    events: reqEvents,
                    projectName: projectContext || 'Unknown Project'
                })
            ]);

            setPacingResult(pRes);
            setThematicResult(tRes);
            setConflictResult(cRes);
        } catch (err) {
            console.error(err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (events.length === 0) {
        return (
            <div className="cowrite-view empty-state">
                No events found. Create some events in the Graph or Timeline view first.
            </div>
        );
    }

    return (
        <div className="cowrite-view">
            {/* LEFT SIDEBAR: Events List */}
            <div className="cowrite-sidebar">
                <div className="sidebar-header">
                    <h3>Chapters & Scenes</h3>
                    <span className="total-words">
                        {events.reduce((acc, e) => acc + (((e.properties?.draft_prose as string) || '').trim().split(/\\s+/).filter(Boolean).length), 0)} words total
                    </span>
                </div>
                <div className="event-list">
                    {events.map((e, idx) => {
                        const hasProse = !!e.properties?.draft_prose;
                        const proseWords = hasProse ? (e.properties!.draft_prose as string).trim().split(/\\s+/).filter(Boolean).length : 0;
                        const isSelected = e.id === (selectedEvent?.id);

                        return (
                            <div
                                key={e.id}
                                className={`event-item ${isSelected ? 'selected' : ''} ${hasProse ? 'has-content' : ''}`}
                                onClick={() => setSelectedEventId(e.id)}
                            >
                                <div className="event-item-top">
                                    <span className="event-idx">{idx + 1}</span>
                                    <span className="event-name">{e.name}</span>
                                </div>
                                {hasProse && <span className="event-words">{proseWords}w</span>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MAIN AREA: Writing & Reading */}
            <div className="cowrite-main">
                {selectedEvent && (
                    <>
                        <div className="cowrite-header">
                            <div className="header-left">
                                <h2>{selectedEvent.name}</h2>
                                {sceneCard?.pov && <span className="badge pov-badge">POV: {sceneCard.pov}</span>}
                            </div>
                            <div className="header-right">
                                <span className="word-count">{wordCount} words</span>
                            </div>
                        </div>

                        {sceneCard && (
                            <div className="scene-card-summary">
                                <strong>Goal:</strong> {sceneCard.goal} | <strong>Conflict:</strong> {sceneCard.conflict}
                            </div>
                        )}

                        <div className="editor-container">
                            <textarea
                                className="draft-editor"
                                value={draftText}
                                onChange={(e) => handleSaveDraft(e.target.value)}
                                placeholder="Start writing, or click ✨ Co-Write to let AI generate the scene for you..."
                            />
                        </div>

                        <div className="cowrite-actions">
                            <button
                                className={`cowrite-btn ${isWriting ? 'loading' : ''}`}
                                onClick={handleCoWrite}
                                disabled={isWriting}
                            >
                                {isWriting ? '✍️ Writing...' : '✨ Co-Write This Scene'}
                            </button>
                            {writeError && <span className="error-text">{writeError}</span>}
                        </div>
                    </>
                )}
            </div>

            {/* RIGHT SIDEBAR: Settings & Health */}
            <div className="cowrite-settings">
                <div className="settings-section">
                    <h3>Co-Author Settings</h3>

                    <label>
                        <span>Tone</span>
                        <select value={options.tone} onChange={e => setOptions({ ...options, tone: e.target.value as any })}>
                            <option value="commercial">Commercial/Pacey</option>
                            <option value="literary">Literary/Profound</option>
                            <option value="cinematic">Cinematic/Visual</option>
                            <option value="minimalist">Minimalist/Sparse</option>
                            <option value="lyrical">Lyrical/Poetic</option>
                        </select>
                    </label>

                    <label>
                        <span>POV</span>
                        <select value={options.pov} onChange={e => setOptions({ ...options, pov: e.target.value as any })}>
                            <option value="first">1st Person ("I")</option>
                            <option value="second">2nd Person ("You")</option>
                            <option value="third_limited">3rd Limited ("He/She" close)</option>
                            <option value="third_omniscient">3rd Omniscient ("He/She" all-knowing)</option>
                        </select>
                    </label>

                    <label>
                        <span>Tense</span>
                        <select value={options.tense} onChange={e => setOptions({ ...options, tense: e.target.value as any })}>
                            <option value="past">Past Tense ("ran")</option>
                            <option value="present">Present Tense ("runs")</option>
                        </select>
                    </label>

                    <label>
                        <span>Emotional Intensity (1-5)</span>
                        <input
                            type="range" min="1" max="5"
                            value={options.emotionalIntensity}
                            onChange={e => setOptions({ ...options, emotionalIntensity: parseInt(e.target.value) as any })}
                        />
                    </label>

                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={options.includeDialogue}
                            onChange={e => setOptions({ ...options, includeDialogue: e.target.checked })}
                        />
                        <span>Include Dialogue</span>
                    </label>
                </div>

                <div className="settings-section health-section">
                    <div className="health-header">
                        <h3>Story Diagnostics</h3>
                        <button className="small-btn cowrite-btn" style={{ padding: '4px 12px', fontSize: '11px' }} onClick={runFullAnalysis} disabled={isAnalyzing}>
                            {isAnalyzing ? 'Analyzing...' : 'Run Diagnostics'}
                        </button>
                    </div>

                    {pacingResult || thematicResult || conflictResult ? (
                        <div className="pacing-report">
                            {pacingResult && (
                                <div className="diagnostic-block">
                                    <h4 style={{ fontSize: '11px', margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Pacing Score</h4>
                                    <div className="health-score">
                                        <span className="score-val">{pacingResult.score}</span><span style={{ fontSize: '12px' }}>/100</span>
                                    </div>
                                    <div className="pacing-suggestions">
                                        {pacingResult.suggestions.map((s, i) => (
                                            <p key={`p-${i}`}>⚡ {s}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {conflictResult && (
                                <div className="diagnostic-block" style={{ marginTop: '16px' }}>
                                    <h4 style={{ fontSize: '11px', margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Conflict Escalation</h4>
                                    <div className="health-score">
                                        <span className="score-val" style={{ color: '#f59e0b' }}>{conflictResult.escalationScore}</span><span style={{ fontSize: '12px' }}>/100</span>
                                    </div>
                                    <div className="pacing-suggestions">
                                        {conflictResult.plateauWarnings.map((w, i) => (
                                            <p key={`cw-${i}`} style={{ color: '#fcd34d' }}>⚠️ {w}</p>
                                        ))}
                                        {conflictResult.suggestions.map((s, i) => (
                                            <p key={`cs-${i}`}>🔥 {s}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {thematicResult && Object.keys(thematicResult.themeCoverage).length > 0 && (
                                <div className="diagnostic-block" style={{ marginTop: '16px' }}>
                                    <h4 style={{ fontSize: '11px', margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>Thematic Discovery</h4>
                                    {Object.entries(thematicResult.themeCoverage).map(([theme, data]) => (
                                        <div key={theme} className="pacing-suggestions" style={{ marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <strong style={{ color: 'var(--accent)', fontSize: '11px' }}>{theme}</strong>
                                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{data.score}/100</span>
                                            </div>
                                            <p>✨ {data.suggestion}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="empty-text" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            Click analyze to evaluate pacing rhythm, conflict escalation, and thematic threading across all drafted scenes.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
