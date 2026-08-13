import { SceneNode } from '../app'

interface OutlinerProps {
  nodes: SceneNode[]
  selectedId: number
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}

function getNodeIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'cube': return '□';
    case 'sphere': return '○';
    case 'plane': return '▬';
    case 'torus': return '◎';
    default: return '◇';
  }
}

export function Outliner({ nodes, selectedId, onSelect, onDelete }: OutlinerProps) {
  
  const renderNode = (node: SceneNode, depth: number) => {
    return (
      <div key={node.id}>
        <div 
          className={`node-row ${node.id === selectedId ? 'selected' : ''}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onSelect(node.id)}
        >
          <div className="node-icon">{getNodeIcon(node.type)}</div>
          <div className="node-name">{node.name}</div>
          <button 
            className="node-delete" 
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            title="Delete node"
          >
            ×
          </button>
        </div>
        {node.children && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }
  
  return (
    <div className="editor-panel editor-outliner">
      <div className="panel-header">
        <span>Scene</span>
        <span style={{ color: 'var(--text-muted)' }}>{nodes.length}</span>
      </div>
      <div className="panel-content">
        {nodes.map(node => renderNode(node, 0))}
      </div>
    </div>
  )
}
