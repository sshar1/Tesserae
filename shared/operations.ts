/**
 * Shared Operation Schema for Tesserae Collaboration
 * Single source of truth shared by both the Bun server and the Frontend client.
 */

export type MeshType = 'Cube' | 'Sphere' | 'Plane' | 'Torus' | 'None';

export type TransformProperty = 'position' | 'rotation' | 'scale';

export interface NodeData {
  id: number;
  name: string;
  meshType: MeshType;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles [x, y, z] in degrees
  scale: [number, number, number];
  children?: NodeData[];
}

export interface InsertNodePayload {
  parentId: number;
  node: NodeData;
}

export interface DeleteNodePayload {
  nodeId: number;
  /**
   * Snapshot of the deleted subtree for undo / reconciliation.
   */
  deletedNode?: NodeData;
  parentId?: number;
  index?: number;
}

export interface UpdateTransformPayload {
  nodeId: number;
  property: TransformProperty;
  value: [number, number, number];
  /**
   * Value prior to modification for undo / reconciliation.
   */
  previousValue?: [number, number, number];
}

export interface SelectNodePayload {
  clientId?: string;
  nodeId: number; // -1 for deselection
}

export interface SetGizmoModePayload {
  clientId?: string;
  mode: number; // 1: Translate, 2: Rotate, 3: Scale
}

export type SequencedOperationType =
  | 'INSERT_NODE'
  | 'DELETE_NODE'
  | 'UPDATE_TRANSFORM';

export type EphemeralOperationType =
  | 'SELECT_NODE'
  | 'SET_GIZMO_MODE';

export type OperationType = SequencedOperationType | EphemeralOperationType;

export interface OperationPayloadMap {
  INSERT_NODE: InsertNodePayload;
  DELETE_NODE: DeleteNodePayload;
  UPDATE_TRANSFORM: UpdateTransformPayload;
  SELECT_NODE: SelectNodePayload;
  SET_GIZMO_MODE: SetGizmoModePayload;
}

export interface Operation<T extends OperationType = OperationType> {
  type: T;
  payload: OperationPayloadMap[T];
}

/**
 * Monotonically sequenced operation broadcast to all connected clients.
 */
export interface SequencedOp<T extends SequencedOperationType = SequencedOperationType> {
  seqNum: number;
  clientId: string;
  type: T;
  payload: OperationPayloadMap[T];
}

export interface PeerPresence {
  clientId: string;
  color: string;
  selectedNodeId: number;
  gizmoMode: number;
  joinedAt: number;
}

/**
 * Messages sent from the server to clients.
 */
export type ServerMessage =
  | {
      type: 'SNAPSHOT';
      roomId: string;
      clientId: string;
      seqNum: number;
      scene: NodeData[];
      peers: PeerPresence[];
    }
  | {
      type: 'OP';
      seqNum: number;
      clientId: string;
      opType: SequencedOperationType;
      payload: OperationPayloadMap[SequencedOperationType];
    }
  | {
      type: 'BATCH_OPS';
      clientId: string;
      ops: Array<{
        seqNum: number;
        opType: SequencedOperationType;
        payload: OperationPayloadMap[SequencedOperationType];
      }>;
    }
  | {
      type: 'PEER_JOINED';
      clientId: string;
      color: string;
    }
  | {
      type: 'PEER_LEFT';
      clientId: string;
    }
  | {
      type: 'PEER_STATE';
      clientId: string;
      selectedNodeId?: number;
      gizmoMode?: number;
    }
  | {
      type: 'ERROR';
      code: string;
      message: string;
    }
  | {
      type: 'PONG';
      timestamp: number;
    };

/**
 * Messages sent from clients to the server.
 */
export type ClientMessage =
  | {
      type: 'OP';
      op: Operation<SequencedOperationType>;
    }
  | {
      type: 'BATCH_OPS';
      ops: Operation<SequencedOperationType>[];
    }
  | {
      type: 'SELECT_NODE';
      nodeId: number;
    }
  | {
      type: 'SET_GIZMO_MODE';
      mode: number;
    }
  | {
      type: 'PING';
      timestamp: number;
    };

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

const VALID_MESH_TYPES = new Set<string>(['Cube', 'Sphere', 'Plane', 'Torus', 'None']);
const VALID_TRANSFORM_PROPS = new Set<string>(['position', 'rotation', 'scale']);
const VALID_SEQUENCED_OP_TYPES = new Set<string>(['INSERT_NODE', 'DELETE_NODE', 'UPDATE_TRANSFORM']);
const VALID_EPHEMERAL_OP_TYPES = new Set<string>(['SELECT_NODE', 'SET_GIZMO_MODE']);

