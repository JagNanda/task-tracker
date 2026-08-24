function hexChannels(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function hexFromChannels(channels: number[]) {
  return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mixHex(first: string, second: string, secondWeight: number) {
  const a = hexChannels(first);
  const b = hexChannels(second);
  return hexFromChannels(a.map((value, index) => value * (1 - secondWeight) + b[index] * secondWeight));
}

function luminance(hex: string) {
  const channels = hexChannels(hex)
    .map((value) => value / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

export function readableText(background: string) {
  return contrastRatio(background, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#04101C";
}

export function applyAppTheme(background: string, accent: string) {
  const root = document.documentElement;
  const palette = {
    "--app": background,
    "--sidebar": mixHex(background, "#10243A", 0.24),
    "--surface": mixHex(background, "#17324F", 0.2),
    "--surface-2": mixHex(background, "#1C3B5C", 0.29),
    "--surface-3": mixHex(background, "#244968", 0.38),
    "--surface-inset": mixHex(background, "#000000", 0.2),
    "--border": mixHex(background, "#516A86", 0.23),
    "--border-bright": mixHex(background, "#607E9E", 0.36),
    "--blue": accent,
    "--blue-hover": mixHex(accent, "#FFFFFF", 0.14),
    "--accent-contrast": readableText(accent),
  };
  Object.entries(palette).forEach(([name, value]) => root.style.setProperty(name, value));
}
