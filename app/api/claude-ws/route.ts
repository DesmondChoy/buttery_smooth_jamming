import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { NextResponse } from 'next/server';
import {
  ClaudeProcess,
  ClaudeMessage,
  ContentBlock,
} from '@/lib/claude-process';
import { AgentProcessManager } from '@/lib/agent-process-manager';

// Required GET export for next-ws to recognize this as a WebSocket route
export function GET() {
  // This should never be called - next-ws intercepts WebSocket upgrades
  return NextResponse.json({ error: 'WebSocket endpoint' }, { status: 400 });
}

// Store active Claude processes per client
const clientProcesses = new Map<WebSocket, ClaudeProcess>();

// Store agent process managers per client (for jam sessions)
const agentManagers = new Map<WebSocket, AgentProcessManager>();

// Per-client timing for latency measurement
const directiveTimers = new Map<WebSocket, { start: number; lastEvent: number; events: string[] }>();

function logTiming(client: WebSocket, event: string): void {
  const timer = directiveTimers.get(client);
  if (!timer) return;
  const now = Date.now();
  const elapsed = now - timer.start;
  const delta = now - timer.lastEvent;
  timer.lastEvent = now;
  timer.events.push(`+${elapsed}ms (Δ${delta}ms) ${event}`);
  console.log(`[TIMING] +${elapsed}ms (Δ${delta}ms) ${event}`);
}

function startTimer(client: WebSocket, label: string): void {
  const now = Date.now();
  directiveTimers.set(client, { start: now, lastEvent: now, events: [`0ms ${label}`] });
  console.log(`[TIMING] 0ms ${label}`);
}

function endTimer(client: WebSocket): void {
  const timer = directiveTimers.get(client);
  if (!timer) return;
  const total = Date.now() - timer.start;
  console.log(`[TIMING] === TOTAL: ${total}ms ===`);
  console.log(`[TIMING] Events:\n${timer.events.join('\n')}`);
  directiveTimers.delete(client);
}


// Message types for browser <-> server communication
interface BrowserMessage {
  type: 'user_input' | 'stop' | 'ping' | 'jam_tick' | 'boss_directive' | 'stop_jam';
  text?: string;
  round?: number;
  activeAgents?: string[];
  targetAgent?: string;
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
      logTiming(client, `result (turn complete, cost=$${msg.cost_usd?.toFixed(4) ?? '?'}, duration=${msg.duration_ms ?? '?'}ms)`);
      endTimer(client);
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
        logTiming(client, `text: "${block.text.substring(0, 80)}${block.text.length > 80 ? '...' : ''}"`);
        sendToClient(client, {
          type: 'text',
          text: block.text,
        });
      }
      break;

    case 'tool_use':
      logTiming(client, `tool_use: ${block.name}(${JSON.stringify(block.input).substring(0, 100)})`);
      sendToClient(client, {
        type: 'tool_use',
        toolName: block.name,
        toolInput: block.input,
      });
      break;

    case 'tool_result':
      logTiming(client, `tool_result: ${String(block.text || '').substring(0, 100)}`);
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

  client.on('message', async (data) => {
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

        case 'jam_tick': {
          // Jam start — create AgentProcessManager and spawn per-agent processes
          const agents = message.activeAgents || [];
          startTimer(client, `JAM_START (agents: ${agents.join(', ')})`);
          sendToClient(client, { type: 'status', status: 'thinking' });

          // Stop any existing manager for this client
          const existingManager = agentManagers.get(client);
          if (existingManager) {
            await existingManager.stop();
            agentManagers.delete(client);
          }

          // Broadcast callback sends jam messages directly to the browser client
          // The browser's useClaudeTerminal hook forwards these to useJamSession handlers
          const broadcastToClient = (message: { type: string; payload: unknown }) => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(JSON.stringify(message));
            }
          };
          const manager = new AgentProcessManager({ workingDir, broadcast: broadcastToClient });
          agentManagers.set(client, manager);

          manager.start(agents).then(() => {
            endTimer(client);
            sendToClient(client, { type: 'status', status: 'done' });
          }).catch((error) => {
            console.error('[Claude WS] AgentProcessManager start failed:', error);
            endTimer(client);
            sendToClient(client, {
              type: 'error',
              error: `Failed to start jam: ${error.message}`,
            });
          });
          break;
        }

        case 'boss_directive': {
          const text = message.text;
          const manager = agentManagers.get(client);
          if (text && manager) {
            startTimer(client, `BOSS_DIRECTIVE: "${text.substring(0, 50)}" (target: ${message.targetAgent || 'all'})`);
            sendToClient(client, { type: 'status', status: 'thinking' });

            manager.handleDirective(text, message.targetAgent, message.activeAgents || []).then(() => {
              endTimer(client);
              sendToClient(client, { type: 'status', status: 'done' });
            }).catch((error) => {
              console.error('[Claude WS] Directive failed:', error);
              endTimer(client);
              sendToClient(client, {
                type: 'error',
                error: `Directive failed: ${error.message}`,
              });
            });
          } else if (!manager) {
            sendToClient(client, {
              type: 'error',
              error: 'No active jam session for boss directive.',
            });
          }
          break;
        }

        case 'stop_jam': {
          const jamManager = agentManagers.get(client);
          if (jamManager) {
            console.log(`[Claude WS] Stopping jam for client #${clientIds.get(client) || '?'}`);
            await jamManager.stop();
            agentManagers.delete(client);
          }
          sendToClient(client, { type: 'status', status: 'done' });
          break;
        }

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

    // Clean up agent process manager if active
    const jamManager = agentManagers.get(client);
    if (jamManager) {
      console.log(`[Claude WS] Stopping agent manager for client #${cid}`);
      await jamManager.stop();
      agentManagers.delete(client);
    }

    clientIds.delete(client);
  });

  client.on('error', (error) => {
    console.error('[Claude WS] WebSocket error:', error);
  });
}
