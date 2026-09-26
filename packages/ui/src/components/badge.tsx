import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        primary: "bg-primary/15 text-primary",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        destructive: "bg-destructive/15 text-destructive",
        info: "bg-info/15 text-info",
        violet: "bg-violet/15 text-violet",
        teal: "bg-teal/15 text-teal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
