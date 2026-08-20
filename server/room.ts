import type { ServerWebSocket } from 'bun';
import { SceneState } from './scene-state';
import {
  Operation,
  SequencedOperationType,
  ServerMessage,
  ClientMessage,
  PeerPresence,
  applyOperation,
  validateOperation,
} from './operations';

export interface ClientData {
  roomId: string;
  clientId: string;
  color: string;
  selectedNodeId: number;
  gizmoMode: number;
  joinedAt: number;
}

const PEER_COLORS = [
  '#FF5722', // Deep Orange
  '#2196F3', // Blue
  '#4CAF50', // Green
  '#9C27B0', // Purple
  '#FF9800', // Amber
  '#00BCD4', // Cyan
  '#E91E63', // Pink
  '#8BC34A', // Light Green
  '#3F51B5', // Indigo
  '#009688', // Teal
];

export class Room {
  public readonly id: string;
  public readonly scene: SceneState;
  private currentSeqNum = 0;
  private clients = new Map<string, ServerWebSocket<ClientData>>();
  private peerData = new Map<string, ClientData>();
  private nextColorIndex = 0;

  constructor(id: string) {
    this.id = id;
    this.scene = new SceneState();
  }

  public getSeqNum(): number {
    return this.currentSeqNum;
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public assignPeerColor(): string {
    const color = PEER_COLORS[this.nextColorIndex % PEER_COLORS.length];
    this.nextColorIndex++;
    return color;
  }

  /**
   * Adds a new client to the room, sends initial SNAPSHOT,
   * and notifies other peers.
   */
  public addClient(ws: ServerWebSocket<ClientData>): void {
    const data = ws.data;
    this.clients.set(data.clientId, ws);
    this.peerData.set(data.clientId, data);

    // 1. Send SNAPSHOT to the newly connected client
    const snapshotMsg: ServerMessage = {
      type: 'SNAPSHOT',
      roomId: this.id,
      clientId: data.clientId,
      seqNum: this.currentSeqNum,
      scene: this.scene.getHierarchy(),
      peers: this.getAllPeers(),
    };
    this.sendToClient(ws, snapshotMsg);

    // 2. Broadcast PEER_JOINED to all other clients in the room
    const peerJoinedMsg: ServerMessage = {
      type: 'PEER_JOINED',
      clientId: data.clientId,
      color: data.color,
    };
    this.broadcast(peerJoinedMsg, data.clientId);
  }

  /**
   * Removes a client from the room and broadcasts PEER_LEFT.
   */
  public removeClient(clientId: string): void {
    this.clients.delete(clientId);
    this.peerData.delete(clientId);

    const peerLeftMsg: ServerMessage = {
      type: 'PEER_LEFT',
      clientId,
    };
    this.broadcast(peerLeftMsg);
  }

  /**
   * Returns presence info for all currently connected peers.
   */
  public getAllPeers(): PeerPresence[] {
    const peers: PeerPresence[] = [];
    for (const [clientId, data] of this.peerData.entries()) {
      peers.push({
        clientId,
        color: data.color,
        selectedNodeId: data.selectedNodeId,
        gizmoMode: data.gizmoMode,
        joinedAt: data.joinedAt,
      });
    }
    return peers;
  }

  /**
   * Handles an incoming message from a client.
   */
  public handleMessage(ws: ServerWebSocket<ClientData>, rawMessage: string | ArrayBuffer): void {
    let msg: any;
    try {
      if (typeof rawMessage === 'string') {
        msg = JSON.parse(rawMessage);
      } else {
        const text = new TextDecoder().decode(rawMessage);
        msg = JSON.parse(text);
      }
    } catch {
      this.sendToClient(ws, {
        type: 'ERROR',
        code: 'INVALID_JSON',
        message: 'Failed to parse JSON message',
      });
      return;
    }

    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      this.sendToClient(ws, {
        type: 'ERROR',
        code: 'INVALID_MESSAGE',
        message: 'Message must be an object with a string type',
      });
      return;
    }

    const clientId = ws.data.clientId;

    switch (msg.type) {
      case 'PING': {
        this.sendToClient(ws, {
          type: 'PONG',
          timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
        });
        break;
      }
      case 'SELECT_NODE': {
        const nodeId = typeof msg.nodeId === 'number' ? msg.nodeId : (msg.payload?.nodeId ?? -1);
        ws.data.selectedNodeId = nodeId;
        const currentData = this.peerData.get(clientId);
        if (currentData) currentData.selectedNodeId = nodeId;

        this.broadcast(
          {
            type: 'PEER_STATE',
            clientId,
            selectedNodeId: nodeId,
          },
          clientId
        );
        break;
      }
      case 'SET_GIZMO_MODE': {
        const mode = typeof msg.mode === 'number' ? msg.mode : (msg.payload?.mode ?? 1);
        ws.data.gizmoMode = mode;
        const currentData = this.peerData.get(clientId);
        if (currentData) currentData.gizmoMode = mode;

        this.broadcast(
          {
            type: 'PEER_STATE',
            clientId,
            gizmoMode: mode,
          },
          clientId
        );
        break;
      }
      case 'OP': {
        // Structured op message: { type: 'OP', op: { type: '...', payload: { ... } } }
        const op = msg.op;
        this.processOperation(ws, clientId, op);
        break;
      }
      case 'BATCH_OPS': {
        const ops = msg.ops;
        if (Array.isArray(ops)) {
          this.processBatchOperations(ws, clientId, ops);
        }
        break;
      }
      case 'INSERT_NODE':
      case 'DELETE_NODE':
      case 'UPDATE_TRANSFORM': {
        // Direct op message: { type: 'INSERT_NODE', payload: { ... } }
        const op: Operation<SequencedOperationType> = {
          type: msg.type,
          payload: msg.payload,
        };
        this.processOperation(ws, clientId, op);
        break;
      }
      default: {
        this.sendToClient(ws, {
          type: 'ERROR',
          code: 'UNKNOWN_TYPE',
          message: `Unknown message type: ${msg.type}`,
        });
      }
    }
  }

