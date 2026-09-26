import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, CSSProperties } from "react"

import { cn } from "@workspace/ui/lib/utils"

const rangeBarBandVariants = cva("absolute inset-0 rounded-full", {
  variants: {
    variant: {
      success: "bg-success/25",
      warning: "bg-warning/25",
    },
  },
  defaultVariants: {
    variant: "success",
  },
})

const rangeBarMarkerVariants = cva(
  "absolute top-1/2 left-(--marker-position) size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card transition-all duration-500",
  {
    variants: {
      variant: {
        success: "bg-success",
        warning: "bg-warning",
      },
    },
    defaultVariants: {
      variant: "success",
    },
  }
)

/**
 * 범위 안에서 현재 값의 위치를 보여주는 바 (예: 최저가–현재가–최고가).
 * value는 0~100 사이의 위치(%)이고, 범위를 벗어나면 양 끝에 고정된다.
 */
function RangeBar({
  className,
  value,
  variant,
  ...props
}: ComponentProps<"div"> & {
  value: number
} & VariantProps<typeof rangeBarMarkerVariants>) {
  const position = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      data-slot="range-bar"
      className={cn("relative h-2 w-full rounded-full bg-muted", className)}
      {...props}
    >
      <div className={rangeBarBandVariants({ variant })} />
      <div
        className={rangeBarMarkerVariants({ variant })}
        style={{ "--marker-position": `${position}%` } as CSSProperties}
      />
    </div>
  )
}

export { RangeBar, rangeBarMarkerVariants }
