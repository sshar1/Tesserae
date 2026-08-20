import type {
  NodeData,
  Operation,
  SequencedOperationType,
  InsertNodePayload,
  DeleteNodePayload,
  UpdateTransformPayload,
} from './types';

export interface WasmEngine {
  init_renderer: (width: number, height: number) => void;
  resize_renderer: (width: number, height: number) => void;
  render_frame: () => void;
  orbit_camera: (dx: number, dy: number) => void;
  pan_camera: (dx: number, dy: number) => void;
  zoom_camera: (amount: number) => void;
  select_object_at: (x: number, y: number, width: number, height: number) => boolean;
  select_axis_at: (x: number, y: number, width: number, height: number) => number;
  drag_selected: (dx: number, dy: number, axis: number) => void;
  set_gizmo_mode: (mode: number) => void;
  get_gizmo_mode: () => number;
  get_scene_hierarchy: () => string;
  get_selected_node_id: () => number;
  get_node_transform: (id: number) => string;
  set_node_position: (id: number, x: number, y: number, z: number) => void;
  set_node_rotation_euler: (id: number, x: number, y: number, z: number) => void;
  set_node_scale: (id: number, x: number, y: number, z: number) => void;
  select_node_by_id: (id: number) => void;
  deselect_all: () => void;
  add_primitive_node: (type: string) => number;
  delete_node_by_id: (id: number) => boolean;
  insert_node: (
    id: number,
    name: string,
    type: string,
    parentId: number,
    px: number,
    py: number,
    pz: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy: number,
    sz: number
  ) => boolean;
  clear_scene: () => void;
}

export interface UnconfirmedOp {
  op: Operation<SequencedOperationType>;
  inverse: Operation<SequencedOperationType>;
}

export class Reconciler {
  private engine: WasmEngine | null = null;
  private unconfirmedOps: UnconfirmedOp[] = [];

  constructor(engine?: WasmEngine | null) {
    if (engine) this.engine = engine;
  }

  public setEngine(engine: WasmEngine | null): void {
    this.engine = engine;
  }

  public getUnconfirmedCount(): number {
    return this.unconfirmedOps.length;
  }

  /**
   * Applies a local operation optimistically to the local WASM engine
   * and tracks its inverse for undo-and-replay reconciliation.
   */
  public applyOptimistic(
    op: Operation<SequencedOperationType>,
    inverse?: Operation<SequencedOperationType>
  ): void {
    if (!this.engine) return;

    // If inverse was not provided, compute it from current WASM engine state
    const computedInverse = inverse || this.computeInverse(op);

    // Apply to local engine immediately (0ms local latency)
    this.applyToEngine(op);

    if (computedInverse) {
      this.unconfirmedOps.push({ op, inverse: computedInverse });
    }
  }

  /**
   * Handles a server-confirmed operation.
   * If the op originated locally, resolves it from the unconfirmed queue.
   * If the op came from a remote peer, performs Undo-and-Replay:
   *   1. Undo all unconfirmed local ops in reverse order
   *   2. Apply peer's confirmed op to WASM engine
   *   3. Re-apply all unconfirmed local ops on top
   */
  public handleServerOp(
    op: Operation<SequencedOperationType>,
    isOwnOp: boolean
  ): void {
    if (!this.engine) return;

    if (isOwnOp) {
      // Find matching unconfirmed op
      const index = this.unconfirmedOps.findIndex((u) => this.isSameOp(u.op, op));
      if (index !== -1) {
        if (index === 0) {
          // Normal case: confirmed in exact order
          this.unconfirmedOps.shift();
        } else {
          // Out-of-order confirmation: rollback, remove, replay
          this.undoUnconfirmed();
          this.unconfirmedOps.splice(index, 1);
          this.replayUnconfirmed();
        }
      }
    } else {
      // Remote peer op: perform undo-and-replay
      if (this.unconfirmedOps.length === 0) {
        this.applyToEngine(op);
      } else {
        this.undoUnconfirmed();
        this.applyToEngine(op);
        this.replayUnconfirmed();
      }
    }
  }

  /**
   * Fully rebuilds the local WASM scene from a server snapshot.
   */
  public loadSnapshot(sceneNodes: NodeData[]): void {
    if (!this.engine) return;

    this.unconfirmedOps = [];
    this.engine.clear_scene();

    const insertTree = (nodes: NodeData[], parentId: number) => {
      for (const node of nodes) {
        this.engine!.insert_node(
          node.id,
          node.name,
          node.meshType,
          parentId,
          node.position[0],
          node.position[1],
          node.position[2],
          node.rotation[0],
          node.rotation[1],
          node.rotation[2],
          node.scale[0],
          node.scale[1],
          node.scale[2]
        );
        if (node.children && node.children.length > 0) {
          insertTree(node.children, node.id);
        }
      }
    };

    insertTree(sceneNodes, 1); // 1 = root ID
  }

