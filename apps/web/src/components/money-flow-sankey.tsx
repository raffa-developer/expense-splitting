import { ResponsiveContainer, Sankey } from "recharts";
import type { SettlementTransaction } from "@/api";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/money";

interface SankeyNodePayload {
  name: string;
  label: string;
  side: "pays" | "receives";
  isYou: boolean;
}

interface SankeyNodeRenderProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  containerWidth?: number;
  payload?: SankeyNodePayload;
}

interface SankeyLinkRenderProps {
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  sourceControlX?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: { highlighted?: boolean };
}

function FlowNode(props: SankeyNodeRenderProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    containerWidth = 0,
    payload
  } = props;

  if (!payload) {
    return null;
  }

  const isRightSide = x + width > containerWidth / 2;
  const textX = isRightSide ? x + width + 10 : x - 10;
  const anchor = isRightSide ? "start" : "end";
  const centerY = y + height / 2;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        style={{ fill: payload.isYou ? "var(--primary)" : "var(--border)" }}
      />
      <text
        x={textX}
        y={centerY - 2}
        textAnchor={anchor}
        fontSize={12}
        fontWeight={600}
        style={{ fill: "var(--foreground)" }}
      >
        {payload.name}
      </text>
      <text
        x={textX}
        y={centerY + 13}
        textAnchor={anchor}
        fontSize={11}
        style={{
          fill:
            payload.side === "pays"
              ? "var(--destructive)"
              : "var(--chart-2)"
        }}
      >
        {payload.label}
      </text>
    </g>
  );
}

function FlowLink(props: SankeyLinkRenderProps) {
  const {
    sourceX = 0,
    sourceY = 0,
    targetX = 0,
    targetY = 0,
    sourceControlX = 0,
    targetControlX = 0,
    linkWidth = 1,
    payload
  } = props;

  const highlighted = payload?.highlighted ?? false;

  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      strokeWidth={Math.max(linkWidth, 1)}
      className={
        highlighted
          ? "opacity-100"
          : "opacity-40 transition-opacity hover:opacity-80"
      }
      style={{
        stroke: highlighted ? "var(--primary)" : "var(--muted-foreground)"
      }}
    />
  );
}

export function MoneyFlowSankey({
  transactions,
  currency,
  highlightUserId
}: {
  transactions: SettlementTransaction[];
  currency: string;
  highlightUserId?: string | undefined;
}) {
  const { t } = useI18n();

  const payerTotals = new Map<string, { name: string; total: number }>();
  const receiverTotals = new Map<string, { name: string; total: number }>();

  for (const transaction of transactions) {
    const payer = payerTotals.get(transaction.from_user_id) ?? {
      name: transaction.from_name,
      total: 0
    };
    payer.total += transaction.amount;
    payerTotals.set(transaction.from_user_id, payer);

    const receiver = receiverTotals.get(transaction.to_user_id) ?? {
      name: transaction.to_name,
      total: 0
    };
    receiver.total += transaction.amount;
    receiverTotals.set(transaction.to_user_id, receiver);
  }

  const payers = [...payerTotals.entries()].sort(
    (a, b) => b[1].total - a[1].total
  );
  const receivers = [...receiverTotals.entries()].sort(
    (a, b) => b[1].total - a[1].total
  );

  const nodes: SankeyNodePayload[] = [
    ...payers.map(([id, entry]) => ({
      name: entry.name,
      side: "pays" as const,
      isYou: id === highlightUserId,
      label: t("flow.pays", {
        amount: formatMoney(entry.total, currency)
      })
    })),
    ...receivers.map(([id, entry]) => ({
      name: entry.name,
      side: "receives" as const,
      isYou: id === highlightUserId,
      label: t("flow.receives", {
        amount: formatMoney(entry.total, currency)
      })
    }))
  ];

  const payerIndex = new Map(payers.map(([id], index) => [id, index]));
  const receiverIndex = new Map(
    receivers.map(([id], index) => [id, payers.length + index])
  );

  const links = transactions.map((transaction) => ({
    source: payerIndex.get(transaction.from_user_id) ?? 0,
    target: receiverIndex.get(transaction.to_user_id) ?? 0,
    value: transaction.amount,
    highlighted:
      highlightUserId !== undefined &&
      (transaction.from_user_id === highlightUserId ||
        transaction.to_user_id === highlightUserId)
  }));

  if (nodes.length === 0 || links.length === 0) {
    return null;
  }

  return (
    <div className="h-64 w-full" role="img" aria-label={t("flow.aria")}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          node={<FlowNode />}
          link={<FlowLink />}
          nodePadding={26}
          nodeWidth={10}
          linkCurvature={0.55}
          margin={{ top: 12, right: 132, bottom: 12, left: 104 }}
          iterations={32}
        />
      </ResponsiveContainer>
    </div>
  );
}
