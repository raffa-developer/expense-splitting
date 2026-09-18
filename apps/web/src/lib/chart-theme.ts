import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface ChartColors {
  paid: string;
  share: string;
  grid: string;
  cursor: string;
}

function readColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    paid: read("--chart-1", "#2a9d8f"),
    share: read("--chart-2", "#ff8c5a"),
    grid: read("--border", "#e4dacf"),
    cursor: read("--muted", "#eee7de")
  };
}

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(readColors);

  useEffect(() => {
    setColors(readColors());
  }, [resolvedTheme]);

  return colors;
}
