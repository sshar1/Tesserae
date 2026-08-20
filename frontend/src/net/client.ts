import type {
  NodeData,
  Operation,
  SequencedOperationType,
  PeerPresence,
  ServerMessage,
  TransformProperty,
  ConnectionStatus,
} from './types';
import {
  createInsertNodeOp,
  createDeleteNodeOp,
  createUpdateTransformOp,
} from './types';
import { OutboundOpQueue } from './op-queue';
import { Reconciler } from './reconciler';
import type { WasmEngine } from './reconciler';

export interface CollaborationClientOptions {
  serverUrl?: string;
  roomId?: string;
  clientId?: string;
  engine?: WasmEngine | null;
  onStatusChange?: (status: ConnectionStatus) => void;
  onHierarchyChange?: () => void;
  onPeersChange?: (peers: PeerPresence[]) => void;
}

export class CollaborationClient {
  public readonly roomId: string;
  public readonly clientId: string;
  public localColor = '#2196F3';

  private serverUrl: string;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconciler: Reconciler;
  private opQueue: OutboundOpQueue;
  private peers = new Map<string, PeerPresence>();

  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

  public onStatusChange?: (status: ConnectionStatus) => void;
  public onHierarchyChange?: () => void;
  public onPeersChange?: (peers: PeerPresence[]) => void;

  constructor(options: CollaborationClientOptions = {}) {
    this.roomId = options.roomId || 'default';
    this.clientId = options.clientId || crypto.randomUUID();
    this.serverUrl = options.serverUrl || this.getDefaultServerUrl();

    this.onStatusChange = options.onStatusChange;
    this.onHierarchyChange = options.onHierarchyChange;
    this.onPeersChange = options.onPeersChange;

    this.reconciler = new Reconciler(options.engine);
    this.opQueue = new OutboundOpQueue({
      throttleMs: 100,
      onSendBatch: (ops) => this.sendBatchOpsToServer(ops),
    });
  }

  private getDefaultServerUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    return `${protocol}//${host}:3001`;
  }

  public setEngine(engine: WasmEngine | null): void {
    this.reconciler.setEngine(engine);
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getPeers(): PeerPresence[] {
    return Array.from(this.peers.values());
  }

  public connect(): void {
    this.shouldReconnect = true;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const url = `${this.serverUrl}/room/${encodeURIComponent(this.roomId)}?clientId=${encodeURIComponent(
      this.clientId
    )}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error('[Net] Failed to construct WebSocket:', err);
      this.handleDisconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log(`[Net] Connected to room: ${this.roomId} as ${this.clientId}`);
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('[Net] WebSocket disconnected');
      this.handleDisconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[Net] WebSocket error:', err);
    };
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.opQueue.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private handleDisconnect(): void {
    this.ws = null;
    if (!this.shouldReconnect) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('reconnecting');
    this.reconnectAttempts++;
    const delay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(rawData: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(rawData);
    } catch {
      console.warn('[Net] Failed to parse message JSON');
      return;
    }

    switch (msg.type) {
      case 'SNAPSHOT': {
        this.peers.clear();
        for (const peer of msg.peers) {
          if (peer.clientId === this.clientId) {
            this.localColor = peer.color;
          } else {
            this.peers.set(peer.clientId, peer);
          }
        }
        this.reconciler.loadSnapshot(msg.scene);
        this.onPeersChange?.(this.getPeers());
        this.onHierarchyChange?.();
        break;
      }
      case 'OP': {
        const isOwnOp = msg.clientId === this.clientId;
        const op: Operation<SequencedOperationType> = {
          type: msg.opType,
          payload: msg.payload as any,
        };

        this.reconciler.handleServerOp(op, isOwnOp);

        if (msg.opType === 'INSERT_NODE' || msg.opType === 'DELETE_NODE') {
          this.onHierarchyChange?.();
        }
        break;
      }
      case 'BATCH_OPS': {
        const isOwnOp = msg.clientId === this.clientId;
        let hasStructural = false;
        for (const item of msg.ops) {
          const op: Operation<SequencedOperationType> = {
            type: item.opType,
            payload: item.payload as any,
          };
          this.reconciler.handleServerOp(op, isOwnOp);
          if (item.opType === 'INSERT_NODE' || item.opType === 'DELETE_NODE') {
            hasStructural = true;
          }
        }
        if (hasStructural) {
          this.onHierarchyChange?.();
        }
        break;
      }
      case 'PEER_JOINED': {
        if (msg.clientId !== this.clientId) {
          this.peers.set(msg.clientId, {
            clientId: msg.clientId,
            color: msg.color,
            selectedNodeId: -1,
            gizmoMode: 1,
            joinedAt: Date.now(),
          });
          this.onPeersChange?.(this.getPeers());
        }
        break;
      }
      case 'PEER_LEFT': {
        this.peers.delete(msg.clientId);
        this.onPeersChange?.(this.getPeers());
        break;
      }
      case 'PEER_STATE': {
        const peer = this.peers.get(msg.clientId);
        if (peer) {
          if (msg.selectedNodeId !== undefined) peer.selectedNodeId = msg.selectedNodeId;
          if (msg.gizmoMode !== undefined) peer.gizmoMode = msg.gizmoMode;
          this.onPeersChange?.(this.getPeers());
        }
        break;
      }
    }
  }

  private sendBatchOpsToServer(ops: Operation<SequencedOperationType>[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || ops.length === 0) {
      return;
    }
    if (ops.length === 1) {
      this.ws.send(
        JSON.stringify({
          type: 'OP',
          op: ops[0],
        })
      );
    } else {
      this.ws.send(
        JSON.stringify({
          type: 'BATCH_OPS',
          ops,
        })
      );
    }
  }

  // --- Public Action APIs ---

  public updateTransform(
    nodeId: number,
    property: TransformProperty,
    value: [number, number, number],
    previousValue?: [number, number, number]
  ): void {
    const op = createUpdateTransformOp(nodeId, property, value, previousValue);
    this.reconciler.applyOptimistic(op);
    this.opQueue.enqueue(op);
  }

  public insertNode(parentId: number, node: NodeData): void {
    const op = createInsertNodeOp(parentId, node);
    this.reconciler.applyOptimistic(op);
    this.opQueue.enqueue(op);
    this.onHierarchyChange?.();
  }

  public deleteNode(
    nodeId: number,
    deletedNode?: NodeData,
    parentId?: number,
    index?: number
  ): void {
    const op = createDeleteNodeOp(nodeId, deletedNode, parentId, index);
    this.reconciler.applyOptimistic(op);
    this.opQueue.enqueue(op);
    this.onHierarchyChange?.();
  }

  private lastSentSelectedNodeId = -1;
  private lastSentGizmoMode = 1;

  public selectNode(nodeId: number): void {
    if (nodeId === this.lastSentSelectedNodeId) return;
    this.lastSentSelectedNodeId = nodeId;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'SELECT_NODE',
        nodeId,
      })
    );
  }

  public setGizmoMode(mode: number): void {
    if (mode === this.lastSentGizmoMode) return;
    this.lastSentGizmoMode = mode;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'SET_GIZMO_MODE',
        mode,
      })
    );
  }

  public flush(): void {
    this.opQueue.flush();
  }
}

// Global factory or singleton helper
export function createCollaborationClient(
  options: CollaborationClientOptions = {}
): CollaborationClient {
  return new CollaborationClient(options);
}
