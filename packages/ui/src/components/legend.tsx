import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

const legendDotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    variant: {
      "chart-1": "bg-chart-1",
      "chart-2": "bg-chart-2",
      "chart-3": "bg-chart-3",
      "chart-4": "bg-chart-4",
      "chart-5": "bg-chart-5",
    },
  },
  defaultVariants: {
    variant: "chart-1",
  },
})

/** 바·차트 옆에 붙는 범례 목록 */
function Legend({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="legend"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

/** 범례 한 줄: 색 점 + 이름(label) + 오른쪽 값(value) */
function LegendItem({
  className,
  variant,
  label,
  value,
  ...props
}: Omit<ComponentProps<"div">, "children"> &
  VariantProps<typeof legendDotVariants> & {
    label: ReactNode
    value?: ReactNode
  }) {
  return (
    <div
      data-slot="legend-item"
      className={cn(
        "flex items-center justify-between gap-3 text-sm",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={legendDotVariants({ variant })} />
        <span className="truncate tabular-nums">{label}</span>
      </span>
      {value != null && (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {value}
        </span>
      )}
    </div>
  )
}

export { Legend, LegendItem, legendDotVariants }
