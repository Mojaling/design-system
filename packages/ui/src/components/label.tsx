import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium select-none",
        className
      )}
      {...props}
    />
  )
}

export { Label }
