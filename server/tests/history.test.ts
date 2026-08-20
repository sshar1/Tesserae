import { describe, test, expect } from 'bun:test';
import { HistoryManager } from '../../frontend/src/net/history';
import {
  createUpdateTransformOp,
  createInsertNodeOp,
  createDeleteNodeOp,
  invertOperation,
} from '../../shared/operations';

describe('HistoryManager Collaborative Undo/Redo', () => {
  test('initializes empty and reports canUndo/canRedo correctly', () => {
    const history = new HistoryManager();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoCount()).toBe(0);
    expect(history.getRedoCount()).toBe(0);
  });

  test('records actions and supports undo and redo', () => {
    const history = new HistoryManager();

    const op1 = createUpdateTransformOp(2, 'position', [1, 2, 3], [0, 0, 0]);
    const inv1 = invertOperation(op1)!;
    history.record(op1, inv1, 'Move Cube');

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoCount()).toBe(1);

    // Undo
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone!.inverse.payload).toEqual({
      nodeId: 2,
      property: 'position',
      value: [0, 0, 0],
      previousValue: [1, 2, 3],
    });

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    expect(history.getRedoCount()).toBe(1);

    // Redo
    const redone = history.redo();
    expect(redone).not.toBeNull();
    expect(redone!.op.payload).toEqual({
      nodeId: 2,
      property: 'position',
      value: [1, 2, 3],
      previousValue: [0, 0, 0],
    });

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  test('clears redo stack when a new action is recorded', () => {
    const history = new HistoryManager();

    const op1 = createUpdateTransformOp(2, 'position', [1, 0, 0], [0, 0, 0]);
    history.record(op1, invertOperation(op1)!);

    const op2 = createUpdateTransformOp(2, 'position', [2, 0, 0], [1, 0, 0]);
    history.record(op2, invertOperation(op2)!);

    expect(history.getUndoCount()).toBe(2);

    // Undo op2
    history.undo();
    expect(history.canRedo()).toBe(true);

    // Record new action op3
    const op3 = createInsertNodeOp(1, {
      id: 3,
      name: 'Sphere',
      meshType: 'Sphere',
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: [],
    });
    history.record(op3, invertOperation(op3)!);

    // Redo stack must be cleared
    expect(history.canRedo()).toBe(false);
    expect(history.getRedoCount()).toBe(0);
    expect(history.getUndoCount()).toBe(2); // op1 + op3
  });

  test('respects maxHistory limit', () => {
    const history = new HistoryManager({ maxHistory: 3 });

    for (let i = 1; i <= 5; i++) {
      const op = createUpdateTransformOp(2, 'position', [i, 0, 0], [i - 1, 0, 0]);
      history.record(op, invertOperation(op)!);
    }

    expect(history.getUndoCount()).toBe(3);

    const u1 = history.undo();
    expect((u1!.op.payload as any).value).toEqual([5, 0, 0]);

    const u2 = history.undo();
    expect((u2!.op.payload as any).value).toEqual([4, 0, 0]);

    const u3 = history.undo();
    expect((u3!.op.payload as any).value).toEqual([3, 0, 0]);

    expect(history.canUndo()).toBe(false);
  });
});
