/**
 * Client-Side Collaborative Undo/Redo History Manager
 *
 * Tracks the local user's own actions and their exact inverse operations.
 * When undo or redo is triggered, the inverse (or forward) operation is
 * dispatched through the CollaborationClient pipeline as a new sequenced operation.
 */

import type { Operation, SequencedOperationType } from './types';

export interface HistoryEntry {
  op: Operation<SequencedOperationType>;
  inverse: Operation<SequencedOperationType>;
  description?: string;
  timestamp: number;
}

export interface HistoryManagerOptions {
  maxHistory?: number;
  onHistoryChange?: () => void;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxHistory: number;
  private onHistoryChange?: () => void;

  constructor(options: HistoryManagerOptions = {}) {
    this.maxHistory = options.maxHistory ?? 100;
    this.onHistoryChange = options.onHistoryChange;
  }

  /**
   * Records a user's own operation and its corresponding inverse.
   * Clears the redo stack.
   */
  public record(
    op: Operation<SequencedOperationType>,
    inverse: Operation<SequencedOperationType>,
    description?: string
  ): void {
    const entry: HistoryEntry = {
      op,
      inverse,
      description,
      timestamp: Date.now(),
    };

    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // New action invalidates redo history
    this.redoStack = [];
    this.onHistoryChange?.();
  }

  /**
   * Undoes the last recorded action.
   * Pops the entry from undoStack, pushes to redoStack, and returns the entry so its inverse can be executed.
   */
  public undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    this.onHistoryChange?.();
    return entry;
  }

  /**
   * Redoes the last undone action.
   * Pops the entry from redoStack, pushes to undoStack, and returns the entry so its forward op can be executed.
   */
  public redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    this.onHistoryChange?.();
    return entry;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onHistoryChange?.();
  }
}
