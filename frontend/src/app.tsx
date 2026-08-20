import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { Toolbar } from './components/Toolbar'
import { Outliner } from './components/Outliner'
import { Inspector } from './components/Inspector'
import {
  CollaborationClient,
  createUpdateTransformOp,
  createInsertNodeOp,
  createDeleteNodeOp,
} from './net'
import type {
  PeerPresence,
  ConnectionStatus,
  NodeData,
  TransformProperty,
} from './net'
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
  const collabRef = useRef<CollaborationClient | null>(null)

  const [ready, setReady] = useState(false)
  const [selectedId, setSelectedId] = useState(-1)
  const [gizmoMode, setGizmoMode] = useState(1)
  const [hierarchy, setHierarchy] = useState<SceneNode[]>([])
  const [transform, setTransform] = useState<Transform | null>(null)
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected')
  const [peers, setPeers] = useState<PeerPresence[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const selectedIdRef = useRef(-1)
  const transformRef = useRef<Transform | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  const refreshHierarchy = useCallback(() => {
    if (!engineRef.current) return
    try {
      const h = JSON.parse(engineRef.current.get_scene_hierarchy())
      setHierarchy(h)
    } catch (e) {
      console.warn('Failed to parse scene hierarchy', e)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const searchParams = new URLSearchParams(window.location.search)
    const roomId = searchParams.get('room') || window.location.hash.replace('#', '') || 'default'

    const collab = new CollaborationClient({
      roomId,
      onStatusChange: (status) => setConnStatus(status),
      onPeersChange: (p) => setPeers(p),
      onHierarchyChange: () => refreshHierarchy(),
      onHistoryChange: () => {
        setCanUndo(collab.canUndo())
        setCanRedo(collab.canRedo())
      },
    })
    collabRef.current = collab

    async function init() {
      if (!navigator.gpu) {
        console.error('WebGPU not supported')
        return
      }
      if (typeof (window as any).Module !== 'function') {
        console.error('engine.js not loaded')
        return
      }

      const moduleInstance = await (window as any).Module()
      if (cancelled) return
      engineRef.current = moduleInstance

      collab.setEngine(moduleInstance)

      const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement
      if (!canvas) return

      const dpr = window.devicePixelRatio || 1
      const width = Math.floor(window.innerWidth * dpr)
      const height = Math.floor(window.innerHeight * dpr)
      canvas.width = width
      canvas.height = height
      moduleInstance.init_renderer(width, height)

      // Connect to multiplayer collaboration server
      collab.connect()

      window.addEventListener('resize', () => {
        const w = Math.floor(window.innerWidth * dpr)
        const h = Math.floor(window.innerHeight * dpr)
        canvas.width = w
        canvas.height = h
        moduleInstance.resize_renderer(w, h)
      })

      window.addEventListener('keydown', (e) => {
        if (document.activeElement?.tagName === 'INPUT') return

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
        const modKey = isMac ? e.metaKey : e.ctrlKey

        if (modKey && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          if (e.shiftKey) {
            collab.redo()
          } else {
            collab.undo()
          }
          return
        }

        if (modKey && (e.key === 'y' || e.key === 'Y')) {
          e.preventDefault()
          collab.redo()
          return
        }

        if (e.key === '1') {
          moduleInstance.set_gizmo_mode(1)
          setGizmoMode(1)
          collab.setGizmoMode(1)
        }
        if (e.key === '2') {
          moduleInstance.set_gizmo_mode(2)
          setGizmoMode(2)
          collab.setGizmoMode(2)
        }
        if (e.key === '3') {
          moduleInstance.set_gizmo_mode(3)
          setGizmoMode(3)
          collab.setGizmoMode(3)
        }
      })

      let isDragging = false
      let lastX = 0
      let lastY = 0
      let lastDownX = 0
      let lastDownY = 0
      let selectedAxis = -1
      let initialDragTransform: {
        position: [number, number, number]
        rotation: [number, number, number]
        scale: [number, number, number]
      } | null = null
      let dragNodeId = -1

      canvas.addEventListener('mousedown', (e) => {
        isDragging = true
        lastX = e.clientX
        lastY = e.clientY
        lastDownX = e.clientX
        lastDownY = e.clientY

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        selectedAxis = moduleInstance.select_axis_at(x, y, rect.width, rect.height)

        if (selectedAxis !== -1) {
          const curId = moduleInstance.get_selected_node_id()
          if (curId >= 0) {
            try {
              const rawT = moduleInstance.get_node_transform(curId)
              const parsed = JSON.parse(rawT)
              initialDragTransform = {
                position: [parsed.position.x, parsed.position.y, parsed.position.z],
                rotation: [parsed.rotation.x, parsed.rotation.y, parsed.rotation.z],
                scale: [parsed.scale.x, parsed.scale.y, parsed.scale.z],
              }
              dragNodeId = curId
            } catch {}
          }
        } else {
          initialDragTransform = null
          dragNodeId = -1
        }
      })

      window.addEventListener('mouseup', () => {
        if (isDragging && selectedAxis !== -1) {
          collab.flush()
          if (dragNodeId >= 0 && initialDragTransform) {
            try {
              const rawT = moduleInstance.get_node_transform(dragNodeId)
              const parsed = JSON.parse(rawT)
              const mode = moduleInstance.get_gizmo_mode()
              let prop: TransformProperty = 'position'
              let initialVal: [number, number, number] = initialDragTransform.position
              let finalVal: [number, number, number] = [parsed.position.x, parsed.position.y, parsed.position.z]

              if (mode === 2) {
                prop = 'rotation'
                initialVal = initialDragTransform.rotation
                finalVal = [parsed.rotation.x, parsed.rotation.y, parsed.rotation.z]
              } else if (mode === 3) {
                prop = 'scale'
                initialVal = initialDragTransform.scale
                finalVal = [parsed.scale.x, parsed.scale.y, parsed.scale.z]
              }

              const changed = initialVal.some((v, i) => Math.abs(v - finalVal[i]) > 1e-4)
              if (changed) {
                collab.recordAction(
                  createUpdateTransformOp(dragNodeId, prop, finalVal, initialVal),
                  createUpdateTransformOp(dragNodeId, prop, initialVal, finalVal),
                  `Transform ${prop}`
                )
              }
            } catch {}
          }
        }
        isDragging = false
        selectedAxis = -1
        initialDragTransform = null
        dragNodeId = -1
      })

      canvas.addEventListener('click', (e) => {
        if (Math.abs(e.clientX - lastDownX) < 5 && Math.abs(e.clientY - lastDownY) < 5 && selectedAxis === -1) {
          const rect = canvas.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          moduleInstance.select_object_at(x, y, rect.width, rect.height)
          const newSelectedId = moduleInstance.get_selected_node_id()
          collab.selectNode(newSelectedId)
        }
      })

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY

        if (selectedAxis !== -1) {
          moduleInstance.drag_selected(dx, dy, selectedAxis)
          const curId = moduleInstance.get_selected_node_id()
          if (curId >= 0) {
            try {
              const rawT = moduleInstance.get_node_transform(curId)
              const parsed = JSON.parse(rawT)
              setTransform(parsed)

              const mode = moduleInstance.get_gizmo_mode()
              let prop: TransformProperty = 'position'
              let val: [number, number, number] = [parsed.position.x, parsed.position.y, parsed.position.z]

              if (mode === 2) {
                prop = 'rotation'
                val = [parsed.rotation.x, parsed.rotation.y, parsed.rotation.z]
              } else if (mode === 3) {
                prop = 'scale'
                val = [parsed.scale.x, parsed.scale.y, parsed.scale.z]
              }

              collab.updateTransform(curId, prop, val)
            } catch {}
          }
        } else {
          if (e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) {
            moduleInstance.pan_camera(dx * 0.01, dy * 0.01)
          } else if (e.buttons === 1) {
            moduleInstance.orbit_camera(dx * 0.01, dy * 0.01)
          }
        }
      })

      canvas.addEventListener(
        'wheel',
        (e) => {
          moduleInstance.zoom_camera(e.deltaY * 0.01)
          e.preventDefault()
        },
        { passive: false }
      )

      setReady(true)
      refreshHierarchy()

      function frame() {
        if (cancelled) return
        moduleInstance.render_frame()

        try {
          const id = moduleInstance.get_selected_node_id()
          setSelectedId((prev) => (prev !== id ? id : prev))

          if (id >= 0) {
            const t = JSON.parse(moduleInstance.get_node_transform(id))
            setTransform(t)
          } else {
            setTransform((prev) => (prev !== null ? null : prev))
          }

          const mode = moduleInstance.get_gizmo_mode()
          setGizmoMode((prev) => (prev !== mode ? mode : prev))
        } catch (e) {}

        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }

    init().catch(console.error)
    return () => {
      cancelled = true
      collab.disconnect()
    }
  }, [refreshHierarchy])

  const handleSelectNode = useCallback((id: number) => {
    try {
      engineRef.current?.select_node_by_id(id)
      collabRef.current?.selectNode(id)
    } catch (e) {}
  }, [])

  const handleSetGizmoMode = useCallback((mode: number) => {
    try {
      engineRef.current?.set_gizmo_mode(mode)
      setGizmoMode(mode)
      collabRef.current?.setGizmoMode(mode)
    } catch (e) {}
  }, [])

  const handleUndo = useCallback(() => {
    collabRef.current?.undo()
  }, [])

  const handleRedo = useCallback(() => {
    collabRef.current?.redo()
  }, [])

  const handleTransformChange = useCallback(
    (property: string, axis: string, value: number) => {
      const engine = engineRef.current
      const collab = collabRef.current
      if (!engine || !collab) return
      const id = selectedIdRef.current
      if (id < 0) return

      const currentT = transformRef.current
      const oldPos: [number, number, number] = [
        currentT?.position.x || 0,
        currentT?.position.y || 0,
        currentT?.position.z || 0,
      ]
      const oldRot: [number, number, number] = [
        currentT?.rotation.x || 0,
        currentT?.rotation.y || 0,
        currentT?.rotation.z || 0,
      ]
      const oldScale: [number, number, number] = [
        currentT?.scale.x || 1,
        currentT?.scale.y || 1,
        currentT?.scale.z || 1,
      ]

      const newPos: [number, number, number] = [
        axis === 'x' && property === 'position' ? value : oldPos[0],
        axis === 'y' && property === 'position' ? value : oldPos[1],
        axis === 'z' && property === 'position' ? value : oldPos[2],
      ]
      const newRot: [number, number, number] = [
        axis === 'x' && property === 'rotation' ? value : oldRot[0],
        axis === 'y' && property === 'rotation' ? value : oldRot[1],
        axis === 'z' && property === 'rotation' ? value : oldRot[2],
      ]
      const newScale: [number, number, number] = [
        axis === 'x' && property === 'scale' ? value : oldScale[0],
        axis === 'y' && property === 'scale' ? value : oldScale[1],
        axis === 'z' && property === 'scale' ? value : oldScale[2],
      ]

      const prop = property as TransformProperty
      const newVal = prop === 'position' ? newPos : prop === 'rotation' ? newRot : newScale
      const oldVal = prop === 'position' ? oldPos : prop === 'rotation' ? oldRot : oldScale

      collab.updateTransform(id, prop, newVal, oldVal)
      collab.flush()
      collab.recordAction(
        createUpdateTransformOp(id, prop, newVal, oldVal),
        createUpdateTransformOp(id, prop, oldVal, newVal),
        `Change ${prop}`
      )
    },
    []
  )

  const handleAddPrimitive = useCallback(
    (type: string) => {
      const engine = engineRef.current
      const collab = collabRef.current
      if (!engine || !collab) return

      try {
        // Generate a new node ID and position
        const localId = engine.add_primitive_node(type)
        const nodeData: NodeData = {
          id: localId,
          name: type,
          meshType: type as any,
          position: [0, 0.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          children: [],
        }
        // Broadcast op to server
        collab.insertNode(1, nodeData)
        collab.recordAction(
          createInsertNodeOp(1, nodeData),
          createDeleteNodeOp(localId, nodeData, 1),
          `Add ${type}`
        )
        refreshHierarchy()
      } catch (e) {
        console.error('Failed to add primitive', e)
      }
    },
    [refreshHierarchy]
  )

  const handleDeleteNode = useCallback(
    (id: number) => {
      const engine = engineRef.current
      const collab = collabRef.current
      if (!engine || !collab) return

      try {
        let deletedData: NodeData = {
          id,
          name: 'Node',
          meshType: 'None',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          children: [],
        }
        try {
          const rawT = engine.get_node_transform(id)
          const parsed = JSON.parse(rawT)
          deletedData.position = [parsed.position.x, parsed.position.y, parsed.position.z]
          deletedData.rotation = [parsed.rotation.x, parsed.rotation.y, parsed.rotation.z]
          deletedData.scale = [parsed.scale.x, parsed.scale.y, parsed.scale.z]
        } catch {}

        collab.deleteNode(id, deletedData, 1)
        collab.recordAction(
          createDeleteNodeOp(id, deletedData, 1),
          createInsertNodeOp(1, deletedData),
          `Delete Node`
        )
        refreshHierarchy()
      } catch (e) {
        console.error('Failed to delete node', e)
      }
    },
    [refreshHierarchy]
  )

  return (
    <>
      <canvas
        id="gpuCanvas"
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          position: 'absolute',
          top: 0,
          left: 0,
          outline: 'none',
        }}
      />
      {ready && (
        <>
          <div className="collab-status-badge">
            <span className={`status-dot ${connStatus}`} />
            <span>
              {connStatus === 'connected'
                ? `Room: ${collabRef.current?.roomId || 'default'}`
                : connStatus === 'reconnecting'
                ? 'Reconnecting...'
                : 'Connecting...'}
            </span>
            {peers.length > 0 && (
              <div className="peer-avatars" title={`${peers.length} peer(s) in session`}>
                {peers.map((p) => (
                  <span
                    key={p.clientId}
                    className="peer-avatar"
                    style={{ backgroundColor: p.color }}
                  />
                ))}
              </div>
            )}
          </div>
          <Toolbar
            gizmoMode={gizmoMode}
            canUndo={canUndo}
            canRedo={canRedo}
            onModeChange={handleSetGizmoMode}
            onAddPrimitive={handleAddPrimitive}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          <div className="editor-sidebar">
            <Outliner
              nodes={hierarchy}
              selectedId={selectedId}
              peers={peers}
              onSelect={handleSelectNode}
              onDelete={handleDeleteNode}
            />
            <Inspector
              selectedId={selectedId}
              transform={transform}
              hierarchy={hierarchy}
              onTransformChange={handleTransformChange}
            />
          </div>
        </>
      )}
    </>
  )
}
