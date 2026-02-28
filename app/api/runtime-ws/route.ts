import type { IncomingMessage } from 'http';
import { TLSSocket } from 'tls';
import { NextResponse } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';
import { AgentProcessManager } from '@/lib/agent-process-manager';
import { evaluate_jam_admission } from '@/lib/jam-admission';
import { createNormalRuntimeProcess } from '@/lib/runtime-factory';
import type { RuntimeEvent, RuntimeProcess } from '@/lib/runtime-process';
import {
  apply_camera_sample_freshness,
  build_conductor_interpretation_result,
  interpretCameraDirective,
  normalize_camera_directive_payload,
} from '@/lib/camera-directive-interpreter';
import type {
  AudioFeatureSnapshot,
  CameraDirectivePayload,
  ConductorInterpreterResult,
} from '@/lib/types';

// Required GET export for next-ws to recognize this as a WebSocket route
export function GET() {
  // This should never be called - next-ws intercepts WebSocket upgrades
  return NextResponse.json({ error: 'WebSocket endpoint' }, { status: 400 });
}

// Store active runtime processes per client
const clientProcesses = new Map<WebSocket, RuntimeProcess>();

// Store agent process managers per client (for jam sessions)
const agentManagers = new Map<WebSocket, AgentProcessManager>();
const pendingJamStarts = new Map<WebSocket, Promise<void>>();
const contextInspectorEnabledByClient = new Map<WebSocket, boolean>();

const MAX_CONCURRENT_JAMS = getPositiveInt(process.env.MAX_CONCURRENT_JAMS, 1);
const MAX_TOTAL_AGENT_PROCESSES = getPositiveInt(process.env.MAX_TOTAL_AGENT_PROCESSES, 4);
const CAMERA_SAMPLE_MAX_AGE_MS = getPositiveInt(process.env.CAMERA_SAMPLE_MAX_AGE_MS, 5_000);
const CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS = getPositiveInt(process.env.CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS, 1_500);

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
  type:
    | 'user_input'
    | 'stop'
    | 'ping'
    | 'start_jam'
    | 'set_jam_preset'
    | 'boss_directive'
    | 'camera_directive'
    | 'stop_jam'
    | 'audio_feedback'
    | 'set_context_inspector';
  text?: string;
  activeAgents?: string[];
  targetAgent?: string;
  presetId?: string;
  enabled?: boolean;
  payload?: AudioFeatureSnapshot;
  // Vision capture payload from browser camera hook.
  visionPayload?: CameraDirectivePayload;
}

interface ServerMessage {
  type:
    | 'text'
    | 'tool_use'
    | 'tool_result'
    | 'status'
    | 'error'
    | 'pong'
    | 'conductor_intent';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  payload?: unknown;
  status?: 'connecting' | 'ready' | 'thinking' | 'done';
  error?: string;
  code?: 'jam_capacity_exceeded' | 'agent_capacity_exceeded';
  details?: unknown;
}

function sendToClient(client: WebSocket, msg: ServerMessage): void {
  if (client.readyState === 1) { // WebSocket.OPEN
    client.send(JSON.stringify(msg));
  }
}

