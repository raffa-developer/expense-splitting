import type { CSSProperties } from "react";

const chartVariables = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5"
];

function hashName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) % 9973;
  }
  return hash;
}

export function avatarStyle(name: string): CSSProperties {
  const variable =
    chartVariables[hashName(name) % chartVariables.length] ?? "--chart-1";
  return {
    background: `color-mix(in oklab, var(${variable}) 18%, transparent)`,
    color: `var(${variable})`
  };
}

export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "?";
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return (parts[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${(parts[0] ?? "").slice(0, 1)}${(parts[1] ?? "").slice(0, 1)}`.toUpperCase();
}
