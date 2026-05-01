import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:  "bg-orange-100 text-orange-700",
        critical: "bg-red-100 text-red-700",
        high:     "bg-orange-100 text-orange-700",
        medium:   "bg-amber-100 text-amber-700",
        low:      "bg-green-100 text-green-700",
        unknown:  "bg-gray-100 text-gray-600",
        buy:      "bg-emerald-100 text-emerald-700",
        sell:     "bg-blue-100 text-blue-700",
        outline:  "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
