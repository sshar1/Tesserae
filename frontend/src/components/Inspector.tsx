import type { Transform, SceneNode } from '../app'

interface InspectorProps {
  selectedId: number
  transform: Transform | null
  hierarchy: SceneNode[]
  onTransformChange: (property: string, axis: string, value: number) => void
}

function findNode(nodes: SceneNode[], id: number): SceneNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function Inspector({ selectedId, transform, hierarchy, onTransformChange }: InspectorProps) {
  
  if (selectedId < 0 || !transform) {
    return (
      <div className="editor-sidebar-panel editor-inspector">
        <div className="panel-header">Inspector</div>
        <div className="empty-state">
          Select an object to inspect its properties
        </div>
      </div>
    )
  }

  const selectedNode = findNode(hierarchy, selectedId);
  const nodeName = selectedNode ? selectedNode.name : `Node ${selectedId}`;
  const nodeType = selectedNode ? selectedNode.type : '';

  const renderTransformRow = (label: string, property: keyof Transform, step: number) => {
    const values = transform[property]
    return (
      <div className="transform-row">
        <div className="transform-label">{label}</div>
        <div className="transform-inputs">
          {['x', 'y', 'z'].map(axis => (
            <div className="transform-input-wrapper" key={axis}>
              <span className={`axis-label axis-${axis}`}>{axis.toUpperCase()}</span>
              <input 
                type="number"
                className="transform-input"
                step={step}
                value={(values as any)[axis].toFixed(label === 'Rotation' ? 1 : 3)}
                onInput={(e) => {
                  const v = parseFloat((e.target as HTMLInputElement).value)
                  if (!isNaN(v)) onTransformChange(property, axis, v)
                }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="editor-sidebar-panel editor-inspector">
      <div className="panel-header">Inspector</div>
      <div className="panel-content">
        <div className="inspector-node-name">
          {nodeName} 
          {nodeType && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 4px', borderRadius: '4px' }}>{nodeType}</span>}
        </div>
        
        <div className="section-header">TRANSFORM</div>
        <div className="transform-grid">
          {renderTransformRow('Position', 'position', 0.1)}
          {renderTransformRow('Rotation', 'rotation', 1.0)}
          {renderTransformRow('Scale', 'scale', 0.1)}
        </div>
      </div>
    </div>
  )
}
