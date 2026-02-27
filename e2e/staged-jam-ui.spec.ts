import { expect, test } from '@playwright/test';

test.describe('Staged Jam UI Flow', () => {
  test('keeps jam silent until explicit @mentions and locks preset after first join', async ({ page }) => {
    test.slow();

    await page.addInitScript(() => {
      (window as typeof window & { __BSJ_E2E_FORCE_AUDIO_READY__?: boolean }).__BSJ_E2E_FORCE_AUDIO_READY__ = true;
    });

    await page.addInitScript(() => {
      type AgentKey = 'drums' | 'bass' | 'melody' | 'chords';
      type ClientMessage = {
        type?: string;
        activeAgents?: string[];
        presetId?: string;
        targetAgent?: AgentKey;
        text?: string;
      };

      const AGENT_META: Record<AgentKey, { name: string; emoji: string }> = {
        drums: { name: 'BEAT', emoji: '🥁' },
        bass: { name: 'GROOVE', emoji: '🎸' },
        melody: { name: 'ARIA', emoji: '🎹' },
        chords: { name: 'CHORDS', emoji: '🎼' },
      };

      const PRESET_CONTEXTS: Record<string, {
        genre: string;
        key: string;
        scale: string[];
        chordProgression: string[];
        bpm: number;
        timeSignature: string;
        energy: number;
      }> = {
        funk: {
          genre: 'Funk',
          key: 'D dorian',
          scale: ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
          chordProgression: ['Dm7', 'G7', 'Dm7', 'G7'],
          bpm: 105,
          timeSignature: '4/4',
          energy: 7,
        },
      };

      const BLANK_CONTEXT = {
        genre: '',
        key: '',
        scale: [] as string[],
        chordProgression: [] as string[],
        bpm: 120,
        timeSignature: '4/4',
        energy: 5,
      };

      const state = {
        sessionId: 'e2e-session-1',
        round: 0,
        selectedAgents: ['drums', 'bass', 'melody', 'chords'] as AgentKey[],
        activatedAgents: [] as AgentKey[],
        musicalContext: { ...BLANK_CONTEXT },
        agentStates: {} as Record<string, {
          name: string;
          emoji: string;
          pattern: string;
          fallbackPattern: string;
          thoughts: string;
          lastUpdated: string;
          status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout';
        }>,
      };

      function nowIso(): string {
        return new Date().toISOString();
      }

      function ensureAgentState(agent: AgentKey) {
        if (!state.agentStates[agent]) {
          const meta = AGENT_META[agent];
          state.agentStates[agent] = {
            name: meta.name,
            emoji: meta.emoji,
            pattern: '',
            fallbackPattern: '',
            thoughts: '',
            lastUpdated: nowIso(),
            status: 'idle',
          };
        }
      }

      function resetJamState(activeAgents: string[]) {
        state.round = 0;
        state.selectedAgents = activeAgents.filter((a): a is AgentKey => a in AGENT_META);
        state.activatedAgents = [];
        state.musicalContext = {
          genre: '',
          key: '',
          scale: [],
          chordProgression: [],
          bpm: 120,
          timeSignature: '4/4',
          energy: 5,
        };
        state.agentStates = {};
        for (const agent of state.selectedAgents) {
          ensureAgentState(agent);
        }
      }

      function combinedPattern(): string {
        const patterns = state.activatedAgents
          .map((agent) => state.agentStates[agent]?.pattern)
          .filter((pattern): pattern is string => !!pattern && pattern !== 'silence');
        if (patterns.length === 0) return 'silence';
        if (patterns.length === 1) return patterns[0];
        return `stack(${patterns.join(', ')})`;
      }

      function buildJamState() {
        return {
          sessionId: state.sessionId,
          currentRound: state.round,
          musicalContext: {
            ...state.musicalContext,
            scale: [...state.musicalContext.scale],
            chordProgression: [...state.musicalContext.chordProgression],
          },
          agents: Object.fromEntries(
            state.selectedAgents.map((agent) => [agent, { ...state.agentStates[agent] }])
          ),
          activeAgents: [...state.selectedAgents],
          activatedAgents: [...state.activatedAgents],
        };
      }

      function makeAgentResponse(agent: AgentKey) {
        switch (agent) {
          case 'bass':
            return {
              pattern: 'note("d2 a2").s("sawtooth").slow(2)',
              thoughts: 'Starting a slow, pocketed riff',
              commentary: 'Locking in a gentle groove',
            };
          case 'melody':
            return {
              pattern: 'note("f4 a4 c5 e5").s("piano").slow(2)',
              thoughts: 'Joining softly around the bass line',
              commentary: 'Entering gently with space',
            };
          case 'drums':
            return {
              pattern: 's("bd ~ sd ~").slow(2)',
              thoughts: 'Soft pulse',
              commentary: 'Minimal pocket',
            };
          case 'chords':
          default:
            return {
              pattern: 'note("<[d3,f3,a3,c4] ~ [d3,f3,a3,c4] ~>").s("gm_epiano1").gain(0.45)',
              thoughts: 'Clear comping support joins the pocket',
              commentary: 'Filling the harmonic middle',
            };
        }
      }

      function emitMessage(ws: FakeWebSocket, message: unknown) {
        if (ws.readyState !== FakeWebSocket.OPEN) return;
        const evt = new MessageEvent('message', { data: JSON.stringify(message) });
        ws.onmessage?.call(ws as unknown as WebSocket, evt);
      }

      function emitStatus(ws: FakeWebSocket, status: 'connecting' | 'ready' | 'thinking' | 'done') {
        emitMessage(ws, { type: 'status', status });
      }

      function emitJamState(ws: FakeWebSocket) {
        emitMessage(ws, {
          type: 'jam_state_update',
          payload: {
            jamState: buildJamState(),
            combinedPattern: combinedPattern(),
          },
        });
      }

      function emitAgentStatus(ws: FakeWebSocket, agent: AgentKey, status: 'idle' | 'thinking' | 'playing' | 'error' | 'timeout') {
        ensureAgentState(agent);
        state.agentStates[agent].status = status;
        state.agentStates[agent].lastUpdated = nowIso();
        emitMessage(ws, {
          type: 'agent_status',
          payload: {
            agent,
            status,
          },
        });
      }

      function emitAgentThought(ws: FakeWebSocket, agent: AgentKey, pattern: string, thoughts: string) {
        ensureAgentState(agent);
        state.agentStates[agent].pattern = pattern;
        state.agentStates[agent].fallbackPattern = pattern;
        state.agentStates[agent].thoughts = thoughts;
        state.agentStates[agent].lastUpdated = nowIso();
        emitMessage(ws, {
          type: 'agent_thought',
          payload: {
            agent,
            emoji: AGENT_META[agent].emoji,
            thought: thoughts,
            pattern,
            timestamp: nowIso(),
          },
        });
      }

      function emitAgentCommentary(ws: FakeWebSocket, agent: AgentKey, text: string) {
        emitMessage(ws, {
          type: 'agent_commentary',
          payload: {
            agent,
            emoji: AGENT_META[agent].emoji,
            text,
            timestamp: nowIso(),
          },
        });
      }

      function handleBossDirective(ws: FakeWebSocket, parsed: { targetAgent?: AgentKey; text?: string }) {
        let targets: AgentKey[] = [];

        if (parsed.targetAgent) {
          const agent = parsed.targetAgent;
          if (!state.selectedAgents.includes(agent)) {
            emitMessage(ws, {
              type: 'directive_error',
              payload: { message: `${AGENT_META[agent].name} is not in this jam session`, targetAgent: agent },
            });
            emitStatus(ws, 'done');
            return;
          }
          targets = [agent];
        } else {
          targets = [...state.activatedAgents];
          if (targets.length === 0) {
            emitMessage(ws, {
              type: 'directive_error',
              payload: { message: 'No agents are active yet. @mention an agent to start the jam.' },
            });
            emitStatus(ws, 'done');
            return;
          }
        }

        if (!state.musicalContext.genre) {
          emitMessage(ws, {
            type: 'directive_error',
            payload: { message: 'Choose a genre preset and press Play before sending directives.', targetAgent: parsed.targetAgent },
          });
          emitStatus(ws, 'done');
          return;
        }

        for (const agent of targets) {
          if (!state.activatedAgents.includes(agent)) {
            state.activatedAgents = [...state.activatedAgents, agent];
          }
        }

        state.round += 1;

        for (const agent of targets) {
          emitAgentStatus(ws, agent, 'thinking');
        }

        setTimeout(() => {
          for (const agent of targets) {
            const response = makeAgentResponse(agent);
            emitAgentThought(ws, agent, response.pattern, response.thoughts);
            emitAgentCommentary(ws, agent, response.commentary);
            emitAgentStatus(ws, agent, 'playing');
          }
          emitJamState(ws);
          emitStatus(ws, 'done');
        }, 20);
      }

      class FakeWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        readonly url: string;
        readonly protocol = '';
        readonly extensions = '';
        binaryType: BinaryType = 'blob';
        bufferedAmount = 0;
        readyState = FakeWebSocket.CONNECTING;
        onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
        onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
        onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
        onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
        private _closed = false;

        constructor(url: string | URL) {
          this.url = String(url);

          setTimeout(() => {
            if (this._closed) return;
            this.readyState = FakeWebSocket.OPEN;
            this.onopen?.call(this as unknown as WebSocket, new Event('open'));

            if (this.url.includes('/api/ai-ws')) {
              emitStatus(this, 'ready');
            }
          }, 0);
        }

        send(raw: string) {
          if (this.readyState !== FakeWebSocket.OPEN) return;

          let parsed: ClientMessage | null = null;
          try {
            parsed = JSON.parse(raw) as ClientMessage;
          } catch {
            return;
          }
          const msg = parsed;
          if (!msg?.type) return;

          if (this.url.includes('/api/ws')) {
            return;
          }

          switch (msg.type) {
            case 'ping':
              emitMessage(this, { type: 'pong' });
              break;

            case 'start_jam': {
              emitStatus(this, 'thinking');
              resetJamState(msg.activeAgents ?? []);
              setTimeout(() => {
                emitJamState(this);
                emitStatus(this, 'done');
              }, 10);
              break;
            }

            case 'set_jam_preset': {
              emitStatus(this, 'thinking');
              const preset = msg.presetId ? PRESET_CONTEXTS[msg.presetId] : null;
              setTimeout(() => {
                if (!preset) {
                  emitMessage(this, {
                    type: 'error',
                    error: `Failed to set jam preset: Unknown jam preset: ${msg.presetId ?? '(missing)'}`,
                  });
                  emitStatus(this, 'done');
                  return;
                }
                if (state.activatedAgents.length > 0) {
                  emitMessage(this, {
                    type: 'error',
                    error: 'Failed to set jam preset: Preset is locked after the first agent joins.',
                  });
                  emitStatus(this, 'done');
                  return;
                }
                state.musicalContext = {
                  genre: preset.genre,
                  key: preset.key,
                  scale: [...preset.scale],
                  chordProgression: [...preset.chordProgression],
                  bpm: preset.bpm,
                  timeSignature: preset.timeSignature,
                  energy: preset.energy,
                };
                emitJamState(this);
                emitStatus(this, 'done');
              }, 30);
              break;
            }

            case 'boss_directive': {
              emitStatus(this, 'thinking');
              handleBossDirective(this, msg);
              break;
            }

            case 'stop_jam':
              emitStatus(this, 'done');
              break;
          }
        }

        close(_code?: number, _reason?: string) {
          if (this._closed) return;
          this._closed = true;
          this.readyState = FakeWebSocket.CLOSED;
          this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'));
        }

        addEventListener() {}
        removeEventListener() {}
        dispatchEvent(): boolean { return true; }
      }

      (window as typeof window & { __bsjOriginalWebSocket?: typeof WebSocket }).__bsjOriginalWebSocket = window.WebSocket;
      (window as typeof window & { WebSocket: typeof WebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    });

    await page.goto('/');

    const startJamButton = page.getByRole('button', { name: /Start.*Jam/ });
    await expect(startJamButton).toBeEnabled();
    await startJamButton.click();

    await expect(page.getByText('Start Jam Session')).toBeVisible();
    await page.getByRole('button', { name: /Start Jam \(\d+ agents\)/ }).click();

    const presetSelect = page.getByLabel('Jam genre preset');
    const jamPlayButton = page.getByRole('button', { name: '▶ Play' });
    const bossInput = page.getByTestId('boss-input');

    await expect(presetSelect).toBeVisible();
    await expect(jamPlayButton).toBeDisabled();
    await expect(bossInput).toBeDisabled();
    await expect(page.getByText('Choose a preset to enable Play')).toBeVisible();

    await presetSelect.selectOption('funk');
    await expect(jamPlayButton).toBeEnabled();

    await jamPlayButton.click();

    await expect(page.getByText('Applying preset…')).toBeVisible();
    await expect(bossInput).toBeDisabled();
    await expect(bossInput).toBeEnabled();
    await expect(page.getByText('Applying preset…')).toBeHidden();
    await expect(page.locator('span').filter({ hasText: /^Funk$/ })).toBeVisible();

    await bossInput.fill('@GROOVE start with a slow riff');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByTestId('status-label-bass')).toHaveText('playing');
    await expect(page.getByTestId('status-label-melody')).toHaveText('idle');
    await expect(page.getByText('Preset locked after first join')).toBeVisible();
    await expect(presetSelect).toBeDisabled();
    await expect(page.getByTestId('pattern-row-bass')).not.toContainText('silence');
    await expect(page.getByTestId('pattern-row-melody')).toContainText('silence');
    await expect(page.getByTestId('agent-messages-bass')).toContainText('Locking in a gentle groove');

    await bossInput.fill('@CHORDS add clear comping support');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByTestId('status-label-chords')).toHaveText('playing');
    await expect(page.getByTestId('pattern-row-chords')).not.toContainText('silence');
    await expect(page.getByTestId('agent-messages-chords')).toContainText('Filling the harmonic middle');
  });
});