export function isVec3(val: unknown): val is [number, number, number] {
  return (
    Array.isArray(val) &&
    val.length === 3 &&
    typeof val[0] === 'number' &&
    Number.isFinite(val[0]) &&
    typeof val[1] === 'number' &&
    Number.isFinite(val[1]) &&
    typeof val[2] === 'number' &&
    Number.isFinite(val[2])
  );
}

export function validateNodeData(node: unknown): { valid: boolean; error?: string } {
  if (!node || typeof node !== 'object') {
    return { valid: false, error: 'Node must be a non-null object' };
  }
  const n = node as Record<string, unknown>;

  if (typeof n.id !== 'number' || !Number.isInteger(n.id) || n.id <= 0) {
    return { valid: false, error: 'Node id must be a positive integer' };
  }
  if (typeof n.name !== 'string' || n.name.length === 0 || n.name.length > 100) {
    return { valid: false, error: 'Node name must be a string (1-100 characters)' };
  }
  if (typeof n.meshType !== 'string' || !VALID_MESH_TYPES.has(n.meshType)) {
    return { valid: false, error: `Invalid meshType: ${String(n.meshType)}` };
  }
  if (!isVec3(n.position)) {
    return { valid: false, error: 'Node position must be a 3-element array of finite numbers' };
  }
  if (!isVec3(n.rotation)) {
    return { valid: false, error: 'Node rotation must be a 3-element array of finite numbers' };
  }
  if (!isVec3(n.scale)) {
    return { valid: false, error: 'Node scale must be a 3-element array of finite numbers' };
  }
  if (n.children !== undefined) {
    if (!Array.isArray(n.children)) {
      return { valid: false, error: 'Node children must be an array' };
    }
    for (const child of n.children) {
      const childValidation = validateNodeData(child);
      if (!childValidation.valid) {
        return childValidation;
      }
    }
  }

  return { valid: true };
}

export function validateOperation(op: unknown): { valid: boolean; error?: string } {
  if (!op || typeof op !== 'object') {
    return { valid: false, error: 'Operation must be a non-null object' };
  }

  const o = op as Record<string, unknown>;
  const type = o.type;

  if (typeof type !== 'string') {
    return { valid: false, error: 'Operation type must be a string' };
  }

  if (!VALID_SEQUENCED_OP_TYPES.has(type) && !VALID_EPHEMERAL_OP_TYPES.has(type)) {
    return { valid: false, error: `Unknown operation type: ${type}` };
  }

  const payload = o.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Operation payload must be a non-null object' };
  }

  const p = payload as Record<string, unknown>;

  switch (type) {
    case 'INSERT_NODE': {
      if (typeof p.parentId !== 'number' || !Number.isInteger(p.parentId) || p.parentId < 0) {
        return { valid: false, error: 'INSERT_NODE parentId must be a non-negative integer' };
      }
      return validateNodeData(p.node);
    }
    case 'DELETE_NODE': {
      if (typeof p.nodeId !== 'number' || !Number.isInteger(p.nodeId) || p.nodeId <= 0) {
        return { valid: false, error: 'DELETE_NODE nodeId must be a positive integer' };
      }
      if (p.deletedNode !== undefined) {
        const deletedValidation = validateNodeData(p.deletedNode);
        if (!deletedValidation.valid) return deletedValidation;
      }
      return { valid: true };
    }
    case 'UPDATE_TRANSFORM': {
      if (typeof p.nodeId !== 'number' || !Number.isInteger(p.nodeId) || p.nodeId <= 0) {
        return { valid: false, error: 'UPDATE_TRANSFORM nodeId must be a positive integer' };
      }
      if (typeof p.property !== 'string' || !VALID_TRANSFORM_PROPS.has(p.property)) {
        return { valid: false, error: `Invalid transform property: ${String(p.property)}` };
      }
      if (!isVec3(p.value)) {
        return { valid: false, error: 'UPDATE_TRANSFORM value must be a 3-element array of finite numbers' };
      }
      if (p.previousValue !== undefined && !isVec3(p.previousValue)) {
        return { valid: false, error: 'UPDATE_TRANSFORM previousValue must be a 3-element array of finite numbers' };
      }
      return { valid: true };
    }
    case 'SELECT_NODE': {
      if (typeof p.nodeId !== 'number' || !Number.isInteger(p.nodeId)) {
        return { valid: false, error: 'SELECT_NODE nodeId must be an integer' };
      }
      if (p.clientId !== undefined && typeof p.clientId !== 'string') {
        return { valid: false, error: 'SELECT_NODE clientId must be a string' };
      }
      return { valid: true };
    }
    case 'SET_GIZMO_MODE': {
      if (typeof p.mode !== 'number' || !Number.isInteger(p.mode) || p.mode < 1 || p.mode > 3) {
        return { valid: false, error: 'SET_GIZMO_MODE mode must be 1, 2, or 3' };
      }
      if (p.clientId !== undefined && typeof p.clientId !== 'string') {
        return { valid: false, error: 'SET_GIZMO_MODE clientId must be a string' };
      }
      return { valid: true };
    }
  }

  return { valid: true };
}

