/**
 * Server Operation Handlers and Re-exports
 */

import type { SceneState } from './scene-state';
import type {
  Operation,
  SequencedOperationType,
  InsertNodePayload,
  DeleteNodePayload,
  UpdateTransformPayload,
} from '../shared/operations';
import {
  validateOperation,
  createInsertNodeOp,
  createDeleteNodeOp,
  createUpdateTransformOp,
} from '../shared/operations';

export * from '../shared/operations';

/**
 * Applies an operation to the server authoritative SceneState and generates
 * its exact inverse operation. If the operation is semantically invalid
 * (e.g. modifying a deleted node), it returns success: false for deterministic drop.
 */
export function applyOperation(
  scene: SceneState,
  op: Operation
): { success: boolean; inverse?: Operation<SequencedOperationType>; error?: string } {
  const validation = validateOperation(op);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  switch (op.type) {
    case 'INSERT_NODE': {
      const payload = op.payload as InsertNodePayload;
      const result = scene.addNode(payload.parentId, payload.node);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const inverse = createDeleteNodeOp(payload.node.id, payload.node, payload.parentId);
      return { success: true, inverse };
    }
    case 'DELETE_NODE': {
      const payload = op.payload as DeleteNodePayload;
      const result = scene.deleteNode(payload.nodeId);
      if (!result.success || !result.deletedNode || result.parentId === undefined) {
        return { success: false, error: result.error || 'Failed to delete node' };
      }
      payload.deletedNode = result.deletedNode;
      payload.parentId = result.parentId;
      payload.index = result.index;

      const inverse = createInsertNodeOp(result.parentId, result.deletedNode);
      return { success: true, inverse };
    }
    case 'UPDATE_TRANSFORM': {
      const payload = op.payload as UpdateTransformPayload;
      const result = scene.updateTransform(payload.nodeId, payload.property, payload.value);
      if (!result.success || !result.previousValue) {
        return { success: false, error: result.error || 'Failed to update transform' };
      }
      payload.previousValue = result.previousValue;

      const inverse = createUpdateTransformOp(
        payload.nodeId,
        payload.property,
        result.previousValue,
        payload.value
      );
      return { success: true, inverse };
    }
    case 'SELECT_NODE':
    case 'SET_GIZMO_MODE': {
      // Ephemeral operations do not mutate the scene graph
      return { success: true };
    }
    default:
      return { success: false, error: `Unhandled operation type: ${(op as any).type}` };
  }
}
