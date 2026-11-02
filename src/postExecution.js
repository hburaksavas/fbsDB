// Sound and window attention only fire for runs that reach the threshold; "unfocused" waits for the user to be elsewhere.
export function postExecutionActions({ elapsedMs = 0, focused = true, sound = 'off', attention = 'off', thresholdSeconds = 10 } = {}) {
  const long = elapsedMs >= Math.max(0, thresholdSeconds) * 1000;
  const wants = mode => long && (mode === 'always' || (mode === 'unfocused' && !focused));
  return { sound: wants(sound), attention: wants(attention) };
}

// A short two-tone chime generated locally; no audio file or network resource is used.
export function playCompletionTone(success = true, AudioContextClass = globalThis.AudioContext) {
  if (!AudioContextClass) return false;
  try {
    const context = new AudioContextClass(), gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    gain.connect(context.destination);
    (success ? [660, 880] : [440, 330]).forEach((frequency, index) => {
      const tone = context.createOscillator();
      tone.frequency.value = frequency; tone.connect(gain);
      tone.start(context.currentTime + index * 0.12); tone.stop(context.currentTime + 0.12 + index * 0.12);
    });
    setTimeout(() => context.close?.(), 600);
    return true;
  } catch { return false; }
}

// Running queries have no meaningful percentage, so the taskbar only shows indeterminate or a failure left unseen.
export function taskbarProgressState({ running = false, failedUnseen = false } = {}) {
  return running ? 'indeterminate' : failedUnseen ? 'error' : 'none';
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60), seconds = total % 60;
  return minutes < 60 ? `${minutes} min ${seconds} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