  /**
   * Validates, applies, sequences, and broadcasts an operation.
   * 
   * TODO: Add client-side and server-side rate-limiting (e.g. token bucket per client)
   * and a maximum room node limit (e.g. MAX_ROOM_NODES = 5000) to prevent denial-of-service
   * or memory exhaustion from rapid INSERT_NODE/structural operation spam.
   */
  private processOperation(
    ws: ServerWebSocket<ClientData>,
    clientId: string,
    op: any
  ): void {
    if (!op || typeof op !== 'object') {
      this.sendToClient(ws, {
        type: 'ERROR',
        code: 'INVALID_OP',
        message: 'Operation must be an object',
      });
      return;
    }

    // Validation is already run in applyOperation; should either remove from here
    // or from applyOperation (I say remove from applyOperation to have more detailed errors)
    const validation = validateOperation(op);
    if (!validation.valid) {
      this.sendToClient(ws, {
        type: 'ERROR',
        code: 'VALIDATION_FAILED',
        message: validation.error || 'Invalid operation format',
      });
      return;
    }

    // Apply operation to server authoritative scene state
    const result = applyOperation(this.scene, op);
    if (!result.success) {
      // Deterministic drop (e.g. node was already deleted by another client)
      // Log/ignore or send an informational error
      return;
    }

    // Sequence the operation
    this.currentSeqNum++;
    const seqNum = this.currentSeqNum;

    // Broadcast confirmed sequenced operation to ALL connected clients in the room
    const broadcastMsg: ServerMessage = {
      type: 'OP',
      seqNum,
      clientId,
      opType: op.type,
      payload: op.payload,
    };

    this.broadcast(broadcastMsg);
  }

  /**
   * Processes a batch of operations atomically in a single pass.
   */
  private processBatchOperations(
    ws: ServerWebSocket<ClientData>,
    clientId: string,
    ops: any[]
  ): void {
    const confirmedOps: Array<{
      seqNum: number;
      opType: SequencedOperationType;
      payload: any;
    }> = [];

    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;
      const validation = validateOperation(op);
      if (!validation.valid) continue;

      const result = applyOperation(this.scene, op);
      if (!result.success) continue;

      this.currentSeqNum++;
      confirmedOps.push({
        seqNum: this.currentSeqNum,
        opType: op.type,
        payload: op.payload,
      });
    }

    if (confirmedOps.length === 1) {
      this.broadcast({
        type: 'OP',
        seqNum: confirmedOps[0].seqNum,
        clientId,
        opType: confirmedOps[0].opType,
        payload: confirmedOps[0].payload,
      });
    } else if (confirmedOps.length > 1) {
      this.broadcast({
        type: 'BATCH_OPS',
        clientId,
        ops: confirmedOps,
      });
    }
  }

  /**
   * Broadcasts a message to all clients in the room (or all except excludeClientId).
   */
  public broadcast(msg: ServerMessage, excludeClientId?: string): void {
    const payload = JSON.stringify(msg);
    for (const [clientId, ws] of this.clients.entries()) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }
      try {
        ws.send(payload);
      } catch (err) {
        console.error(`Error sending message to client ${clientId}:`, err);
      }
    }
  }

  /**
   * Sends a message to a single specific client WebSocket.
   */
  public sendToClient(ws: ServerWebSocket<ClientData>, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error(`Error sending message to client ${ws.data.clientId}:`, err);
    }
  }
}
