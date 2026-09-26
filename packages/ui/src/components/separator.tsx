import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

const separatorVariants = cva("shrink-0 bg-border", {
  variants: {
    orientation: {
      horizontal: "h-px w-full",
      vertical: "h-full w-px",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
})

function Separator({
  className,
  orientation,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof separatorVariants>) {
  return (
    <div
      data-slot="separator"
      role="separator"
      aria-orientation={orientation ?? "horizontal"}
      className={cn(separatorVariants({ orientation }), className)}
      {...props}
    />
  )
}

export { Separator }