function sendErrorToClient(
  client: WebSocket,
  error: string,
  code?: ServerMessage['code'],
  details?: unknown
): void {
  sendToClient(client, {
    type: 'error',
    error,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}

function getPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getIncomingRequestWsProtocol(request: IncomingMessage): 'ws' | 'wss' {
  const forwardedRaw = request.headers['x-forwarded-proto'];
  const forwarded = Array.isArray(forwardedRaw) ? forwardedRaw[0] : forwardedRaw;
  if (forwarded) {
    const lower = forwarded.toLowerCase();
    if (lower.startsWith('https')) return 'wss';
    if (lower.startsWith('http')) return 'ws';
  }

  return request.socket instanceof TLSSocket ? 'wss' : 'ws';
}

function getActiveAgentCount(manager: AgentProcessManager): number {
  return manager.getJamStateSnapshot().activeAgents.length;
}

function countActiveAgentProcesses(): number {
  return Array.from(agentManagers.values()).reduce((total, manager) => {
    return total + getActiveAgentCount(manager);
  }, 0);
}

async function awaitPendingJamStart(client: WebSocket): Promise<void> {
  const pendingStart = pendingJamStarts.get(client);
  if (!pendingStart) return;
  await pendingStart;
}

async function startRuntimeForClient(
  client: WebSocket,
  workingDir: string,
  wsUrl?: string
): Promise<RuntimeProcess> {
  const runtimeProcess = createNormalRuntimeProcess({
    workingDir,
    wsUrl,
    onEvent: (event: RuntimeEvent) => {
      handleRuntimeEvent(client, event);
    },
    onError: (error) => {
      sendToClient(client, {
        type: 'error',
        error: `Runtime process error: ${error.message}`,
      });
    },
    onExit: (code) => {
      sendToClient(client, {
        type: 'status',
        status: 'done',
        text: `Runtime process exited with code ${code}`,
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

  await runtimeProcess.start();
  if (client.readyState !== 1) {
    await runtimeProcess.stop();
    return runtimeProcess;
  }

  clientProcesses.set(client, runtimeProcess);
  return runtimeProcess;
}

function handleRuntimeEvent(client: WebSocket, event: RuntimeEvent): void {
  switch (event.type) {
    case 'text':
      logTiming(client, `text: "${event.text.substring(0, 80)}${event.text.length > 80 ? '...' : ''}"`);
      sendToClient(client, {
        type: 'text',
        text: event.text,
      });
      break;

    case 'tool_use':
      logTiming(client, `tool_use: ${event.toolName}(${JSON.stringify(event.toolInput).substring(0, 100)})`);
      sendToClient(client, {
        type: 'tool_use',
        toolName: event.toolName,
        toolInput: event.toolInput,
      });
      break;

    case 'tool_result':
      logTiming(client, `tool_result: ${event.text.substring(0, 100)}`);
      sendToClient(client, {
        type: 'tool_result',
        text: event.text,
      });
      break;

    case 'status':
      if (event.status === 'done') {
        logTiming(
          client,
          `result (turn complete, cost=$${event.metrics?.cost_usd?.toFixed(4) ?? '?'}, duration=${event.metrics?.duration_ms ?? '?'}ms)`
        );
        endTimer(client);
      }

      sendToClient(client, {
        type: 'status',
        status: event.status,
        ...(event.text ? { text: event.text } : {}),
      });
      break;

    case 'error':
      sendToClient(client, {
        type: 'error',
        error: event.error,
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
  console.log(`[Runtime WS] Client #${clientId} connected, total: ${server.clients.size}`);
  contextInspectorEnabledByClient.set(client, true);

  // Send initial connecting status
  sendToClient(client, {
    type: 'status',
    status: 'connecting',
  });

  // Get the working directory from environment or use current
  const workingDir = process.cwd();

  // Extract port from Host header to pass to MCP server
  const host = request.headers.host || 'localhost:3000';
  const wsProtocol = getIncomingRequestWsProtocol(request);
  const wsUrl = `${wsProtocol}://${host}/api/ws`;
  console.log(`[Runtime WS] Using WebSocket URL: ${wsUrl}`);

  // Delay process start to survive React StrictMode's quick unmount cycle
  // This prevents starting a process for the first mount that immediately unmounts
  const startDelay = setTimeout(() => {
    pendingStarts.delete(client);
    // Double-check client is still connected
    if (client.readyState !== 1) { // WebSocket.OPEN
      console.log(`[Runtime WS] Client #${clientId} already closed before process start`);
      return;
    }
    console.log(`[Runtime WS] Starting runtime process for client #${clientId}`);
    startRuntimeForClient(client, workingDir, wsUrl).catch((error) => {
      console.error('[Runtime WS] Failed to start runtime:', error);
      sendToClient(client, {
        type: 'error',
        error: `Failed to start runtime: ${error.message}`,
      });
    });
  }, 100);

  pendingStarts.set(client, startDelay);

  client.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as BrowserMessage;
      const runtimeProcess = clientProcesses.get(client);

      switch (message.type) {
        case 'user_input':
          if (message.text && runtimeProcess?.isRunning()) {
            sendToClient(client, {
              type: 'status',
              status: 'thinking',
            });
            runtimeProcess.send(message.text);
          } else if (!runtimeProcess?.isRunning()) {
            sendToClient(client, {
              type: 'error',
              error: 'Runtime process not running. Reconnecting...',
            });
            // Try to restart
            startRuntimeForClient(client, workingDir, wsUrl).then(() => {
              if (message.text) {
                const newProcess = clientProcesses.get(client);
                newProcess?.send(message.text);
              }
            }).catch((error) => {
              sendErrorToClient(client, `Failed to restart runtime: ${error.message}`);
            });
          }
          break;

        case 'stop':
          runtimeProcess?.stop();
          break;

        case 'start_jam': {
          // Jam start — create AgentProcessManager and spawn per-agent processes
          const agents = message.activeAgents || [];

          if (agents.length === 0) {
            sendErrorToClient(client, 'Cannot start jam: select at least one agent.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          startTimer(client, `JAM_START (agents: ${agents.join(', ')})`);
          sendToClient(client, { type: 'status', status: 'thinking' });

          const existingManager = agentManagers.get(client);
          const existingClientAgents = existingManager ? getActiveAgentCount(existingManager) : 0;
          const activeJams = agentManagers.size;
          const activeAgentProcesses = countActiveAgentProcesses();

          const admission = evaluate_jam_admission({
            active_jams: activeJams,
            active_agent_processes: activeAgentProcesses,
            existing_client_agents: existingClientAgents,
            requested_agents: agents.length,
            max_concurrent_jams: MAX_CONCURRENT_JAMS,
            max_total_agent_processes: MAX_TOTAL_AGENT_PROCESSES,
          });

          if (!admission.allowed) {
            console.warn(
              `[Runtime WS] Jam start rejected: code=${admission.code}, ` +
              `active_jams=${admission.details.active_jams}, projected_jams=${admission.details.projected_jams}, ` +
              `active_agents=${admission.details.active_agent_processes}, projected_agents=${admission.details.projected_agent_processes}`
            );
            endTimer(client);
            sendErrorToClient(client, admission.message, admission.code, admission.details);
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          console.log(
            `[Runtime WS] Jam start admitted: active_jams=${admission.details.active_jams}, ` +
            `projected_jams=${admission.details.projected_jams}, active_agents=${admission.details.active_agent_processes}, ` +
            `projected_agents=${admission.details.projected_agent_processes}`
          );

          // Stop any existing manager for this client
          if (existingManager) {
            await existingManager.stop();
            agentManagers.delete(client);
          }

          // Broadcast callback sends jam messages directly to the browser client
          // The browser's useRuntimeTerminal hook forwards these to useJamSession handlers
          const broadcastToClient = (message: { type: string; payload: unknown }) => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(JSON.stringify(message));
            }
          };
          const manager = new AgentProcessManager({ workingDir, broadcast: broadcastToClient });
          manager.setContextInspectorEnabled(contextInspectorEnabledByClient.get(client) ?? true);
          agentManagers.set(client, manager);

          const startPromise = manager.start(agents, { mode: 'staged_silent' });
          pendingJamStarts.set(client, startPromise);

          startPromise.then(() => {
            endTimer(client);
            sendToClient(client, { type: 'status', status: 'done' });
          }).catch(async (error) => {
            console.error('[Runtime WS] AgentProcessManager start failed:', error);
            if (agentManagers.get(client) === manager) {
              try {
                await manager.stop();
              } catch (stopError) {
                console.error('[Runtime WS] Cleanup after start failure failed:', stopError);
              }
              agentManagers.delete(client);
            }
            endTimer(client);
            sendErrorToClient(client, `Failed to start jam: ${error.message}`);
            sendToClient(client, { type: 'status', status: 'done' });
          }).finally(() => {
            if (pendingJamStarts.get(client) === startPromise) {
              pendingJamStarts.delete(client);
            }
          });
          break;
        }

        case 'set_jam_preset': {
          if (!message.presetId) {
            sendErrorToClient(client, 'Missing jam preset id.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          try {
            await awaitPendingJamStart(client);
          } catch (error) {
            const err = error as Error;
            sendErrorToClient(client, `Cannot set jam preset before jam startup completes: ${err.message}`);
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          const manager = agentManagers.get(client);
          if (!manager) {
            sendErrorToClient(client, 'No active jam session for preset selection.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          startTimer(client, `SET_JAM_PRESET: ${message.presetId}`);
          sendToClient(client, { type: 'status', status: 'thinking' });

          manager.setJamPreset(message.presetId).then(() => {
            endTimer(client);
            sendToClient(client, { type: 'status', status: 'done' });
          }).catch((error) => {
            console.error('[Runtime WS] Set jam preset failed:', error);
            endTimer(client);
            sendErrorToClient(client, `Failed to set jam preset: ${error.message}`);
            sendToClient(client, { type: 'status', status: 'done' });
          });
          break;
        }

        case 'boss_directive': {
          const text = message.text;
          if (text) {
            try {
              await awaitPendingJamStart(client);
            } catch (error) {
              const err = error as Error;
              sendErrorToClient(client, `Cannot send directive before jam startup completes: ${err.message}`);
              sendToClient(client, { type: 'status', status: 'done' });
              break;
            }

            const manager = agentManagers.get(client);
            if (!manager) {
              sendErrorToClient(client, 'No active jam session for boss directive.');
              sendToClient(client, { type: 'status', status: 'done' });
              break;
            }

            startTimer(client, `BOSS_DIRECTIVE: "${text.substring(0, 50)}" (target: ${message.targetAgent || 'all'})`);
            sendToClient(client, { type: 'status', status: 'thinking' });

            manager.handleDirective(text, message.targetAgent, message.activeAgents || []).then(() => {
              endTimer(client);
              sendToClient(client, { type: 'status', status: 'done' });
            }).catch((error) => {
              console.error('[Runtime WS] Directive failed:', error);
              endTimer(client);
              sendErrorToClient(client, `Directive failed: ${error.message}`);
              sendToClient(client, { type: 'status', status: 'done' });
            });
          } else {
            sendErrorToClient(client, 'Cannot send empty boss directive.');
            sendToClient(client, { type: 'status', status: 'done' });
          }
          break;
        }

        case 'camera_directive': {
          const messagePayload = message.visionPayload;
          if (!messagePayload) {
            sendToClient(client, {
              type: 'conductor_intent',
              payload: {
                accepted: false,
                confidence: 0,
                reason: 'invalid_request',
                explicit_target: null,
                rejected_reason: 'Missing camera vision payload.',
              } satisfies ConductorInterpreterResult,
            });
            sendErrorToClient(client, 'Missing camera vision payload.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          const sample = normalize_camera_directive_payload(messagePayload);
          if (!sample) {
            sendToClient(client, {
              type: 'conductor_intent',
              payload: {
                accepted: false,
                confidence: 0,
                reason: 'invalid_payload',
                explicit_target: null,
                rejected_reason: 'Invalid camera vision payload.',
              } satisfies ConductorInterpreterResult,
            });
            sendErrorToClient(client, 'Invalid camera vision payload.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }
          const freshnessCheckedSample = apply_camera_sample_freshness(sample, {
            maxAgeMs: CAMERA_SAMPLE_MAX_AGE_MS,
            maxFutureSkewMs: CAMERA_SAMPLE_MAX_FUTURE_SKEW_MS,
          });

          try {
            await awaitPendingJamStart(client);
          } catch (error) {
            const err = error as Error;
            sendErrorToClient(client, `Cannot send camera cue before jam startup completes: ${err.message}`);
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          const manager = agentManagers.get(client);
          if (!manager) {
            sendToClient(client, {
              type: 'conductor_intent',
              payload: {
                accepted: false,
                confidence: 0,
                reason: 'invalid_request',
                explicit_target: null,
                rejected_reason: 'No active jam session for camera cue.',
              } satisfies ConductorInterpreterResult,
            });
            sendErrorToClient(client, 'No active jam session for camera cue.');
            sendToClient(client, { type: 'status', status: 'done' });
            break;
          }

          startTimer(client, 'CAMERA_DIRECTIVE interpretation');
          sendToClient(client, { type: 'status', status: 'thinking' });

          try {
            const interpretation = await interpretCameraDirective(workingDir, freshnessCheckedSample)
              .catch((error) => ({
                interpretation: null,
                diagnostics: {
                  model_exit_code: null,
                  parse_error: error instanceof Error ? error.message : 'Interpreter execution failed.',
                },
              }));
            const interpreted = build_conductor_interpretation_result(
              interpretation.interpretation,
              'interpreted',
              interpretation.diagnostics
            );
            if (!interpreted.accepted || !interpreted.interpretation?.directive.trim()) {
              sendToClient(client, { type: 'conductor_intent', payload: interpreted });
              endTimer(client);
              sendToClient(client, { type: 'status', status: 'done' });
              break;
            }

            const jamState = manager.getJamStateSnapshot();
            if (jamState.activatedAgents.length === 0) {
              sendToClient(client, {
                type: 'conductor_intent',
                payload: {
                  accepted: false,
                  confidence: interpreted.confidence,
                  reason: 'activation_required',
                  explicit_target: null,
                  interpretation: interpreted.interpretation,
                  rejected_reason: 'Camera cue blocked: activate at least one agent with a boss @mention first.',
                  diagnostics: interpreted.diagnostics,
                } satisfies ConductorInterpreterResult,
              });
              endTimer(client);
              sendToClient(client, { type: 'status', status: 'done' });
              break;
            }

            const broadcastConductorIntent: ConductorInterpreterResult = {
              ...interpreted,
              explicit_target: null,
              interpretation: interpreted.interpretation
                ? {
                    directive: interpreted.interpretation.directive,
                    ...(interpreted.interpretation.rationale
                      ? { rationale: interpreted.interpretation.rationale }
                      : {}),
                  }
                : interpreted.interpretation,
            };
            sendToClient(client, { type: 'conductor_intent', payload: broadcastConductorIntent });
            await manager.handleDirective(
              interpreted.interpretation.directive,
              undefined,
              message.activeAgents || [],
              { routingScope: 'all_selected' }
            );
            endTimer(client);
            sendToClient(client, { type: 'status', status: 'done' });
          } catch (error) {
            const err = error as Error;
            endTimer(client);
            console.error('[Runtime WS] Camera directive interpretation failed:', err);
            sendToClient(client, {
              type: 'conductor_intent',
              payload: {
                accepted: false,
                confidence: 0,
                reason: 'model_execution_failure',
                explicit_target: null,
                rejected_reason: err.message || 'Camera directive request failed.',
              } satisfies ConductorInterpreterResult,
            });
            sendErrorToClient(client, `Camera directive failed: ${err.message}`);
            sendToClient(client, { type: 'status', status: 'done' });
          }
          break;
        }

        case 'stop_jam': {
          pendingJamStarts.delete(client);
          const jamManager = agentManagers.get(client);
          if (jamManager) {
            console.log(`[Runtime WS] Stopping jam for client #${clientIds.get(client) || '?'}`);
            await jamManager.stop();
            agentManagers.delete(client);
          }
          sendToClient(client, { type: 'status', status: 'done' });
          break;
        }

        case 'ping':
          sendToClient(client, { type: 'pong' });
          break;

        case 'audio_feedback': {
          if (!message.payload) break;
          if (!agentManagers.get(client)) break;

          const manager = agentManagers.get(client);
          if (!manager) break;

          const candidate = message.payload as AudioFeatureSnapshot;
          manager.handleAudioFeedback(candidate);
          break;
        }

        case 'set_context_inspector': {
          const enabled = Boolean(message.enabled);
          contextInspectorEnabledByClient.set(client, enabled);
          const manager = agentManagers.get(client);
          manager?.setContextInspectorEnabled(enabled);
          break;
        }
      }
    } catch (error) {
      console.error('[Runtime WS] Failed to parse message:', error);
    }
  });

  client.on('close', async () => {
    const cid = clientIds.get(client) || '?';
    console.log(`[Runtime WS] Client #${cid} disconnected, remaining: ${server.clients.size}`);

    // Cancel pending process start if client disconnected quickly (StrictMode)
    const pendingStart = pendingStarts.get(client);
    if (pendingStart) {
      clearTimeout(pendingStart);
      pendingStarts.delete(client);
      console.log(`[Runtime WS] Client #${cid} cancelled pending process start (StrictMode unmount)`);
      contextInspectorEnabledByClient.delete(client);
      clientIds.delete(client);
      return;
    }

    const runtimeProcess = clientProcesses.get(client);
    if (runtimeProcess) {
      console.log(`[Runtime WS] Stopping runtime process for client #${cid}`);
      await runtimeProcess.stop();
      clientProcesses.delete(client);
    }

    // Clean up agent process manager if active
    const jamManager = agentManagers.get(client);
    if (jamManager) {
      console.log(`[Runtime WS] Stopping agent manager for client #${cid}`);
      await jamManager.stop();
      agentManagers.delete(client);
    }

    pendingJamStarts.delete(client);
    contextInspectorEnabledByClient.delete(client);

    clientIds.delete(client);
  });

  client.on('error', (error) => {
    console.error('[Runtime WS] WebSocket error:', error);
  });
}