  private undoUnconfirmed(): void {
    if (!this.engine) return;
    for (let i = this.unconfirmedOps.length - 1; i >= 0; i--) {
      this.applyToEngine(this.unconfirmedOps[i].inverse);
    }
  }

  private replayUnconfirmed(): void {
    if (!this.engine) return;
    for (const u of this.unconfirmedOps) {
      this.applyToEngine(u.op);
    }
  }

  public applyToEngine(op: Operation<SequencedOperationType>): void {
    if (!this.engine) return;

    switch (op.type) {
      case 'INSERT_NODE': {
        const payload = op.payload as InsertNodePayload;
        const n = payload.node;
        this.engine.insert_node(
          n.id,
          n.name,
          n.meshType,
          payload.parentId,
          n.position[0],
          n.position[1],
          n.position[2],
          n.rotation[0],
          n.rotation[1],
          n.rotation[2],
          n.scale[0],
          n.scale[1],
          n.scale[2]
        );
        break;
      }
      case 'DELETE_NODE': {
        const payload = op.payload as DeleteNodePayload;
        this.engine.delete_node_by_id(payload.nodeId);
        break;
      }
      case 'UPDATE_TRANSFORM': {
        const payload = op.payload as UpdateTransformPayload;
        const [x, y, z] = payload.value;
        if (payload.property === 'position') {
          this.engine.set_node_position(payload.nodeId, x, y, z);
        } else if (payload.property === 'rotation') {
          this.engine.set_node_rotation_euler(payload.nodeId, x, y, z);
        } else if (payload.property === 'scale') {
          this.engine.set_node_scale(payload.nodeId, x, y, z);
        }
        break;
      }
    }
  }

  public computeInverse(
    op: Operation<SequencedOperationType>
  ): Operation<SequencedOperationType> | null {
    switch (op.type) {
      case 'INSERT_NODE': {
        const payload = op.payload as InsertNodePayload;
        return {
          type: 'DELETE_NODE',
          payload: {
            nodeId: payload.node.id,
            parentId: payload.parentId,
            deletedNode: payload.node,
          },
        };
      }
      case 'DELETE_NODE': {
        const payload = op.payload as DeleteNodePayload;
        if (payload.deletedNode && payload.parentId !== undefined) {
          return {
            type: 'INSERT_NODE',
            payload: {
              parentId: payload.parentId,
              node: payload.deletedNode,
            },
          };
        }
        return null;
      }
      case 'UPDATE_TRANSFORM': {
        const payload = op.payload as UpdateTransformPayload;
        let prev = payload.previousValue;
        if (!prev && this.engine) {
          try {
            const rawTransform = this.engine.get_node_transform(payload.nodeId);
            const parsed = JSON.parse(rawTransform);
            const current = parsed[payload.property];
            if (current) {
              prev = [current.x, current.y, current.z];
            }
          } catch {}
        }
        if (!prev) return null;

        return {
          type: 'UPDATE_TRANSFORM',
          payload: {
            nodeId: payload.nodeId,
            property: payload.property,
            value: [prev[0], prev[1], prev[2]],
            previousValue: [payload.value[0], payload.value[1], payload.value[2]],
          },
        };
      }
    }
  }

  private isSameOp(
    a: Operation<SequencedOperationType>,
    b: Operation<SequencedOperationType>
  ): boolean {
    if (a.type === 'UPDATE_TRANSFORM' && b.type === 'UPDATE_TRANSFORM') {
      const ap = a.payload as UpdateTransformPayload;
      const bp = b.payload as UpdateTransformPayload;
      return ap.nodeId === bp.nodeId && ap.property === bp.property;
    }
    if (a.type === 'INSERT_NODE' && b.type === 'INSERT_NODE') {
      const ap = a.payload as InsertNodePayload;
      const bp = b.payload as InsertNodePayload;
      return ap.node.id === bp.node.id;
    }
    if (a.type === 'DELETE_NODE' && b.type === 'DELETE_NODE') {
      const ap = a.payload as DeleteNodePayload;
      const bp = b.payload as DeleteNodePayload;
      return ap.nodeId === bp.nodeId;
    }
    return false;
  }
}

