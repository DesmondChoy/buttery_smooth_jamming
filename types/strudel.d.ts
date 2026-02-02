declare module '@strudel/repl' {
  // The module registers the <strudel-editor> web component
  // No explicit exports needed for our use case
}

declare module '@strudel/webaudio' {
  export function initAudio(): Promise<void>;
  export function getAudioContext(): AudioContext;
}
