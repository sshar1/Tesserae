import { Room, ClientData } from './room';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// In-memory room registry
const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
    console.log(`[Room] Created new room: ${roomId}`);
  }
  return room;
}

const server = Bun.serve<ClientData>({
  port: PORT,
  hostname: HOST,

  fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // CORS preflight headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (pathname === '/health') {
      let totalClients = 0;
      for (const room of rooms.values()) {
        totalClients += room.getClientCount();
      }
      return Response.json(
        {
          status: 'ok',
          service: 'tesserae-collaboration-server',
          uptime: process.uptime(),
          rooms: rooms.size,
          totalClients,
          timestamp: new Date().toISOString(),
        },
        { headers: corsHeaders }
      );
    }

    // List rooms endpoint
    if (pathname === '/api/rooms') {
      const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        clients: room.getClientCount(),
        seqNum: room.getSeqNum(),
      }));
      return Response.json({ rooms: roomList }, { headers: corsHeaders });
    }

    // WebSocket upgrade endpoint
    // Supports /ws, /ws/:roomId, /room/:roomId, or ?room=roomId
    const isWsPath =
      pathname === '/ws' ||
      pathname.startsWith('/ws/') ||
      pathname.startsWith('/room/');

    if (isWsPath || req.headers.get('upgrade') === 'websocket') {
      // Determine roomId from path or query
      let roomId = 'default';
      if (pathname.startsWith('/ws/')) {
        roomId = pathname.slice('/ws/'.length);
      } else if (pathname.startsWith('/room/')) {
        roomId = pathname.slice('/room/'.length);
      } else if (url.searchParams.has('room')) {
        roomId = url.searchParams.get('room') || 'default';
      }

      const room = getOrCreateRoom(roomId);
      const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
      const color = room.assignPeerColor();

      const clientData: ClientData = {
        roomId,
        clientId,
        color,
        selectedNodeId: -1,
        gizmoMode: 1,
        joinedAt: Date.now(),
      };

      const upgraded = server.upgrade(req, {
        data: clientData,
      });

      if (upgraded) {
        return undefined;
      }

      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    return new Response('Tesserae Collaboration Server is running.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  },

  websocket: {
    open(ws) {
      const room = getOrCreateRoom(ws.data.roomId);
      room.addClient(ws);
      console.log(
        `[Client Connected] Room: ${ws.data.roomId} | Client: ${ws.data.clientId} | Color: ${ws.data.color}`
      );
    },

    message(ws, message) {
      const room = rooms.get(ws.data.roomId);
      if (!room) return;
      room.handleMessage(ws, message);
    },

    close(ws, code, reason) {
      const room = rooms.get(ws.data.roomId);
      if (room) {
        room.removeClient(ws.data.clientId);
        console.log(
          `[Client Disconnected] Room: ${ws.data.roomId} | Client: ${ws.data.clientId} | Code: ${code}`
        );

        // Optional: clean up empty room after idle time
        if (room.getClientCount() === 0 && room.id !== 'default') {
          rooms.delete(room.id);
          console.log(`[Room Deleted] Cleaned up empty room: ${room.id}`);
        }
      }
    },

    error(ws, error) {
      console.error(`[WebSocket Error] Client: ${ws.data.clientId}:`, error);
    },
  },
});

console.log(`🚀 Tesserae Collaboration Server running at http://${HOST}:${PORT}`);
console.log(`📡 WebSocket endpoint ready at ws://${HOST}:${PORT}/ws`);

export { server, rooms, getOrCreateRoom };
