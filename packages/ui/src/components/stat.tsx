import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

function Stat({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="stat"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function StatLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-label"
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}

const statValueVariants = cva("font-semibold tracking-tight tabular-nums", {
  variants: {
    variant: {
      default: "text-foreground",
      success: "text-success",
      warning: "text-warning",
      destructive: "text-destructive",
      muted: "text-muted-foreground",
    },
    size: {
      sm: "text-sm",
      default: "text-lg",
      lg: "text-3xl",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

function StatValue({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof statValueVariants>) {
  return (
    <div
      data-slot="stat-value"
      className={cn(statValueVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function StatHint({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-hint"
      className={cn("text-xs text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

export { Stat, StatLabel, StatValue, StatHint, statValueVariants }
