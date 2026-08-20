import { describe, expect, test } from 'bun:test';
import { Room, ClientData } from '../room';
import { ServerMessage } from '../operations';

class MockWebSocket {
  public messages: string[] = [];
  public closed = false;
  public data: ClientData;

  constructor(data: ClientData) {
    this.data = data;
  }

  send(data: string) {
    this.messages.push(data);
  }

  close() {
    this.closed = true;
  }
}

describe('Room Collaboration & Sequencing', () => {
  test('creates room with initial sequence number 0', () => {
    const room = new Room('test-room');
    expect(room.id).toBe('test-room');
    expect(room.getSeqNum()).toBe(0);
    expect(room.getClientCount()).toBe(0);
  });

  test('adds client, assigns color, and sends initial SNAPSHOT', () => {
    const room = new Room('test-room');
    const clientData: ClientData = {
      roomId: 'test-room',
      clientId: 'client-1',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    };
    const mockWs = new MockWebSocket(clientData);

    room.addClient(mockWs as any);
    expect(room.getClientCount()).toBe(1);
    expect(mockWs.messages.length).toBe(1);

    const snapshot: ServerMessage = JSON.parse(mockWs.messages[0]);
    expect(snapshot.type).toBe('SNAPSHOT');
    if (snapshot.type === 'SNAPSHOT') {
      expect(snapshot.roomId).toBe('test-room');
      expect(snapshot.clientId).toBe('client-1');
      expect(snapshot.seqNum).toBe(0);
      expect(snapshot.scene.length).toBe(1);
      expect(snapshot.scene[0].name).toBe('Cube');
    }
  });

  test('sequences operations monotonically and broadcasts to peers', () => {
    const room = new Room('test-room');

    const client1 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-1',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    const client2 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-2',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    room.addClient(client1 as any);
    room.addClient(client2 as any);

    // Client 1 sends UPDATE_TRANSFORM
    room.handleMessage(
      client1 as any,
      JSON.stringify({
        type: 'OP',
        op: {
          type: 'UPDATE_TRANSFORM',
          payload: {
            nodeId: 2,
            property: 'position',
            value: [5, 0, 0],
          },
        },
      })
    );

    expect(room.getSeqNum()).toBe(1);

    // Both clients receive confirmed broadcast op
    const c1LastMsg = JSON.parse(client1.messages[client1.messages.length - 1]);
    const c2LastMsg = JSON.parse(client2.messages[client2.messages.length - 1]);

    expect(c1LastMsg.type).toBe('OP');
    expect(c1LastMsg.seqNum).toBe(1);
    expect(c1LastMsg.clientId).toBe('client-1');
    expect(c1LastMsg.payload.value).toEqual([5, 0, 0]);

    expect(c2LastMsg.type).toBe('OP');
    expect(c2LastMsg.seqNum).toBe(1);
    expect(c2LastMsg.clientId).toBe('client-1');
  });

  test('handles ephemeral selection and gizmo mode broadcasts', () => {
    const room = new Room('test-room');

    const client1 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-1',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    const client2 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-2',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    room.addClient(client1 as any);
    room.addClient(client2 as any);

    // Client 1 selects node 2
    room.handleMessage(
      client1 as any,
      JSON.stringify({
        type: 'SELECT_NODE',
        nodeId: 2,
      })
    );

    // SeqNum should NOT increase for ephemeral state
    expect(room.getSeqNum()).toBe(0);

    // Client 2 should receive PEER_STATE
    const c2LastMsg = JSON.parse(client2.messages[client2.messages.length - 1]);
    expect(c2LastMsg.type).toBe('PEER_STATE');
    expect(c2LastMsg.clientId).toBe('client-1');
    expect(c2LastMsg.selectedNodeId).toBe(2);
  });

  test('notifies peers when client disconnects', () => {
    const room = new Room('test-room');

    const client1 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-1',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    const client2 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-2',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    room.addClient(client1 as any);
    room.addClient(client2 as any);

    room.removeClient('client-1');
    expect(room.getClientCount()).toBe(1);

    const c2LastMsg = JSON.parse(client2.messages[client2.messages.length - 1]);
    expect(c2LastMsg.type).toBe('PEER_LEFT');
    expect(c2LastMsg.clientId).toBe('client-1');
  });

  test('processes and broadcasts BATCH_OPS atomically', () => {
    const room = new Room('test-room');

    const client1 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-1',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    const client2 = new MockWebSocket({
      roomId: 'test-room',
      clientId: 'client-2',
      color: room.assignPeerColor(),
      selectedNodeId: -1,
      gizmoMode: 1,
      joinedAt: Date.now(),
    });

    room.addClient(client1 as any);
    room.addClient(client2 as any);

    // Client 1 sends a batch of 2 operations
    room.handleMessage(
      client1 as any,
      JSON.stringify({
        type: 'BATCH_OPS',
        ops: [
          {
            type: 'UPDATE_TRANSFORM',
            payload: { nodeId: 2, property: 'position', value: [1, 2, 3] },
          },
          {
            type: 'UPDATE_TRANSFORM',
            payload: { nodeId: 2, property: 'rotation', value: [0, 90, 0] },
          },
        ],
      })
    );

    expect(room.getSeqNum()).toBe(2);

    const c2LastMsg = JSON.parse(client2.messages[client2.messages.length - 1]);
    expect(c2LastMsg.type).toBe('BATCH_OPS');
    expect(c2LastMsg.clientId).toBe('client-1');
    expect(c2LastMsg.ops.length).toBe(2);
    expect(c2LastMsg.ops[0].seqNum).toBe(1);
    expect(c2LastMsg.ops[1].seqNum).toBe(2);
  });
});

