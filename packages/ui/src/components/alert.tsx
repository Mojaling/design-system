import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

const alertVariants = cva(
  "flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        warning: "border-warning/40 bg-warning/10 text-warning",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-foreground/80", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
