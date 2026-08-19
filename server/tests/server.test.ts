import { describe, expect, test } from 'bun:test';
import { server } from '../index';

describe('Server HTTP & WebSocket Endpoints', () => {
  test('serves health check on GET /health', async () => {
    const res = await fetch(`http://${server.hostname}:${server.port}/health`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.service).toBe('tesserae-collaboration-server');
    expect(typeof json.uptime).toBe('number');
  });

  test('lists active rooms on GET /api/rooms', async () => {
    const res = await fetch(`http://${server.hostname}:${server.port}/api/rooms`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(Array.isArray(json.rooms)).toBe(true);
  });

  test('connects via WebSocket, receives snapshot, and syncs edits', async () => {
    const roomId = `test-e2e-${Date.now()}`;
    const wsUrl = `ws://${server.hostname}:${server.port}/ws/${roomId}`;

    const ws1 = new WebSocket(wsUrl);
    const ws1Messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws1.onopen = () => {};
      ws1.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        ws1Messages.push(msg);
        if (msg.type === 'SNAPSHOT') {
          resolve();
        }
      };
      ws1.onerror = (e) => reject(e);
    });

    expect(ws1Messages.length).toBeGreaterThan(0);
    const snapshot = ws1Messages[0];
    expect(snapshot.type).toBe('SNAPSHOT');
    expect(snapshot.roomId).toBe(roomId);
    expect(snapshot.scene.length).toBe(1);

    // Connect a second client
    const ws2 = new WebSocket(wsUrl);
    const ws2Messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws2.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        ws2Messages.push(msg);
        if (msg.type === 'SNAPSHOT') {
          resolve();
        }
      };
      ws2.onerror = (e) => reject(e);
    });

    // Client 1 sends an op
    const updateOp = {
      type: 'OP',
      op: {
        type: 'UPDATE_TRANSFORM',
        payload: {
          nodeId: 2,
          property: 'position',
          value: [3, 4, 5],
        },
      },
    };

    const client2ReceivedOpPromise = new Promise<any>((resolve) => {
      ws2.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'OP') {
          resolve(msg);
        }
      };
    });

    ws1.send(JSON.stringify(updateOp));

    const confirmedOp = await client2ReceivedOpPromise;
    expect(confirmedOp.type).toBe('OP');
    expect(confirmedOp.seqNum).toBe(1);
    expect(confirmedOp.payload.nodeId).toBe(2);
    expect(confirmedOp.payload.property).toBe('position');
    expect(confirmedOp.payload.value).toEqual([3, 4, 5]);

    ws1.close();
    ws2.close();
  });
});
