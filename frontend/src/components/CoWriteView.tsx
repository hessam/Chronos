import { useState, useEffect } from 'react';
import type { Entity, Relationship } from '../store/appStore';
import { analyzePacing, analyzeThematicThreading, analyzeConflictEscalation, suggestBeats, generateBeatProse, generateSceneCard, analyzeDraftProse } from '../services/aiService';
import type { CoWriteOptions, SceneCard, PacingResult, ThematicResult, ConflictResult, DraftCritique } from '../services/aiService';
import { analyzeProseChunk, type FullProseDiagnostics } from '../utils/proseAnalyzer';
import { buildSmartContext, type ContextReport } from '../services/contextBuilder';
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

    // V2: Decoupled Writing State
    const [isPlanning, setIsPlanning] = useState(false);
    const [currentBeats, setCurrentBeats] = useState<Array<{ type: string, description: string }>>([]);
    const [completedBeats, setCompletedBeats] = useState<number>(0);
    const [liveDiagnostics, setLiveDiagnostics] = useState<FullProseDiagnostics | null>(null);
    const [draftCritiques, setDraftCritiques] = useState<DraftCritique[]>([]);
    const [isCritiquing, setIsCritiquing] = useState(false);

    // V3: Smart Context State
    const [contextReport, setContextReport] = useState<ContextReport | null>(null);
    const [contextSettings, setContextSettings] = useState({
        causalChainDepth: 2,
        characterHistoryDepth: 5,
        includeScientificConcepts: true
    });
    const [showContextInspector, setShowContextInspector] = useState(false);

    // Derived data
    const events = entities
        .filter((e: Entity) => e.entity_type === 'event')
        .sort((a: Entity, b: Entity) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const characters = entities.filter((e: Entity) => e.entity_type === 'character');
    const locations = entities.filter((e: Entity) => e.entity_type === 'location');
    const themes = entities.filter((e: Entity) => e.entity_type === 'theme');

    const selectedEvent = events.find((e: Entity) => e.id === selectedEventId) || events[0];
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

            // Clear beats when switching events
            setCurrentBeats((selectedEvent.properties?.scene_beats as any) || []);
            setCompletedBeats((selectedEvent.properties?.completed_beats as number) || 0);
            setLiveDiagnostics(analyzeProseChunk(prose));
            setDraftCritiques([]); // Clear old critiques when changing events

            // Generate smart context on load
            const report = buildSmartContext({
                currentEvent: selectedEvent,
                allEntities: entities,
                allRelationships: relationships,
                causalChainDepth: contextSettings.causalChainDepth,
                characterHistoryDepth: contextSettings.characterHistoryDepth,
                includeScientificConcepts: contextSettings.includeScientificConcepts
            });
            setContextReport(report);
        }
    }, [selectedEvent?.id, entities.length, relationships.length, contextSettings]);

    const handleSaveDraft = (text: string) => {
        setDraftText(text);
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
        setLiveDiagnostics(analyzeProseChunk(text));

        if (selectedEvent) {
            onEntityUpdate(selectedEvent.id, {
                properties: {
                    ...selectedEvent.properties,
                    draft_prose: text
                }
            });
        }
    };

    const handleUpdateBeats = (beats: Array<{ type: string, description: string }>, completed: number) => {
        setCurrentBeats(beats);
        setCompletedBeats(completed);
        if (selectedEvent) {
            onEntityUpdate(selectedEvent.id, {
                properties: {
                    ...selectedEvent.properties,
                    scene_beats: beats,
                    completed_beats: completed
                }
            });
        }
    };

    const handleEditBeat = (index: number, newDescription: string) => {
        const updated = [...currentBeats];
        updated[index].description = newDescription;
        setCurrentBeats(updated);
        // We defer saving to the parent until they generate prose to avoid too many saves
    };

    const handleGeneratePlan = async () => {
        if (!selectedEvent) return;
        setIsPlanning(true);
        setWriteError(null);

        try {
            // 1. Ensure we have a Scene Card first
            let currentCard = sceneCard;
            if (!currentCard) {
                const connectedIds = relationships
                    .filter((r: Relationship) => r.from_entity_id === selectedEvent.id || r.to_entity_id === selectedEvent.id)
                    .map((r: Relationship) => r.from_entity_id === selectedEvent.id ? r.to_entity_id : r.from_entity_id);

                const reqChars = characters.filter((c: Entity) => connectedIds.includes(c.id))
                    .map((c: Entity) => ({ name: c.name, description: c.description || '' }));
                const reqLocs = locations.filter((l: Entity) => connectedIds.includes(l.id))
                    .map((l: Entity) => ({ name: l.name, description: l.description || '' }));
                const reqThemes = themes.filter((t: Entity) => connectedIds.includes(t.id))
                    .map((t: Entity) => ({ name: t.name, description: t.description || '' }));

                const scResult = await generateSceneCard({
                    eventName: selectedEvent.name,
                    eventDescription: selectedEvent.description || '',
                    connectedCharacters: reqChars,
                    connectedLocations: reqLocs,
                    connectedThemes: reqThemes,
                    projectContext
                });
                currentCard = scResult.sceneCard;

                onEntityUpdate(selectedEvent.id, {
                    properties: { ...selectedEvent.properties, scene_card: currentCard }
                });
            }

            // 2. Generate Beats
            const beats = await suggestBeats({
                entityName: selectedEvent.name,
                entityDescription: `${selectedEvent.description || ''}\n\nScene Plan:\nPOV: ${currentCard.pov}\nGoal: ${currentCard.goal}\nConflict: ${currentCard.conflict}`,
                projectContext
            }, undefined, contextReport || undefined);

            handleUpdateBeats(beats, 0);

        } catch (err) {
            setWriteError(err instanceof Error ? err.message : 'Planning failed');
        } finally {
            setIsPlanning(false);
        }
    };

    const handleWriteNextBeat = async () => {
        if (!selectedEvent || currentBeats.length === 0 || completedBeats >= currentBeats.length) return;

        setIsWriting(true);
        setWriteError(null);
        setDraftCritiques([]);

        try {
            const beat = currentBeats[completedBeats];
            const stylePrompt = `Tone: ${options.tone}\nPOV: ${options.pov}\nTense: ${options.tense}\nEmotional Intensity: ${options.emotionalIntensity}`;

            const beatProse = await generateBeatProse({
                beat,
                context: {
                    entityName: selectedEvent.name,
                    entityDescription: sceneCard ? JSON.stringify(sceneCard) : (selectedEvent.description || ''),
                    previousProse: draftText.slice(-2000),
                    projectContext: `${projectContext}\n\nStyle Guide:\n${stylePrompt}`
                },
                contextReport: contextReport || undefined
            });

            const newText = draftText ? draftText + '\n\n' + beatProse : beatProse;
            handleSaveDraft(newText);
            handleUpdateBeats(currentBeats, completedBeats + 1);

            // Run Self-Reflection Critique
            setIsCritiquing(true);
            try {
                const critiques = await analyzeDraftProse(beatProse, beat.description);
                setDraftCritiques(critiques);
            } catch (err) {
                console.warn("Failed to critique draft", err);
            } finally {
                setIsCritiquing(false);
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
            const reqEvents = events.map((e: Entity) => ({
                id: e.id,
                name: e.name,
                description: e.description || '',
                charactersInvolved: characters.filter((c: Entity) =>
                    relationships.some((r: Relationship) =>
                        (r.from_entity_id === e.id && r.to_entity_id === c.id) ||
                        (r.from_entity_id === c.id && r.to_entity_id === e.id)
                    )
                ).map((c: Entity) => c.name),
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
                    themes: themes.map((t: Entity) => ({ name: t.name, description: t.description || '' })),
                    relationships: relationships.map((r: Relationship) => ({
                        from: entities.find((e: Entity) => e.id === r.from_entity_id)?.name || '',
                        to: entities.find((e: Entity) => e.id === r.to_entity_id)?.name || '',
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
                        {events.reduce((acc: number, e: Entity) => acc + (((e.properties?.draft_prose as string) || '').trim().split(/\s+/).filter(Boolean).length), 0)} words total
                    </span>
                </div>
                <div className="event-list">
                    {events.map((e: Entity, idx: number) => {
                        const hasProse = !!e.properties?.draft_prose;
                        const proseWords = hasProse ? (e.properties!.draft_prose as string).trim().split(/\s+/).filter(Boolean).length : 0;
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

                        {currentBeats.length > 0 && (
                            <div className="beats-panel" style={{ padding: 'var(--space-2)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
                                <h4 style={{ margin: '0 0 var(--space-1) 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Scene Beats (Plan)</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {currentBeats.map((beat, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: '8px', alignItems: 'center',
                                            opacity: i < completedBeats ? 0.5 : 1
                                        }}>
                                            <span style={{ fontSize: '11px', color: 'var(--accent)', minWidth: '60px' }}>[{beat.type}]</span>
                                            {i >= completedBeats ? (
                                                <input
                                                    type="text"
                                                    value={beat.description}
                                                    onChange={(e) => handleEditBeat(i, e.target.value)}
                                                    style={{
                                                        flex: 1,
                                                        background: 'transparent',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '12px',
                                                        padding: '4px 6px',
                                                        borderRadius: 'var(--radius-sm)'
                                                    }}
                                                />
                                            ) : (
                                                <span style={{ fontSize: '12px', textDecoration: 'line-through', flex: 1 }}>{beat.description}</span>
                                            )}
                                            {i === completedBeats && <span className="badge" style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff' }}>Next</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="editor-container">
                            <textarea
                                className="draft-editor"
                                value={draftText}
                                onChange={(e) => handleSaveDraft(e.target.value)}
                                placeholder="Start writing, or click ✨ Outline Scene to generate a beat-by-beat plan..."
                            />
                        </div>

                        {liveDiagnostics && liveDiagnostics.wordCount > 50 && (
                            <div className="live-diagnostics" style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                {[liveDiagnostics.purpleProse, liveDiagnostics.senses, liveDiagnostics.monotony, liveDiagnostics.stasis, liveDiagnostics.overusedWords, liveDiagnostics.filterWords]
                                    .filter(Boolean)
                                    .map((diag: any, i) => (
                                        <div key={i} style={{
                                            padding: '8px 12px',
                                            background: diag.severity === 'critical' ? 'rgba(239,68,68,0.1)' : diag.severity === 'major' ? 'rgba(245,158,11,0.1)' : 'var(--bg-tertiary)',
                                            borderLeft: `3px solid ${diag.severity === 'critical' ? 'var(--error)' : diag.severity === 'major' ? '#f59e0b' : 'var(--text-tertiary)'}`,
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '11px',
                                            flex: '1 1 45%'
                                        }}>
                                            <strong style={{ display: 'block', marginBottom: '2px', color: diag.severity === 'critical' ? 'var(--error)' : diag.severity === 'major' ? '#f59e0b' : 'var(--text-primary)' }}>
                                                {diag.message}
                                            </strong>
                                            <span style={{ color: 'var(--text-secondary)' }}>{diag.fix}</span>
                                        </div>
                                    ))}
                            </div>
                        )}

                        {isCritiquing && (
                            <div className="critique-loading" style={{ margin: 'var(--space-2) 0', fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                🤖 AI is self-reflecting on the generated beat...
                            </div>
                        )}

                        {draftCritiques.length > 0 && (
                            <div className="draft-critiques" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '14px' }}>🧐</span> Targeted Revisions
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {draftCritiques.map((critique) => (
                                        <div key={critique.id} style={{
                                            padding: '8px 12px',
                                            background: 'var(--bg-primary)',
                                            borderLeft: `3px solid ${critique.severity === 'high' ? 'var(--error)' : critique.severity === 'medium' ? '#f59e0b' : 'var(--accent)'}`,
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '12px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                                    {critique.message}
                                                </strong>
                                                <span style={{ color: 'var(--text-secondary)' }}>{critique.suggestion}</span>
                                            </div>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: '10px', padding: '4px 8px' }}
                                                onClick={() => {
                                                    alert(`Auto-fix for "${critique.id}" coming soon. For now, try adding: "${critique.suggestion}" manually.`);
                                                }}
                                            >
                                                ✨ Apply Fix
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="cowrite-actions" style={{ marginTop: 'var(--space-3)' }}>
                            {currentBeats.length === 0 ? (
                                <button
                                    className={`cowrite-btn ${isPlanning ? 'loading' : ''}`}
                                    onClick={handleGeneratePlan}
                                    disabled={isPlanning}
                                >
                                    {isPlanning ? '🗓️ Planning...' : '🗓️ Outline Scene Beats'}
                                </button>
                            ) : completedBeats < currentBeats.length ? (
                                <button
                                    className={`cowrite-btn ${isWriting ? 'loading' : ''}`}
                                    onClick={handleWriteNextBeat}
                                    disabled={isWriting}
                                    style={{ background: 'var(--success)' }}
                                >
                                    {isWriting ? '✍️ Writing...' : `✨ Co-Write Beat ${completedBeats + 1}`}
                                </button>
                            ) : (
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleUpdateBeats([], 0)}
                                >
                                    🔄 Reset Scene Plan
                                </button>
                            )}
                            {writeError && <span className="error-text">{writeError}</span>}
                        </div>

                        {/* V3: Context Inspector Preview */}
                        {contextReport && (
                            <div className="context-inspector" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowContextInspector(!showContextInspector)}>
                                    <h4 style={{ margin: 0, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        📋 AI Context Report
                                        <span className="badge" style={{ background: contextReport.estimatedTokens > 80000 ? 'var(--error)' : 'var(--accent)' }}>
                                            ~{contextReport.estimatedTokens.toLocaleString()} tokens
                                        </span>
                                    </h4>
                                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{showContextInspector ? '▼ Hide' : '▶ Expand'}</span>
                                </div>

                                {showContextInspector && (
                                    <div style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        <p style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}><strong>Included Entities ({contextReport.includedEntities.length}):</strong></p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>✓ {contextReport.breakdown.characters} characters</div>
                                            <div>✓ {contextReport.breakdown.locations} locations</div>
                                            <div>✓ {contextReport.breakdown.timelines} timelines</div>
                                            <div>✓ {contextReport.breakdown.events} events</div>
                                            <div>✓ {contextReport.breakdown.themes} themes</div>
                                            <div>✓ {contextReport.breakdown.concepts} concepts</div>
                                        </div>
                                        <p style={{ margin: '12px 0 0 0', fontStyle: 'italic' }}>Excluded {contextReport.excludedEntities.length} irrelevant entities to save tokens.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* RIGHT SIDEBAR: Settings & Health */}
            <div className="cowrite-settings">
                <div className="settings-section">
                    <h3>Context Engine Settings</h3>

                    <label>
                        <span>Causal Chain Depth (hops)</span>
                        <select
                            value={contextSettings.causalChainDepth}
                            onChange={e => setContextSettings({ ...contextSettings, causalChainDepth: parseInt(e.target.value) })}
                        >
                            <option value={1}>1 hop (Strict)</option>
                            <option value={2}>2 hops (Recommended)</option>
                            <option value={3}>3+ hops (Broad)</option>
                        </select>
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                        <input
                            type="checkbox"
                            checked={contextSettings.includeScientificConcepts}
                            onChange={e => setContextSettings({ ...contextSettings, includeScientificConcepts: e.target.checked })}
                        />
                        <span>Include Scientific Concepts</span>
                    </label>
                </div>

                <div className="settings-section">
                    <h3>Co-Author Style Settings</h3>

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
