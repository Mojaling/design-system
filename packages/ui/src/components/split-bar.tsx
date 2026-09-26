import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, CSSProperties } from "react"

import { cn } from "@workspace/ui/lib/utils"

/** 구성비 바의 한 칸. 너비는 값의 비율로 정해진다. */
const splitBarSegmentVariants = cva(
  "h-full w-(--segment-width) transition-all duration-500",
  {
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
  }
)

type SplitBarSegment = {
  value: number
  label?: string
} & VariantProps<typeof splitBarSegmentVariants>

/** 여러 값의 비율을 한 줄로 보여주는 바 (예: 토큰 구성비). */
function SplitBar({
  className,
  segments,
  ...props
}: ComponentProps<"div"> & { segments: SplitBarSegment[] }) {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0
  )
  return (
    <div
      data-slot="split-bar"
      className={cn(
        "flex h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      {total > 0 &&
        segments.map((segment, index) => (
          <div
            key={index}
            title={segment.label}
            className={splitBarSegmentVariants({ variant: segment.variant })}
            style={
              {
                "--segment-width": `${(Math.max(0, segment.value) / total) * 100}%`,
              } as CSSProperties
            }
          />
        ))}
    </div>
  )
}

export { SplitBar, splitBarSegmentVariants, type SplitBarSegment }
