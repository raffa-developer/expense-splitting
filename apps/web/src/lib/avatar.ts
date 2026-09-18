import type { CSSProperties } from "react";

const solidVariables = [
  "--chart-1",
  "--chart-2",
  "--chart-4",
  "--chart-5",
  "--primary"
];

function hashName(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function variableFor(name: string): string {
  return solidVariables[hashName(name) % solidVariables.length] ?? "--chart-1";
}

export function avatarStyle(name: string): CSSProperties {
  return {
    background: `var(${variableFor(name)})`,
    color: "var(--avatar-foreground)"
  };
}

export function avatarFill(name: string): string {
  return `var(${variableFor(name)})`;
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
