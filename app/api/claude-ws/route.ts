import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { NextResponse } from 'next/server';
import {
  ClaudeProcess,
  ClaudeMessage,
  ContentBlock,
} from '@/lib/claude-process';

// Required GET export for next-ws to recognize this as a WebSocket route
export function GET() {
  // This should never be called - next-ws intercepts WebSocket upgrades
  return NextResponse.json({ error: 'WebSocket endpoint' }, { status: 400 });
}

// Store active Claude processes per client
const clientProcesses = new Map<WebSocket, ClaudeProcess>();


// Message types for browser <-> server communication
interface BrowserMessage {
  type: 'user_input' | 'stop' | 'ping';
  text?: string;
}

interface ServerMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error' | 'pong';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  status?: 'connecting' | 'ready' | 'thinking' | 'done';
  error?: string;
}

function sendToClient(client: WebSocket, msg: ServerMessage): void {
  if (client.readyState === 1) { // WebSocket.OPEN
    client.send(JSON.stringify(msg));
  }
}

async function startClaudeForClient(
  client: WebSocket,
  workingDir: string,
  wsUrl?: string
): Promise<ClaudeProcess> {
  const claudeProcess = new ClaudeProcess({
    workingDir,
    wsUrl,
    onMessage: (msg: ClaudeMessage) => {
      handleClaudeMessage(client, msg);
    },
    onError: (error) => {
      sendToClient(client, {
        type: 'error',
        error: `Claude process error: ${error.message}`,
      });
    },
    onExit: (code) => {
      sendToClient(client, {
        type: 'status',
        status: 'done',
        text: `Claude process exited with code ${code}`,
      });
      clientProcesses.delete(client);
    },
    onReady: () => {
      sendToClient(client, {
        type: 'status',
        status: 'ready',
      });
    },
  });

  await claudeProcess.start();
  clientProcesses.set(client, claudeProcess);
  return claudeProcess;
}

function handleClaudeMessage(client: WebSocket, msg: ClaudeMessage): void {
  switch (msg.type) {
    case 'assistant':
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          handleContentBlock(client, block);
        }
      }
      break;

    case 'system':
      // System messages (init, etc.) - could show status
      if (msg.subtype === 'init') {
        sendToClient(client, {
          type: 'status',
          status: 'ready',
        });
      }
      break;

    case 'result':
      // Final result of a conversation turn
      sendToClient(client, {
        type: 'status',
        status: 'done',
      });
      break;
  }
}

function handleContentBlock(client: WebSocket, block: ContentBlock): void {
  switch (block.type) {
    case 'text':
      if (block.text) {
        sendToClient(client, {
          type: 'text',
          text: block.text,
        });
      }
      break;

    case 'tool_use':
      sendToClient(client, {
        type: 'tool_use',
        toolName: block.name,
        toolInput: block.input,
      });
      break;

    case 'tool_result':
      sendToClient(client, {
        type: 'tool_result',
        text: String(block.text || ''),
      });
      break;
  }
}

// Pending process starts - allows cancellation if client disconnects quickly
const pendingStarts = new Map<WebSocket, NodeJS.Timeout>();
let clientCounter = 0;
const clientIds = new Map<WebSocket, number>();

export function SOCKET(
  client: WebSocket,
  request: IncomingMessage,
  server: WebSocketServer
) {
  const clientId = ++clientCounter;
  clientIds.set(client, clientId);
  console.log(`[Claude WS] Client #${clientId} connected, total: ${server.clients.size}`);

  // Send initial connecting status
  sendToClient(client, {
    type: 'status',
    status: 'connecting',
  });

  // Get the working directory from environment or use current
  const workingDir = process.cwd();

  // Extract port from Host header to pass to MCP server
  const host = request.headers.host || 'localhost:3000';
  const wsUrl = `ws://${host}/api/ws`;
  console.log(`[Claude WS] Using WebSocket URL: ${wsUrl}`);

  // Delay process start to survive React StrictMode's quick unmount cycle
  // This prevents starting a process for the first mount that immediately unmounts
  const startDelay = setTimeout(() => {
    pendingStarts.delete(client);
    // Double-check client is still connected
    if (client.readyState !== 1) { // WebSocket.OPEN
      console.log(`[Claude WS] Client #${clientId} already closed before process start`);
      return;
    }
    console.log(`[Claude WS] Starting Claude process for client #${clientId}`);
    startClaudeForClient(client, workingDir, wsUrl).catch((error) => {
      console.error('[Claude WS] Failed to start Claude:', error);
      sendToClient(client, {
        type: 'error',
        error: `Failed to start Claude: ${error.message}`,
      });
    });
  }, 100);

  pendingStarts.set(client, startDelay);

  client.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as BrowserMessage;
      const claudeProcess = clientProcesses.get(client);

      switch (message.type) {
        case 'user_input':
          if (message.text && claudeProcess?.isRunning()) {
            sendToClient(client, {
              type: 'status',
              status: 'thinking',
            });
            claudeProcess.sendUserMessage(message.text);
          } else if (!claudeProcess?.isRunning()) {
            sendToClient(client, {
              type: 'error',
              error: 'Claude process not running. Reconnecting...',
            });
            // Try to restart
            startClaudeForClient(client, workingDir, wsUrl).then(() => {
              if (message.text) {
                const newProcess = clientProcesses.get(client);
                newProcess?.sendUserMessage(message.text);
              }
            }).catch((error) => {
              sendToClient(client, {
                type: 'error',
                error: `Failed to restart Claude: ${error.message}`,
              });
            });
          }
          break;

        case 'stop':
          claudeProcess?.stop();
          break;

        case 'ping':
          sendToClient(client, { type: 'pong' });
          break;
      }
    } catch (error) {
      console.error('[Claude WS] Failed to parse message:', error);
    }
  });

  client.on('close', async () => {
    const cid = clientIds.get(client) || '?';
    console.log(`[Claude WS] Client #${cid} disconnected, remaining: ${server.clients.size}`);

    // Cancel pending process start if client disconnected quickly (StrictMode)
    const pendingStart = pendingStarts.get(client);
    if (pendingStart) {
      clearTimeout(pendingStart);
      pendingStarts.delete(client);
      console.log(`[Claude WS] Client #${cid} cancelled pending process start (StrictMode unmount)`);
      clientIds.delete(client);
      return;
    }

    const claudeProcess = clientProcesses.get(client);
    if (claudeProcess) {
      console.log(`[Claude WS] Stopping Claude process for client #${cid}`);
      await claudeProcess.stop();
      clientProcesses.delete(client);
    }
    clientIds.delete(client);
  });

  client.on('error', (error) => {
    console.error('[Claude WS] WebSocket error:', error);
  });
}
