import { create } from 'zustand';

export interface Project {
    id: string;
    name: string;
    description: string;
    settings: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Entity {
    id: string;
    project_id: string;
    entity_type: 'character' | 'timeline' | 'event' | 'arc' | 'theme' | 'location' | 'note';
    name: string;
    description: string;
    properties: Record<string, unknown>;
    position_x: number;
    position_y: number;
    color: string | null;
    created_at: string;
    updated_at: string;
}

export interface Relationship {
    id: string;
    project_id: string;
    from_entity_id: string;
    to_entity_id: string;
    relationship_type: string;
    label: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

interface AppState {
    // Current project
    currentProject: Project | null;
    setCurrentProject: (project: Project | null) => void;

    // Selected entity
    selectedEntity: Entity | null;
    setSelectedEntity: (entity: Entity | null) => void;

    // Entity filter
    entityFilter: Entity['entity_type'] | 'all';
    setEntityFilter: (filter: Entity['entity_type'] | 'all') => void;

    // Context panel
    contextPanelOpen: boolean;
    toggleContextPanel: () => void;
    setContextPanelOpen: (open: boolean) => void;

    // Sidebar
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    currentProject: null,
    setCurrentProject: (project) => set({ currentProject: project }),

    selectedEntity: null,
    setSelectedEntity: (entity) => set({
        selectedEntity: entity,
        contextPanelOpen: !!entity,
    }),

    entityFilter: 'all',
    setEntityFilter: (filter) => set({ entityFilter: filter }),

    contextPanelOpen: false,
    toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),
    setContextPanelOpen: (open) => set({ contextPanelOpen: open }),

    sidebarCollapsed: false,
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
