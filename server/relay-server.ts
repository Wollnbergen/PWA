/**
 * Sultan WalletLink Relay Server
 * 
 * A simple WebSocket relay server that connects mobile wallets to desktop dApps.
 * This server doesn't decrypt any messages - it just routes encrypted messages
 * between peers in the same session.
 * 
 * Production deployment:
 * - Deploy behind HTTPS/WSS terminator (nginx, cloudflare)
 * - Add rate limiting
 * - Add session cleanup (memory management)
 * - Add metrics/monitoring
 * 
 * Run: npx ts-node relay-server.ts
 * Or:  node relay-server.js
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = parseInt(process.env.PORT || '8765', 10);
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface Session {
  id: string;
  dapp: WebSocket | null;
  wallet: WebSocket | null;
  createdAt: number;
  lastActivity: number;
}

// Active sessions
const sessions = new Map<string, Session>();

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      sessions: sessions.size,
      uptime: process.uptime()
    }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

console.log(`[Relay] Starting WalletLink relay server on port ${PORT}...`);

wss.on('connection', (ws: WebSocket) => {
  let sessionId: string | null = null;
  let role: 'dapp' | 'wallet' | null = null;

  console.log('[Relay] New connection');

  ws.on('message', (data: Buffer) => {
    try {
      // Messages are encrypted, but we can still parse the outer envelope
      // For routing, we need sessionId which is sent in plaintext
      const message = JSON.parse(data.toString());
      
      if (!message.sessionId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Missing sessionId' } }));
        return;
      }

      sessionId = message.sessionId;

      switch (message.type) {
        case 'session_init':
          handleSessionInit(ws, sessionId, message);
          role = 'dapp';
          break;

        case 'session_join':
          handleSessionJoin(ws, sessionId, message);
          role = 'wallet';
          break;

        case 'session_end':
          handleSessionEnd(sessionId);
          break;

        case 'heartbeat':
          handleHeartbeat(sessionId);
          break;

        default:
          // Relay all other messages to the peer
          relayMessage(sessionId, role, data.toString());
      }
    } catch (e) {
      console.error('[Relay] Message parse error:', e);
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
    }
  });

  ws.on('close', () => {
    console.log(`[Relay] Connection closed (session: ${sessionId}, role: ${role})`);
    
    if (sessionId && role) {
      const session = sessions.get(sessionId);
      if (session) {
        if (role === 'dapp') {
          session.dapp = null;
          // Notify wallet that dApp disconnected
          if (session.wallet?.readyState === WebSocket.OPEN) {
            session.wallet.send(JSON.stringify({
              type: 'session_end',
              sessionId,
              payload: { reason: 'dApp disconnected' },
              timestamp: Date.now()
            }));
          }
        } else if (role === 'wallet') {
          session.wallet = null;
          // Notify dApp that wallet disconnected
          if (session.dapp?.readyState === WebSocket.OPEN) {
            session.dapp.send(JSON.stringify({
              type: 'session_end',
              sessionId,
              payload: { reason: 'Wallet disconnected' },
              timestamp: Date.now()
            }));
          }
        }

        // Clean up empty sessions
        if (!session.dapp && !session.wallet) {
          sessions.delete(sessionId);
          console.log(`[Relay] Session ${sessionId} cleaned up`);
        }
      }
    }
  });

  ws.on('error', (error) => {
    console.error('[Relay] WebSocket error:', error);
  });
});

/**
 * Handle dApp creating a new session
 */
function handleSessionInit(ws: WebSocket, sessionId: string, message: any) {
  if (sessions.has(sessionId)) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      payload: { message: 'Session already exists' } 
    }));
    return;
  }

  const session: Session = {
    id: sessionId,
    dapp: ws,
    wallet: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  sessions.set(sessionId, session);
  console.log(`[Relay] Session created: ${sessionId}`);

  // Acknowledge session creation
  ws.send(JSON.stringify({
    type: 'session_ack',
    sessionId,
    payload: { created: true },
    timestamp: Date.now()
  }));
}

/**
 * Handle wallet joining an existing session
 */
function handleSessionJoin(ws: WebSocket, sessionId: string, message: any) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      payload: { message: 'Session not found' } 
    }));
    return;
  }

  if (session.wallet) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      payload: { message: 'Session already has a wallet connected' } 
    }));
    return;
  }

  session.wallet = ws;
  session.lastActivity = Date.now();
  console.log(`[Relay] Wallet joined session: ${sessionId}`);

  // Acknowledge join
  ws.send(JSON.stringify({
    type: 'session_ack',
    sessionId,
    payload: { joined: true },
    timestamp: Date.now()
  }));

  // Notify dApp that wallet connected
  if (session.dapp?.readyState === WebSocket.OPEN) {
    session.dapp.send(JSON.stringify({
      type: 'session_ack',
      sessionId,
      payload: { walletConnected: true },
      timestamp: Date.now()
    }));
  }
}

/**
 * Handle session end
 */
function handleSessionEnd(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Notify both parties
  const endMessage = JSON.stringify({
    type: 'session_end',
    sessionId,
    payload: {},
    timestamp: Date.now()
  });

  if (session.dapp?.readyState === WebSocket.OPEN) {
    session.dapp.send(endMessage);
  }
  if (session.wallet?.readyState === WebSocket.OPEN) {
    session.wallet.send(endMessage);
  }

  sessions.delete(sessionId);
  console.log(`[Relay] Session ended: ${sessionId}`);
}

/**
 * Handle heartbeat
 */
function handleHeartbeat(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

/**
 * Relay message to the peer
 */
function relayMessage(sessionId: string, senderRole: 'dapp' | 'wallet' | null, message: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`[Relay] Session not found for relay: ${sessionId}`);
    return;
  }

  session.lastActivity = Date.now();

  // Route to the other party
  if (senderRole === 'dapp' && session.wallet?.readyState === WebSocket.OPEN) {
    session.wallet.send(message);
  } else if (senderRole === 'wallet' && session.dapp?.readyState === WebSocket.OPEN) {
    session.dapp.send(message);
  }
}

/**
 * Clean up stale sessions periodically
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      // Send end notification
      const endMessage = JSON.stringify({
        type: 'session_end',
        sessionId,
        payload: { reason: 'Session timeout' },
        timestamp: now
      });

      if (session.dapp?.readyState === WebSocket.OPEN) {
        session.dapp.send(endMessage);
        session.dapp.close();
      }
      if (session.wallet?.readyState === WebSocket.OPEN) {
        session.wallet.send(endMessage);
        session.wallet.close();
      }

      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Relay] Cleaned up ${cleaned} stale sessions`);
  }
}, 60000); // Check every minute

// Start server
server.listen(PORT, () => {
  console.log(`[Relay] WalletLink relay server running on ws://localhost:${PORT}`);
  console.log(`[Relay] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Relay] Shutting down...');
  
  // Close all sessions
  for (const [sessionId, session] of sessions) {
    const endMessage = JSON.stringify({
      type: 'session_end',
      sessionId,
      payload: { reason: 'Server shutdown' },
      timestamp: Date.now()
    });

    if (session.dapp?.readyState === WebSocket.OPEN) {
      session.dapp.send(endMessage);
      session.dapp.close();
    }
    if (session.wallet?.readyState === WebSocket.OPEN) {
      session.wallet.send(endMessage);
      session.wallet.close();
    }
  }

  wss.close(() => {
    server.close(() => {
      console.log('[Relay] Server closed');
      process.exit(0);
    });
  });
});
