import { useState, useRef, useEffect } from 'preact/hooks'

interface ToolbarProps {
  gizmoMode: number  // 1=Move, 2=Rotate, 3=Scale
  onModeChange: (mode: number) => void
  onAddPrimitive: (type: string) => void
}

export function Toolbar({ gizmoMode, onModeChange, onAddPrimitive }: ToolbarProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (addContainerRef.current && !addContainerRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [addMenuOpen])

  return (
    <div className="editor-panel editor-toolbar">
      <button 
        className={`tool-btn-square ${gizmoMode === 1 ? 'active' : ''}`} 
        onClick={() => onModeChange(1)}
        title="Move (1)"
      >
        <span className="tool-shortcut">1</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5 9 2 12 5 15"></polyline>
          <polyline points="9 5 12 2 15 5"></polyline>
          <polyline points="19 9 22 12 19 15"></polyline>
          <polyline points="9 19 12 22 15 19"></polyline>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="12" y1="2" x2="12" y2="22"></line>
        </svg>
      </button>
      <button 
        className={`tool-btn-square ${gizmoMode === 2 ? 'active' : ''}`} 
        onClick={() => onModeChange(2)}
        title="Rotate (2)"
      >
        <span className="tool-shortcut">2</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
      </button>
      <button 
        className={`tool-btn-square ${gizmoMode === 3 ? 'active' : ''}`} 
        onClick={() => onModeChange(3)}
        title="Scale (3)"
      >
        <span className="tool-shortcut">3</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="12" y1="3" x2="12" y2="21"></line>
        </svg>
      </button>
      
      <div className="toolbar-separator" />
      
      <div className="add-menu-container" ref={addContainerRef}>
        <button
          className="tool-btn-square" 
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          title="Add primitive"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        {addMenuOpen && (
          <div className="add-menu">
            <button className="add-menu-item" onClick={() => { onAddPrimitive('Cube'); setAddMenuOpen(false); }}>
              Cube
            </button>
            <button className="add-menu-item" onClick={() => { onAddPrimitive('Sphere'); setAddMenuOpen(false); }}>
              Sphere
            </button>
            <button className="add-menu-item" onClick={() => { onAddPrimitive('Plane'); setAddMenuOpen(false); }}>
              Plane
            </button>
            <button className="add-menu-item" onClick={() => { onAddPrimitive('Torus'); setAddMenuOpen(false); }}>
              Torus
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
