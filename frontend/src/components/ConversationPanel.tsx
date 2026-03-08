/**
 * ConversationPanel (Ticket B-08)
 * Persistent AI conversation history panel.
 * - Lists past conversation threads for the project
 * - Supports creating new conversations and resuming old ones
 * - Sends user messages to the AI and persists the full thread
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { callProvider, loadAISettings } from '../services/aiService';
import type { ConversationMessage, Entity } from '../store/appStore';

interface ConversationPanelProps {
    projectId: string;
    projectName: string;
    /** Optional entity context — pre-fills the conversation with entity context */
    contextEntity?: Entity | null;
    allEntities?: Entity[];
}

export default function ConversationPanel({
    projectId,
    projectName,
    contextEntity,
    allEntities = [],
}: ConversationPanelProps) {
    const queryClient = useQueryClient();
    const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isResponding, setIsResponding] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch conversations
    const { data: convosData } = useQuery({
        queryKey: ['conversations', projectId],
        queryFn: () => api.getConversations(projectId),
        enabled: !!projectId,
    });
    const conversations = convosData?.conversations || [];
    const activeConvo = conversations.find(c => c.id === activeConvoId) || null;

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConvo?.messages]);

    // Create conversation
    const createConvo = useMutation({
        mutationFn: (body: { title?: string; context_entity_id?: string | null }) =>
            api.createConversation(projectId, {
                ...body,
                messages: body.context_entity_id
                    ? [{
                        role: 'system' as const,
                        content: `Context: Discussing entity "${allEntities.find(e => e.id === body.context_entity_id)?.name || 'an entity'}" in project "${projectName}".`,
                        timestamp: new Date().toISOString(),
                    }]
                    : [],
            }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['conversations', projectId] });
            setActiveConvoId(data.conversation.id);
            setShowHistory(false);
        },
    });

    // Update conversation (append messages)
    const updateConvo = useMutation({
        mutationFn: (body: { id: string; messages: ConversationMessage[]; title?: string }) =>
            api.updateConversation(body.id, { messages: body.messages, ...(body.title ? { title: body.title } : {}) }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', projectId] });
        },
    });

    // Delete conversation
    const deleteConvo = useMutation({
        mutationFn: (id: string) => api.deleteConversation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations', projectId] });
            if (activeConvoId) setActiveConvoId(null);
        },
    });

    const handleNewConversation = () => {
        createConvo.mutate({
            title: contextEntity ? `About: ${contextEntity.name}` : 'New Conversation',
            context_entity_id: contextEntity?.id || null,
        });
    };

    const handleSend = useCallback(async () => {
        if (!input.trim() || !activeConvo) return;

        const userMessage: ConversationMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...activeConvo.messages, userMessage];

        // Optimistically update + save
        updateConvo.mutate({
            id: activeConvo.id,
            messages: updatedMessages,
            // Auto-title from first user message
            ...(activeConvo.messages.filter(m => m.role === 'user').length === 0
                ? { title: input.trim().slice(0, 60) }
                : {}),
        });

        setInput('');
        setIsResponding(true);

        try {
            const aiSettings = loadAISettings();
            const apiKey = aiSettings.apiKeys[aiSettings.defaultProvider];
            if (!apiKey) throw new Error('No API key configured');

            // Build system prompt with project context
            const entitySummary = allEntities.slice(0, 15).map(e =>
                `- ${e.entity_type}: "${e.name}" — ${(e.description || '').slice(0, 80)}`
            ).join('\n');

            // Build full prompt from conversation history (last 20 messages)
            const recentMessages = updatedMessages
                .filter(m => m.role !== 'system')
                .slice(-20);

            let fullPrompt = `You are a creative writing assistant for the project "${projectName}". Here are some key entities in this story:\n${entitySummary}\n\nHelp the writer with brainstorming, plot development, character arcs, worldbuilding, and any creative questions. Be specific and reference their story elements by name.\n\n--- CONVERSATION HISTORY ---\n`;

            for (const msg of recentMessages) {
                fullPrompt += `\n${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
            }
            fullPrompt += '\nAssistant:';

            const response = await callProvider(
                aiSettings.defaultProvider,
                aiSettings.defaultModel,
                fullPrompt,
                apiKey
            );

            const assistantMessage: ConversationMessage = {
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString(),
            };

            updateConvo.mutate({
                id: activeConvo.id,
                messages: [...updatedMessages, assistantMessage],
            });
        } catch (err) {
            const errorMessage: ConversationMessage = {
                role: 'assistant',
                content: `⚠️ Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
                timestamp: new Date().toISOString(),
            };
            updateConvo.mutate({
                id: activeConvo.id,
                messages: [...updatedMessages, errorMessage],
            });
        } finally {
            setIsResponding(false);
        }
    }, [input, activeConvo, projectName, allEntities, updateConvo]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)', overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-primary)',
            }}>
                <span style={{ fontSize: 16 }}>💬</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, flex: 1 }}>
                    {activeConvo ? activeConvo.title : 'AI Co-Author'}
                </span>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowHistory(!showHistory)}
                    title="Thread History"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                >
                    📋 {conversations.length}
                </button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleNewConversation}
                    disabled={createConvo.isPending}
                    title="New Thread"
                    style={{ fontSize: 14, padding: '2px 8px' }}
                >
                    +
                </button>
            </div>

            {/* Thread History Dropdown */}
            {showHistory && (
                <div style={{
                    maxHeight: 200, overflowY: 'auto',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                }}>
                    {conversations.length === 0 ? (
                        <div style={{
                            padding: 'var(--space-3)', textAlign: 'center',
                            color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                        }}>
                            No conversations yet. Click + to start one.
                        </div>
                    ) : (
                        conversations.map(convo => (
                            <div
                                key={convo.id}
                                style={{
                                    padding: '8px 14px',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: convo.id === activeConvoId ? 'var(--bg-tertiary)' : 'transparent',
                                    borderBottom: '1px solid var(--border)',
                                    transition: 'background 0.1s',
                                }}
                                onClick={() => { setActiveConvoId(convo.id); setShowHistory(false); }}
                            >
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{
                                        fontSize: 'var(--text-sm)', fontWeight: 500,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {convo.title}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                        {convo.messages.filter(m => m.role !== 'system').length} messages · {new Date(convo.updated_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={(e) => { e.stopPropagation(); deleteConvo.mutate(convo.id); }}
                                    style={{ fontSize: 11, padding: '0 4px', color: 'var(--text-tertiary)' }}
                                    title="Delete Thread"
                                >
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Messages Area */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: 'var(--space-2)',
                display: 'flex', flexDirection: 'column', gap: 8,
                minHeight: 200,
            }}>
                {!activeConvo ? (
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 12,
                        color: 'var(--text-tertiary)',
                    }}>
                        <span style={{ fontSize: 32 }}>💬</span>
                        <p style={{ fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 220 }}>
                            Start a conversation with your AI co-author about your story.
                        </p>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleNewConversation}
                            disabled={createConvo.isPending}
                        >
                            {createConvo.isPending ? 'Creating...' : '+ New Conversation'}
                        </button>
                    </div>
                ) : (
                    <>
                        {activeConvo.messages
                            .filter(m => m.role !== 'system')
                            .map((msg, i) => (
                                <div
                                    key={i}
                                    style={{
                                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                        maxWidth: '85%',
                                        padding: '8px 12px',
                                        borderRadius: msg.role === 'user'
                                            ? '12px 12px 4px 12px'
                                            : '12px 12px 12px 4px',
                                        background: msg.role === 'user'
                                            ? 'rgba(99,102,241,0.15)'
                                            : 'var(--bg-primary)',
                                        border: msg.role === 'user'
                                            ? '1px solid rgba(99,102,241,0.2)'
                                            : '1px solid var(--border)',
                                        fontSize: 'var(--text-sm)',
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {msg.content}
                                    <div style={{
                                        fontSize: 9, color: 'var(--text-tertiary)',
                                        marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left',
                                    }}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                        {isResponding && (
                            <div style={{
                                alignSelf: 'flex-start', padding: '8px 12px',
                                borderRadius: '12px 12px 12px 4px',
                                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                                Thinking...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input Area */}
            {activeConvo && (
                <div style={{
                    padding: '8px 10px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    display: 'flex', gap: 6, alignItems: 'flex-end',
                }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your story..."
                        rows={1}
                        style={{
                            flex: 1, resize: 'none',
                            fontSize: 'var(--text-sm)',
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontFamily: 'inherit',
                            minHeight: 32, maxHeight: 80,
                        }}
                    />
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSend}
                        disabled={isResponding || !input.trim()}
                        style={{ padding: '6px 12px', fontSize: 'var(--text-sm)' }}
                    >
                        {isResponding ? '...' : '→'}
                    </button>
                </div>
            )}
        </div>
    );
}
