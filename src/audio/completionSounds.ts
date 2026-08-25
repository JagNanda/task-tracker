export const completionSoundOptions = [
  { value: "chime", label: "Bright chime" },
  { value: "gentle", label: "Gentle rise" },
  { value: "bell", label: "Clear bell" },
  { value: "digital", label: "Digital alert" },
] as const;

export type CompletionSound = typeof completionSoundOptions[number]["value"];

const soundPatterns: Record<CompletionSound, { frequencies: number[]; spacing: number; length: number; wave: OscillatorType }> = {
  chime: { frequencies: [659, 880], spacing: 0.16, length: 0.42, wave: "sine" },
  gentle: { frequencies: [523, 659, 784], spacing: 0.13, length: 0.34, wave: "sine" },
  bell: { frequencies: [784, 1047], spacing: 0.2, length: 0.55, wave: "triangle" },
  digital: { frequencies: [740, 620, 880], spacing: 0.1, length: 0.2, wave: "square" },
};

export function isCompletionSound(value: string): value is CompletionSound {
  return completionSoundOptions.some((option) => option.value === value);
}

export async function playCompletionSound(value: string) {
  const sound = isCompletionSound(value) ? value : "chime";
  try {
    const context = new AudioContext();
    if (context.state === "suspended") await context.resume();
    const pattern = soundPatterns[sound];
    pattern.frequencies.forEach((frequency, index) => {
      const startsAt = context.currentTime + index * pattern.spacing;
      const endsAt = startsAt + pattern.length;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = pattern.wave;
      oscillator.frequency.setValueAtTime(frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(sound === "digital" ? 0.045 : 0.075, startsAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(endsAt);
    });
    const totalLength = (pattern.frequencies.length - 1) * pattern.spacing + pattern.length;
    window.setTimeout(() => void context.close(), Math.ceil((totalLength + 0.1) * 1000));
  } catch {
    // A sound preference should never block completing a focus session or break.
  }
}