/**
 * Deep clones node data and all nested children.
 */
export function cloneNodeData(node: NodeData): NodeData {
  return {
    id: node.id,
    name: node.name,
    meshType: node.meshType,
    position: [node.position[0], node.position[1], node.position[2]],
    rotation: [node.rotation[0], node.rotation[1], node.rotation[2]],
    scale: [node.scale[0], node.scale[1], node.scale[2]],
    children: node.children ? node.children.map(cloneNodeData) : [],
  };
}

/**
 * Computes the inverse of a given operation for undo/redo and reconciliation.
 */
export function invertOperation(
  op: Operation<SequencedOperationType>
): Operation<SequencedOperationType> | null {
  switch (op.type) {
    case 'INSERT_NODE': {
      const payload = op.payload as InsertNodePayload;
      return {
        type: 'DELETE_NODE',
        payload: {
          nodeId: payload.node.id,
          deletedNode: cloneNodeData(payload.node),
          parentId: payload.parentId,
        },
      };
    }
    case 'DELETE_NODE': {
      const payload = op.payload as DeleteNodePayload;
      if (!payload.deletedNode || payload.parentId === undefined) {
        return null;
      }
      return {
        type: 'INSERT_NODE',
        payload: {
          parentId: payload.parentId,
          node: cloneNodeData(payload.deletedNode),
        },
      };
    }
    case 'UPDATE_TRANSFORM': {
      const payload = op.payload as UpdateTransformPayload;
      if (!payload.previousValue) {
        return null;
      }
      return {
        type: 'UPDATE_TRANSFORM',
        payload: {
          nodeId: payload.nodeId,
          property: payload.property,
          value: [payload.previousValue[0], payload.previousValue[1], payload.previousValue[2]],
          previousValue: [payload.value[0], payload.value[1], payload.value[2]],
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Helper factory functions for creating operations
 */
export function createInsertNodeOp(parentId: number, node: NodeData): Operation<'INSERT_NODE'> {
  return {
    type: 'INSERT_NODE',
    payload: {
      parentId,
      node: cloneNodeData(node),
    },
  };
}

export function createDeleteNodeOp(
  nodeId: number,
  deletedNode?: NodeData,
  parentId?: number,
  index?: number
): Operation<'DELETE_NODE'> {
  return {
    type: 'DELETE_NODE',
    payload: {
      nodeId,
      deletedNode: deletedNode ? cloneNodeData(deletedNode) : undefined,
      parentId,
      index,
    },
  };
}

export function createUpdateTransformOp(
  nodeId: number,
  property: TransformProperty,
  value: [number, number, number],
  previousValue?: [number, number, number]
): Operation<'UPDATE_TRANSFORM'> {
  return {
    type: 'UPDATE_TRANSFORM',
    payload: {
      nodeId,
      property,
      value: [value[0], value[1], value[2]],
      previousValue: previousValue ? [previousValue[0], previousValue[1], previousValue[2]] : undefined,
    },
  };
}

export function createSelectNodeOp(
  clientIdOrNodeId: string | number,
  nodeIdOrClientId?: number | string
): Operation<'SELECT_NODE'> {
  let clientId = '';
  let nodeId = -1;
  if (typeof clientIdOrNodeId === 'string') {
    clientId = clientIdOrNodeId;
    nodeId = typeof nodeIdOrClientId === 'number' ? nodeIdOrClientId : -1;
  } else {
    nodeId = clientIdOrNodeId;
    clientId = typeof nodeIdOrClientId === 'string' ? nodeIdOrClientId : '';
  }
  return {
    type: 'SELECT_NODE',
    payload: { clientId, nodeId },
  };
}

export function createSetGizmoModeOp(
  clientIdOrMode: string | number,
  modeOrClientId?: number | string
): Operation<'SET_GIZMO_MODE'> {
  let clientId = '';
  let mode = 1;
  if (typeof clientIdOrMode === 'string') {
    clientId = clientIdOrMode;
    mode = typeof modeOrClientId === 'number' ? modeOrClientId : 1;
  } else {
    mode = clientIdOrMode;
    clientId = typeof modeOrClientId === 'string' ? modeOrClientId : '';
  }
  return {
    type: 'SET_GIZMO_MODE',
    payload: { clientId, mode },
  };
}
