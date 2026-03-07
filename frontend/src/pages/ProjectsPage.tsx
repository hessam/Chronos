import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ProjectWizard from '../components/ProjectWizard';


export default function ProjectsPage() {
    const navigate = useNavigate();
    const signOut = useAuthStore((s) => s.signOut);
    const user = useAuthStore((s) => s.user);
    const queryClient = useQueryClient();

    const [showCreate, setShowCreate] = useState(false);

    // Fetch projects
    const { data, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => api.getProjects(),
    });

    // Delete project
    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.deleteProject(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });

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

            {/* Project Setup Wizard */}
            {showCreate && <ProjectWizard onClose={() => setShowCreate(false)} />}

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
