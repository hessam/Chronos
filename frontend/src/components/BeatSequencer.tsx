import React, { useState, useEffect } from 'react';
import { Beat, Entity } from '../store/appStore';
import { generateBeatProse, suggestBeats, checkBeatConsistency } from '../services/aiService';

interface BeatSequencerProps {
    entity: Entity;
    projectDescription: string;
    onUpdate: (updates: Partial<Entity>) => void;
}

export const BeatSequencer: React.FC<BeatSequencerProps> = ({ entity, projectDescription, onUpdate }) => {
    // Local state for beats (not saved to DB until explicitly requested)
    const [beats, setBeats] = useState<Beat[]>((entity.properties.beats as Beat[]) || []);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Loading states
    const [isGeneratingProse, setIsGeneratingProse] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    // Data & Errors
    const [error, setError] = useState<string | null>(null);
    const [consistencyReport, setConsistencyReport] = useState<string | null>(null);


    // Sync from props only if no unsaved changes (or initial load)
    useEffect(() => {
        if (!hasUnsavedChanges) {
            setBeats((entity.properties.beats as Beat[]) || []);
        }
    }, [entity.id, entity.properties.beats]);

    const handleSave = () => {
        onUpdate({
            properties: {
                ...entity.properties,
                beats: beats
            }
        });
        setHasUnsavedChanges(false);
    };

    const updateBeatsLocal = (newBeats: Beat[]) => {
        setBeats(newBeats);
        setHasUnsavedChanges(true);
    };

    const addBeat = () => {
        const newBeat: Beat = {
            id: crypto.randomUUID(),
            type: 'action',
            description: '',
            status: 'draft',
            prose: ''
        };
        updateBeatsLocal([...beats, newBeat]);
    };

    const updateBeat = (id: string, updates: Partial<Beat>) => {
        updateBeatsLocal(beats.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const deleteBeat = (id: string) => {
        updateBeatsLocal(beats.filter(b => b.id !== id));
    };

    const moveBeat = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === beats.length - 1) return;

        const newBeats = [...beats];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newBeats[index], newBeats[targetIndex]] = [newBeats[targetIndex], newBeats[index]];
        updateBeatsLocal(newBeats);
    };

    const handleSuggestBeats = async () => {
        setIsSuggesting(true);
        setError(null);
        try {
            const suggestions = await suggestBeats({
                entityName: entity.name,
                entityDescription: entity.description,
                projectContext: projectDescription
            });

            const newBeats: Beat[] = suggestions.map(s => ({
                id: crypto.randomUUID(),
                type: s.type as Beat['type'],
                description: s.description,
                status: 'draft',
                prose: ''
            }));

            // Append or replace? Let's append if beats exist, or we could verify.
            // For now, appending is safer.
            updateBeatsLocal([...beats, ...newBeats]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to suggest beats');
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleCheckConsistency = async () => {
        setIsChecking(true);
        setConsistencyReport(null);
        try {
            const report = await checkBeatConsistency(beats, {
                entityName: entity.name,
                entityDescription: entity.description
            });
            setConsistencyReport(report);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Consistency check failed');
        } finally {
            setIsChecking(false);
        }
    };

    const handleGenerateProse = async (beat: Beat, index: number) => {
        setIsGeneratingProse(beat.id);
        setError(null);

        const previousContext = beats
            .slice(Math.max(0, index - 3), index)
            .map(b => b.prose || b.description)
            .join('\n\n');

        try {
            const prose = await generateBeatProse({
                beat: { description: beat.description, type: beat.type },
                context: {
                    entityName: entity.name,
                    entityDescription: entity.description,
                    projectContext: projectDescription,
                    previousProse: previousContext
                }
            });

            updateBeat(beat.id, { prose, status: 'revised' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
        } finally {
            setIsGeneratingProse(null);
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full relative">
            {/* Top Controls */}
            <div className="flex justify-between items-center bg-base-100 p-2 rounded-box shadow-sm border border-base-200">
                <div className="flex gap-2">
                    <button
                        onClick={handleSuggestBeats}
                        disabled={isSuggesting}
                        className="btn btn-sm btn-secondary"
                    >
                        {isSuggesting ? 'Thinking...' : '✨ Suggest Beats'}
                    </button>
                    <button
                        onClick={handleCheckConsistency}
                        disabled={isChecking || beats.length === 0}
                        className="btn btn-sm btn-ghost"
                    >
                        {isChecking ? 'Checking...' : '🔍 Check Details'}
                    </button>
                </div>
                <div className="flex gap-2 items-center">
                    {hasUnsavedChanges && <span className="text-xs text-warning animate-pulse">Unsaved changes</span>}
                    <button
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges}
                        className="btn btn-sm btn-primary"
                    >
                        Save Changes
                    </button>
                </div>
            </div>

            {error && <div className="alert alert-error text-sm py-2">{error}</div>}

            {consistencyReport && (
                <div className="alert alert-info text-sm py-2 flex flex-col items-start gap-1">
                    <div className="font-bold flex justify-between w-full">
                        <span>Consistency Report</span>
                        <button onClick={() => setConsistencyReport(null)} className="btn btn-xs btn-ghost">✕</button>
                    </div>
                    <p className="whitespace-pre-wrap">{consistencyReport}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-20">
                {beats.length === 0 && (
                    <div className="text-base-content/50 text-center py-12 flex flex-col gap-2 justify-center items-center h-full border-2 border-dashed border-base-300 rounded-box m-4">
                        <p className="text-lg font-medium">No beats defined</p>
                        <p className="text-sm">Click "Suggest Beats" to let AI draft an outline, or add manually.</p>
                        <button onClick={addBeat} className="btn btn-outline btn-sm mt-2">+ Add Start Beat</button>
                    </div>
                )}

                {beats.map((beat, index) => (
                    <div key={beat.id} className="card bg-base-200 p-3 shadow-sm border border-base-300 group hover:border-primary/30 transition-colors">
                        {/* Header: Type, Drag, Delete */}
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono opacity-50 w-6 text-right">#{index + 1}</span>
                                <div className="flex flex-col">
                                    <button
                                        onClick={() => moveBeat(index, 'up')}
                                        disabled={index === 0}
                                        className="btn btn-xs btn-ghost p-0 h-4 min-h-0 disabled:opacity-20 hover:text-primary"
                                    >▲</button>
                                    <button
                                        onClick={() => moveBeat(index, 'down')}
                                        disabled={index === beats.length - 1}
                                        className="btn btn-xs btn-ghost p-0 h-4 min-h-0 disabled:opacity-20 hover:text-primary"
                                    >▼</button>
                                </div>
                                <select
                                    value={beat.type}
                                    onChange={(e) => updateBeat(beat.id, { type: e.target.value as Beat['type'] })}
                                    className="select select-bordered select-xs"
                                >
                                    <option value="action">Action</option>
                                    <option value="dialogue">Dialogue</option>
                                    <option value="internal">Internal Thought</option>
                                    <option value="description">Description</option>
                                    <option value="emotion">Emotion</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => addBeat()} className="btn btn-xs btn-ghost" title="Insert beat below">+</button>
                                <button onClick={() => deleteBeat(beat.id)} className="btn btn-xs btn-ghost text-error" title="Delete beat">✕</button>
                            </div>
                        </div>

                        {/* Description Input */}
                        <textarea
                            value={beat.description}
                            onChange={(e) => updateBeat(beat.id, { description: e.target.value })}
                            placeholder="Describe what happens in this beat..."
                            className="textarea textarea-bordered w-full mb-2 text-sm focus:border-primary"
                            rows={2}
                        />

                        {/* AI & Prose Section */}
                        <div className={`collapse collapse-arrow border border-base-300 bg-base-100 rounded-box ${beat.prose ? 'border-l-4 border-l-secondary' : ''}`}>
                            <input type="checkbox" defaultChecked={false} />
                            <div className="collapse-title text-sm font-medium flex justify-between items-center pr-12">
                                <span className={beat.prose ? 'text-secondary' : 'text-base-content/70'}>
                                    {beat.prose ? 'Prose Generated' : 'Draft Prose'}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleGenerateProse(beat, index);
                                    }}
                                    className="btn btn-xs btn-secondary btn-outline z-10"
                                    disabled={isGeneratingProse === beat.id || !beat.description.trim()}
                                >
                                    {isGeneratingProse === beat.id ? 'Writing...' : '✨ Auto-Write'}
                                </button>
                            </div>
                            <div className="collapse-content">
                                <textarea
                                    value={beat.prose || ''}
                                    onChange={(e) => updateBeat(beat.id, { prose: e.target.value })}
                                    placeholder="AI generated prose will appear here..."
                                    className="textarea textarea-ghost w-full text-sm leading-relaxed font-serif"
                                    rows={4}
                                />
                            </div>
                        </div>
                    </div>
                ))}

                {/* Bottom Add Button */}
                {beats.length > 0 && (
                    <button onClick={addBeat} className="btn btn-ghost btn-sm w-full border-dashed border-2 border-base-300">
                        + Add Beat
                    </button>
                )}
            </div>
        </div>
    );
};
