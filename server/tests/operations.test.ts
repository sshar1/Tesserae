import { describe, expect, test } from 'bun:test';
import {
  validateOperation,
  validateNodeData,
  invertOperation,
  applyOperation,
  createInsertNodeOp,
  createDeleteNodeOp,
  createUpdateTransformOp,
  createSelectNodeOp,
  createSetGizmoModeOp,
  NodeData,
} from '../operations';
import { SceneState } from '../scene-state';

describe('Operation Schema & Validation', () => {
  test('validates correct NodeData', () => {
    const node: NodeData = {
      id: 5,
      name: 'TestSphere',
      meshType: 'Sphere',
      position: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: [1, 1, 1],
      children: [],
    };
    const result = validateNodeData(node);
    expect(result.valid).toBe(true);
  });

  test('rejects invalid NodeData', () => {
    expect(validateNodeData(null).valid).toBe(false);
    expect(validateNodeData({ id: -1, name: 'Bad' }).valid).toBe(false);
    expect(
      validateNodeData({
        id: 1,
        name: '',
        meshType: 'Sphere',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }).valid
    ).toBe(false);
    expect(
      validateNodeData({
        id: 1,
        name: 'BadMesh',
        meshType: 'InvalidMesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }).valid
    ).toBe(false);
    expect(
      validateNodeData({
        id: 1,
        name: 'BadPos',
        meshType: 'Cube',
        position: [0, 0], // missing z
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }).valid
    ).toBe(false);
  });

  test('validates INSERT_NODE op', () => {
    const op = createInsertNodeOp(1, {
      id: 10,
      name: 'NewTorus',
      meshType: 'Torus',
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(validateOperation(op).valid).toBe(true);
  });

  test('validates DELETE_NODE op', () => {
    const op = createDeleteNodeOp(2);
    expect(validateOperation(op).valid).toBe(true);
  });

  test('validates UPDATE_TRANSFORM op', () => {
    const op = createUpdateTransformOp(2, 'position', [3, 4, 5], [0, 0, 0]);
    expect(validateOperation(op).valid).toBe(true);
  });

  test('validates SELECT_NODE op', () => {
    const op = createSelectNodeOp('client-1', 2);
    expect(validateOperation(op).valid).toBe(true);
  });

  test('validates SET_GIZMO_MODE op', () => {
    const op = createSetGizmoModeOp('client-1', 2);
    expect(validateOperation(op).valid).toBe(true);
    expect(validateOperation(createSetGizmoModeOp('client-1', 5)).valid).toBe(false);
  });
});

describe('Operation Inversion (Undo/Reconciliation)', () => {
  test('inverts INSERT_NODE to DELETE_NODE', () => {
    const insertOp = createInsertNodeOp(1, {
      id: 42,
      name: 'MyNode',
      meshType: 'Plane',
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    const inverse = invertOperation(insertOp);
    expect(inverse).not.toBeNull();
    expect(inverse?.type).toBe('DELETE_NODE');
    expect((inverse?.payload as any).nodeId).toBe(42);
    expect((inverse?.payload as any).parentId).toBe(1);
    expect((inverse?.payload as any).deletedNode?.name).toBe('MyNode');
  });

  test('inverts DELETE_NODE to INSERT_NODE', () => {
    const deleteOp = createDeleteNodeOp(
      42,
      {
        id: 42,
        name: 'MyNode',
        meshType: 'Plane',
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      1
    );

    const inverse = invertOperation(deleteOp);
    expect(inverse).not.toBeNull();
    expect(inverse?.type).toBe('INSERT_NODE');
    expect((inverse?.payload as any).parentId).toBe(1);
    expect((inverse?.payload as any).node.id).toBe(42);
  });

  test('inverts UPDATE_TRANSFORM with previousValue', () => {
    const updateOp = createUpdateTransformOp(2, 'position', [10, 20, 30], [0, 0, 0]);
    const inverse = invertOperation(updateOp);

    expect(inverse).not.toBeNull();
    expect(inverse?.type).toBe('UPDATE_TRANSFORM');
    expect((inverse?.payload as any).nodeId).toBe(2);
    expect((inverse?.payload as any).property).toBe('position');
    expect((inverse?.payload as any).value).toEqual([0, 0, 0]);
    expect((inverse?.payload as any).previousValue).toEqual([10, 20, 30]);
  });
});

describe('Operation Application to SceneState', () => {
  test('applies INSERT_NODE and returns inverse', () => {
    const scene = new SceneState();
    const op = createInsertNodeOp(1, {
      id: 100,
      name: 'InsertedSphere',
      meshType: 'Sphere',
      position: [5, 5, 5],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
    });

    const result = applyOperation(scene, op);
    expect(result.success).toBe(true);
    expect(scene.findNode(100)).not.toBeNull();
    expect(result.inverse?.type).toBe('DELETE_NODE');
    expect((result.inverse?.payload as any).nodeId).toBe(100);
  });

  test('applies UPDATE_TRANSFORM and populates previousValue', () => {
    const scene = new SceneState();
    const op = createUpdateTransformOp(2, 'position', [10, 10, 10]);

    const result = applyOperation(scene, op);
    expect(result.success).toBe(true);
    expect(scene.findNode(2)?.position).toEqual([10, 10, 10]);
    expect(op.payload.previousValue).toEqual([0, 0, 0]);
    expect(result.inverse?.payload.value).toEqual([0, 0, 0]);
  });

  test('applies DELETE_NODE and captures full snapshot for undo', () => {
    const scene = new SceneState();
    const op = createDeleteNodeOp(2);

    const result = applyOperation(scene, op);
    expect(result.success).toBe(true);
    expect(scene.findNode(2)).toBeNull();
    expect(op.payload.deletedNode?.name).toBe('Cube');
    expect(result.inverse?.type).toBe('INSERT_NODE');

    // Re-apply inverse (Undo)
    if (result.inverse) {
      const undoResult = applyOperation(scene, result.inverse);
      expect(undoResult.success).toBe(true);
      expect(scene.findNode(2)).not.toBeNull();
    }
  });

  test('silently drops invalid operation on nonexistent node (Deterministic client drop)', () => {
    const scene = new SceneState();
    const op = createUpdateTransformOp(9999, 'position', [1, 2, 3]);

    const result = applyOperation(scene, op);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
