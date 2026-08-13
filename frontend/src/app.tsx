import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { Toolbar } from './components/Toolbar'
import { Outliner } from './components/Outliner'
import { Inspector } from './components/Inspector'
import './app.css'

export interface SceneNode {
  id: number
  name: string
  type: string
  children: SceneNode[]
}

export interface Transform {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export function App() {
  const engineRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [selectedId, setSelectedId] = useState(-1)
  const [gizmoMode, setGizmoMode] = useState(1)
  const [hierarchy, setHierarchy] = useState<SceneNode[]>([])
  const [transform, setTransform] = useState<Transform | null>(null)
  const selectedIdRef = useRef(-1)
  
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    let cancelled = false
    
    async function init() {
      if (!navigator.gpu) {
        console.error('WebGPU not supported')
        return
      }
      if (typeof window.Module !== 'function') {
        console.error('engine.js not loaded')
        return
      }
      
      const moduleInstance = await window.Module()
      if (cancelled) return
      engineRef.current = moduleInstance
      
      const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement
      if (!canvas) return
      
      const dpr = window.devicePixelRatio || 1
      const width = Math.floor(window.innerWidth * dpr)
      const height = Math.floor(window.innerHeight * dpr)
      canvas.width = width
      canvas.height = height
      moduleInstance.init_renderer(width, height)
      
      window.addEventListener('resize', () => {
        const w = Math.floor(window.innerWidth * dpr);
        const h = Math.floor(window.innerHeight * dpr);
        canvas.width = w;
        canvas.height = h;
        moduleInstance.resize_renderer(w, h);
      });
      
      window.addEventListener('keydown', (e) => {
        if (document.activeElement?.tagName === 'INPUT') return;
        if (e.key === '1') { moduleInstance.set_gizmo_mode(1); setGizmoMode(1); }
        if (e.key === '2') { moduleInstance.set_gizmo_mode(2); setGizmoMode(2); }
        if (e.key === '3') { moduleInstance.set_gizmo_mode(3); setGizmoMode(3); }
      });
      
      let isDragging = false;
      let lastX = 0;
      let lastY = 0;
      let lastDownX = 0;
      let lastDownY = 0;
      let selectedAxis = -1;

      canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        lastDownX = e.clientX;
        lastDownY = e.clientY;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        selectedAxis = moduleInstance.select_axis_at(x, y, rect.width, rect.height);
      });

      window.addEventListener('mouseup', (e) => {
        isDragging = false;
        selectedAxis = -1;
      });

      canvas.addEventListener('click', (e) => {
        if (Math.abs(e.clientX - lastDownX) < 5 && Math.abs(e.clientY - lastDownY) < 5 && selectedAxis === -1) {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          moduleInstance.select_object_at(x, y, rect.width, rect.height);
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        if (selectedAxis !== -1) {
            moduleInstance.drag_selected(dx, dy, selectedAxis);
        } else {
            if (e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) {
                moduleInstance.pan_camera(dx * 0.01, dy * 0.01);
            } else if (e.buttons === 1) {
                moduleInstance.orbit_camera(dx * 0.01, dy * 0.01);
            }
        }
      });

      canvas.addEventListener('wheel', (e) => {
          moduleInstance.zoom_camera(e.deltaY * 0.01);
          e.preventDefault();
      }, { passive: false });
      
      setReady(true)
      
      try {
        const h = JSON.parse(moduleInstance.get_scene_hierarchy())
        setHierarchy(h)
      } catch(e) { console.warn('get_scene_hierarchy not available yet') }
      
      function frame() {
        if (cancelled) return
        moduleInstance.render_frame()
        
        try {
          const id = moduleInstance.get_selected_node_id()
          setSelectedId(prev => prev !== id ? id : prev)
          
          if (id >= 0) {
            const t = JSON.parse(moduleInstance.get_node_transform(id))
            setTransform(t)
          } else {
            setTransform(prev => prev !== null ? null : prev)
          }
          
          const mode = moduleInstance.get_gizmo_mode()
          setGizmoMode(prev => prev !== mode ? mode : prev)
        } catch(e) { }
        
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }
    
    init().catch(console.error)
    return () => { cancelled = true }
  }, [])
  
  const handleSelectNode = useCallback((id: number) => {
    try { engineRef.current?.select_node_by_id(id) } catch(e) {}
  }, [])
  
  const handleSetGizmoMode = useCallback((mode: number) => {
    try {
      engineRef.current?.set_gizmo_mode(mode)
      setGizmoMode(mode)
    } catch(e) {}
  }, [])
  
  const handleTransformChange = useCallback((property: string, axis: string, value: number) => {
    const engine = engineRef.current
    if (!engine) return
    const id = selectedIdRef.current
    if (id < 0) return

    try {
      if (property === 'position') {
        engine.set_node_position(id, axis === 'x' ? value : transform?.position.x || 0, axis === 'y' ? value : transform?.position.y || 0, axis === 'z' ? value : transform?.position.z || 0)
      } else if (property === 'rotation') {
        engine.set_node_rotation_euler(id, axis === 'x' ? value : transform?.rotation.x || 0, axis === 'y' ? value : transform?.rotation.y || 0, axis === 'z' ? value : transform?.rotation.z || 0)
      } else if (property === 'scale') {
        engine.set_node_scale(id, axis === 'x' ? value : transform?.scale.x || 1, axis === 'y' ? value : transform?.scale.y || 1, axis === 'z' ? value : transform?.scale.z || 1)
      }
    } catch (e) {
      console.warn("Transform setting not yet fully implemented in engine interop", e)
    }
  }, [transform])
  
  const handleAddPrimitive = useCallback((type: string) => {
    try {
      engineRef.current?.add_primitive_node(type)
      const h = JSON.parse(engineRef.current.get_scene_hierarchy())
      setHierarchy(h)
    } catch(e) {}
  }, [])
  
  const handleDeleteNode = useCallback((id: number) => {
    try {
      engineRef.current?.delete_node_by_id(id)
      const h = JSON.parse(engineRef.current.get_scene_hierarchy())
      setHierarchy(h)
    } catch(e) {}
  }, [])
  
  return (
    <>
      <canvas id="gpuCanvas" style={{
        display: 'block', width: '100vw', height: '100vh',
        position: 'absolute', top: 0, left: 0, outline: 'none'
      }} />
      {ready && (
        <>
          <Toolbar gizmoMode={gizmoMode} onModeChange={handleSetGizmoMode} onAddPrimitive={handleAddPrimitive} />
          <div className="editor-sidebar">
            <Outliner nodes={hierarchy} selectedId={selectedId} onSelect={handleSelectNode} onDelete={handleDeleteNode} />
            <Inspector selectedId={selectedId} transform={transform} hierarchy={hierarchy} onTransformChange={handleTransformChange} />
          </div>
        </>
      )}
    </>
  )
}
