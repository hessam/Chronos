import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { Project } from '../store/appStore';

export default function ProjectsPage() {
    const navigate = useNavigate();
    const signOut = useAuthStore((s) => s.signOut);
    const user = useAuthStore((s) => s.user);
    const queryClient = useQueryClient();

    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    // Fetch projects
    const { data, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => api.getProjects(),
    });

    // Create project
    const createMutation = useMutation({
        mutationFn: (body: { name: string; description: string }) =>
            api.createProject(body),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setShowCreate(false);
            setName('');
            setDescription('');
            navigate(`/project/${data.project.id}`);
        },
        onError: (err: Error) => setError(err.message),
    });

    // Delete project
    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.deleteProject(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });

    function handleCreate(e: FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        createMutation.mutate({ name: name.trim(), description: description.trim() });
    }

    const projects = data?.projects || [];

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--space-4)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div>
                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>Your Projects</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)', marginTop: 'var(--space-1)' }}>
                        {user?.user_metadata?.name ? `Welcome, ${user.user_metadata.name}` : 'Welcome back'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Project</button>
                    <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
                </div>
            </div>

            {/* Create Project Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Create New Project</h2>
                        {error && <p className="error-text" style={{ marginBottom: 'var(--space-2)' }}>{error}</p>}
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label className="label">Project Name</label>
                                <input
                                    className="input"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="My Sci-Fi Epic"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Description (optional)</label>
                                <textarea
                                    className="textarea"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="A multi-timeline saga about..."
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Projects Grid */}
            {isLoading ? (
                <div className="loading-center" style={{ height: 300 }}>
                    <div className="spinner" />
                </div>
            ) : projects.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📚</div>
                    <p className="empty-state-title">No projects yet</p>
                    <p style={{ marginBottom: 'var(--space-2)' }}>Create your first narrative project to get started.</p>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create First Project</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-2)' }}>
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            className="card card-clickable"
                            onClick={() => navigate(`/project/${project.id}`)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{project.name}</h3>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete "${project.name}"? This is irreversible.`)) {
                                            deleteMutation.mutate(project.id);
                                        }
                                    }}
                                    title="Delete project"
                                >
                                    🗑
                                </button>
                            </div>
                            {project.description && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {project.description}
                                </p>
                            )}
                            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                                Updated {new Date(project.updated_at).toLocaleDateString()}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
