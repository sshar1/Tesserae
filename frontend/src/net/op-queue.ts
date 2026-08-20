import type {
  Operation,
  SequencedOperationType,
  UpdateTransformPayload,
} from './types';

export interface OpQueueOptions {
  throttleMs?: number;
  onSendBatch: (ops: Operation<SequencedOperationType>[]) => void;
}

export class OutboundOpQueue {
  private throttleMs: number;
  private onSendBatch: (ops: Operation<SequencedOperationType>[]) => void;
  private pendingOps: Operation<SequencedOperationType>[] = [];
  private coalescedTransforms = new Map<string, { op: Operation<'UPDATE_TRANSFORM'>; index: number }>();
  private timer: number | null = null;

  constructor(options: OpQueueOptions) {
    this.throttleMs = options.throttleMs ?? 100;
    this.onSendBatch = options.onSendBatch;
  }

  /**
   * Enqueues an operation.
   * If it's an UPDATE_TRANSFORM, coalesces with any existing pending transform for the same nodeId+property.
   * If it's a structural op (INSERT_NODE, DELETE_NODE), flushes preceding ops and sends immediately.
   */
  public enqueue(op: Operation<SequencedOperationType>): void {
    if (op.type === 'UPDATE_TRANSFORM') {
      const payload = op.payload as UpdateTransformPayload;
      const key = `${payload.nodeId}:${payload.property}`;

      const existing = this.coalescedTransforms.get(key);
      if (existing) {
        // Update existing op in place with the latest value, preserving original previousValue
        const existingPayload = existing.op.payload as UpdateTransformPayload;
        existingPayload.value = [payload.value[0], payload.value[1], payload.value[2]];
      } else {
        const index = this.pendingOps.length;
        const clonedOp: Operation<'UPDATE_TRANSFORM'> = {
          type: 'UPDATE_TRANSFORM',
          payload: {
            nodeId: payload.nodeId,
            property: payload.property,
            value: [payload.value[0], payload.value[1], payload.value[2]],
            previousValue: payload.previousValue
              ? [payload.previousValue[0], payload.previousValue[1], payload.previousValue[2]]
              : undefined,
          },
        };
        this.pendingOps.push(clonedOp);
        this.coalescedTransforms.set(key, { op: clonedOp, index });
      }

      this.scheduleFlush();
    } else if (op.type === 'INSERT_NODE' || op.type === 'DELETE_NODE') {
      // Structural operation (Insert/Delete): flush any pending transform ops first, then send structural op immediately
      this.flush();
      this.onSendBatch([op]);
    }
  }

  private scheduleFlush(): void {
    if (this.timer === null) {
      this.timer = window.setTimeout(() => {
        this.flush();
      }, this.throttleMs);
    }
  }

  /**
   * Immediately flushes all pending coalesced operations to the network in a single batch.
   */
  public flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.pendingOps.length === 0) return;

    const opsToSend = [...this.pendingOps];
    this.pendingOps = [];
    this.coalescedTransforms.clear();

    // Dispatches the entire batch in a single call
    this.onSendBatch(opsToSend);
  }

  public clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingOps = [];
    this.coalescedTransforms.clear();
  }

  public getPendingCount(): number {
    return this.pendingOps.length;
  }
}
