import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Receipt className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        Expense Splitting
      </span>
    </span>
  );
}
