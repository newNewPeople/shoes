import * as React from "react"
import { Button as TaroButton, ITouchEvent } from "@tarojs/components"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary hover:bg-opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive hover:bg-opacity-90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary hover:bg-opacity-80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
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

export interface ButtonProps {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: (e: ITouchEvent) => void
  children?: React.ReactNode
  id?: string
}

const Button = React.forwardRef<any, ButtonProps>(
  ({ className, variant, size, disabled, style, onClick, children, id }, ref) => {
    // 使用 Taro 原生 Button，确保小程序端事件正常触发
    const handleTap = (e: ITouchEvent) => {
      if (!disabled && onClick) {
        onClick(e)
      }
    }
    
    // 只传递明确需要的属性，避免任何意外属性导致小程序编译问题
    return (
      <TaroButton
        ref={ref}
        id={id}
        disabled={disabled}
        style={style}
        className={cn(
          buttonVariants({ variant, size, className }),
          disabled && "opacity-50"
        )}
        onTap={handleTap}
      >
        {children}
      </TaroButton>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }