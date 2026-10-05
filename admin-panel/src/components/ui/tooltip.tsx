'use client'

import type { ComponentProps } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

export const Tooltip = TooltipPrimitive.Root

export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-[100] max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium leading-snug text-zinc-50 shadow-xl',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
