import { useMemo } from "react";
import type { Member, SettlementTransaction } from "@/api";
import { avatarFill } from "@/lib/avatar";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

interface FlowNode {
  id: string;
  name: string;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
}

const WIDTH = 560;
const HEIGHT = 340;
const NODE_RADIUS = 22;
const MIN_EDGE = 1.5;
const MAX_EDGE = 5;

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? "?" : trimmed.slice(0, 1).toUpperCase();
}

export function MoneyFlowGraph({
  members,
  transactions,
  currency,
  highlightUserId
}: {
  members: Member[];
  transactions: SettlementTransaction[];
  currency: string;
  highlightUserId?: string | undefined;
}) {
  const { t } = useI18n();

  const nodes = useMemo<FlowNode[]>(() => {
    const names = new Map<string, string>();
    for (const member of members) {
      names.set(member.id, member.name);
    }
    for (const transaction of transactions) {
      names.set(transaction.from_user_id, transaction.from_name);
      names.set(transaction.to_user_id, transaction.to_name);
    }

    const entries = [...names.entries()];
    const count = entries.length;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 6;
    const rx = WIDTH / 2 - 80;
    const ry = HEIGHT / 2 - 60;
    const labelOffset = NODE_RADIUS + 14;

    return entries.map(([id, name], index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      return {
        id,
        name,
        x,
        y,
        labelX: x + Math.cos(angle) * labelOffset,
        labelY: y + Math.sin(angle) * labelOffset + 4
      };
    });
  }, [members, transactions]);

  const edges = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 6;
    const maxAmount = transactions.reduce(
      (largest, transaction) => Math.max(largest, transaction.amount),
      1
    );
    const positions = [0.3, 0.46, 0.62, 0.78];

    const rawEdges = transactions.flatMap((transaction, index) => {
      const from = nodeById.get(transaction.from_user_id);
      const to = nodeById.get(transaction.to_user_id);
      if (!from || !to) {
        return [];
      }

      const width =
        MIN_EDGE + (transaction.amount / maxAmount) * (MAX_EDGE - MIN_EDGE);
      const arrow = 6 + width * 1.2;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;

      const start = {
        x: from.x + ux * (NODE_RADIUS + 2),
        y: from.y + uy * (NODE_RADIUS + 2)
      };
      const tip = {
        x: to.x - ux * (NODE_RADIUS + 2),
        y: to.y - uy * (NODE_RADIUS + 2)
      };
      const end = { x: tip.x - ux * arrow, y: tip.y - uy * arrow };
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const control = {
        x: mid.x + (cx - mid.x) * 0.35,
        y: mid.y + (cy - mid.y) * 0.35
      };

      const position = positions[index % positions.length] ?? 0.5;
      const inverse = 1 - position;
      const label = {
        x:
          inverse * inverse * start.x +
          2 * position * inverse * control.x +
          position * position * end.x,
        y:
          inverse * inverse * start.y +
          2 * position * inverse * control.y +
          position * position * end.y
      };

      const base = { x: tip.x - ux * arrow, y: tip.y - uy * arrow };
      const px = -uy * (3 + width / 2);
      const py = ux * (3 + width / 2);
      const labelText = formatMoney(transaction.amount, currency);

      return [
        {
          key: `${transaction.from_user_id}-${transaction.to_user_id}-${transaction.amount}`,
          path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
          arrow: `${tip.x},${tip.y} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`,
          label,
          labelWidth: Math.max(40, labelText.length * 6.2 + 12),
          labelText,
          width,
          highlighted:
            highlightUserId !== undefined &&
            (transaction.from_user_id === highlightUserId ||
              transaction.to_user_id === highlightUserId)
        }
      ];
    });

    const placed: { x: number; y: number; width: number }[] = [];
    for (const edge of rawEdges) {
      let attempts = 0;
      while (
        attempts < 12 &&
        placed.some(
          (other) =>
            Math.abs(other.x - edge.label.x) <
              (other.width + edge.labelWidth) / 2 + 8 &&
            Math.abs(other.y - edge.label.y) < 20
        )
      ) {
        attempts += 1;
        edge.label.y += 16;
      }
      placed.push({
        x: edge.label.x,
        y: edge.label.y,
        width: edge.labelWidth
      });
    }

    return rawEdges;
  }, [nodes, transactions, currency, highlightUserId]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={t("flow.aria")}
    >
      {edges.map((edge) => (
        <g key={edge.key}>
          <path
            d={edge.path}
            fill="none"
            strokeWidth={edge.width}
            strokeLinecap="round"
            style={{
              stroke: edge.highlighted
                ? "var(--primary)"
                : "color-mix(in oklab, var(--muted-foreground) 40%, transparent)"
            }}
          />
          <polygon
            points={edge.arrow}
            style={{
              fill: edge.highlighted
                ? "var(--primary)"
                : "color-mix(in oklab, var(--muted-foreground) 40%, transparent)"
            }}
          />
        </g>
      ))}

      {edges.map((edge) => (
        <g key={`${edge.key}-label`}>
          <rect
            x={edge.label.x - edge.labelWidth / 2}
            y={edge.label.y - 9}
            width={edge.labelWidth}
            height={18}
            rx={5}
            style={{ fill: "var(--muted)" }}
          />
          <text
            x={edge.label.x}
            y={edge.label.y + 3.5}
            textAnchor="middle"
            fontSize={10.5}
            style={{ fill: "var(--muted-foreground)" }}
          >
            {edge.labelText}
          </text>
        </g>
      ))}

      {nodes.map((node) => {
        const isYou = node.id === highlightUserId;
        return (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r={NODE_RADIUS}
              strokeWidth={isYou ? 2 : 1}
              style={{
                fill: avatarFill(node.name),
                stroke: isYou ? "var(--primary)" : "var(--border)"
              }}
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              style={{ fill: "var(--avatar-foreground)" }}
            >
              {initials(node.name)}
            </text>
            <text
              x={node.labelX}
              y={node.labelY}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              style={{ fill: "var(--foreground)" }}
            >
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
