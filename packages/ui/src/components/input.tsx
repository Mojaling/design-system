import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

const inputVariants = cva(
  "flex w-full min-w-0 rounded-lg border border-input bg-transparent text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
  {
    variants: {
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  size,
  type = "text",
  ...props
}: Omit<ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
