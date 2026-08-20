import { useState } from 'preact/hooks'
import type { SceneNode } from '../app'
import type { PeerPresence } from '../net/types'

interface OutlinerProps {
  nodes: SceneNode[]
  selectedId: number
  peers?: PeerPresence[]
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}

export function Outliner({ nodes, selectedId, peers = [], onSelect, onDelete }: OutlinerProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  const toggleCollapse = (id: number, e: Event) => {
    e.stopPropagation();
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsedIds(next);
  };
  
  const flatList: { node: SceneNode, depth: number }[] = [];
  const flatten = (nList: SceneNode[], depth: number) => {
    nList.forEach(n => {
      flatList.push({ node: n, depth });
      if (n.children && n.children.length > 0 && !collapsedIds.has(n.id)) {
        flatten(n.children, depth + 1);
      }
    });
  };
  flatten(nodes, 0);
  
  return (
    <div className="editor-sidebar-panel editor-outliner">
      <div className="panel-header">
        <span>Scene</span>
      </div>
      <div className="panel-content" style={{ padding: 0, gap: 0 }}>
        {flatList.map((item, index) => {
          const { node, depth } = item;
          const isEven = index % 2 === 0;
          const hasChildren = node.children && node.children.length > 0;
          const isCollapsed = collapsedIds.has(node.id);
          return (
            <div 
              key={node.id}
              className={`node-row ${node.id === selectedId ? 'selected' : ''} ${isEven ? 'even' : 'odd'}`}
              style={{ paddingLeft: `${16 + depth * 14}px` }}
              onClick={() => onSelect(node.id)}
            >
              <div 
                className="node-toggle" 
                style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                onClick={(e) => toggleCollapse(node.id, e)}
              >
                {isCollapsed ? '▸' : '▾'}
              </div>
              <div className="node-name">{node.name}</div>
              {peers.filter(p => p.selectedNodeId === node.id).map(p => (
                <div
                  key={p.clientId}
                  className="peer-dot"
                  style={{ backgroundColor: p.color }}
                  title={`Selected by peer (${p.clientId.slice(0, 6)})`}
                />
              ))}
              <button 
                className="node-delete" 
                onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                title="Delete node"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
