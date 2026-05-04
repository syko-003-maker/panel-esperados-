import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  // `btn-press` ajoute la transition unifiée + translateY hover + scale 0.97 active
  // (cohérent avec le reste du panel, respecte prefers-reduced-motion).
  "btn-press inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Variantes tonales : .btn-press-* ajoute un soft glow au hover sans
        // toucher au bg/border existant de la variante.
        default: "btn-press-bordeaux bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "btn-press-bordeaux bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "btn-press-neutral border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "btn-press-neutral bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "btn-press-neutral hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
