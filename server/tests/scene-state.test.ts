import { describe, expect, test } from 'bun:test';
import { SceneState } from '../scene-state';

describe('SceneState Canonical Scene Graph', () => {
  test('initializes with Root (id: 1) and default Cube (id: 2)', () => {
    const scene = new SceneState();
    expect(scene.getNodeCount()).toBe(2);

    const root = scene.findNode(1);
    expect(root).not.toBeNull();
    expect(root?.name).toBe('Root');
    expect(root?.children.length).toBe(1);

    const cube = scene.findNode(2);
    expect(cube).not.toBeNull();
    expect(cube?.name).toBe('Cube');
    expect(cube?.meshType).toBe('Cube');
    expect(cube?.parentId).toBe(1);
  });

  test('adds hierarchical child nodes', () => {
    const scene = new SceneState();
    const id = scene.generateNextId();

    const addResult = scene.addNode(2, {
      id,
      name: 'SphereChild',
      meshType: 'Sphere',
      position: [1, 0, 0],
      rotation: [0, 0, 0],
      scale: [0.5, 0.5, 0.5],
      children: [],
    });

    expect(addResult.success).toBe(true);
    const child = scene.findNode(id);
    expect(child).not.toBeNull();
    expect(child?.parentId).toBe(2);

    const parent = scene.findNode(2);
    expect(parent?.children.length).toBe(1);
    expect(parent?.children[0].id).toBe(id);
  });

  test('updates node transforms accurately', () => {
    const scene = new SceneState();
    const posRes = scene.updateTransform(2, 'position', [1.5, 2.5, 3.5]);
    expect(posRes.success).toBe(true);
    expect(posRes.previousValue).toEqual([0, 0, 0]);

    const cube = scene.findNode(2);
    expect(cube?.position).toEqual([1.5, 2.5, 3.5]);

    const rotRes = scene.updateTransform(2, 'rotation', [45, 90, 0]);
    expect(rotRes.success).toBe(true);
    expect(cube?.rotation).toEqual([45, 90, 0]);

    const scaleRes = scene.updateTransform(2, 'scale', [2, 2, 2]);
    expect(scaleRes.success).toBe(true);
    expect(cube?.scale).toEqual([2, 2, 2]);
  });

  test('deletes node and cleans up subtree from node index', () => {
    const scene = new SceneState();
    const childId = scene.generateNextId();
    scene.addNode(2, {
      id: childId,
      name: 'SubChild',
      meshType: 'Sphere',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    expect(scene.findNode(childId)).not.toBeNull();

    const delRes = scene.deleteNode(2);
    expect(delRes.success).toBe(true);
    expect(delRes.deletedNode?.id).toBe(2);
    expect(delRes.deletedNode?.children?.length).toBe(1);
    expect(scene.findNode(2)).toBeNull();
    expect(scene.findNode(childId)).toBeNull();
  });

  test('prevents cycle creation during reparenting', () => {
    const scene = new SceneState();
    const childId = scene.generateNextId();
    scene.addNode(2, {
      id: childId,
      name: 'ChildNode',
      meshType: 'Sphere',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });

    // Trying to reparent parent (id 2) into its own child (childId)
    const reparentRes = scene.reparentNode(2, childId);
    expect(reparentRes.success).toBe(false);
    expect(reparentRes.error).toContain('cycle');
  });

  test('serializes hierarchy matching frontend expectations', () => {
    const scene = new SceneState();
    const hierarchy = scene.getHierarchy();
    expect(Array.isArray(hierarchy)).toBe(true);
    expect(hierarchy.length).toBe(1);
    expect(hierarchy[0].id).toBe(2);
    expect(hierarchy[0].name).toBe('Cube');
  });
});
