"use client"

import * as React from "react"
import { cn } from "@forgeAI/ui/lib/utils"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

/**
 * Radix wraps a viewport's children in a `display: table` div so that content
 * wider than the viewport can be scrolled horizontally. The side effect is that
 * the wrapper shrink-wraps to its widest child: one long unbreakable word makes
 * every `w-full` sibling inside it wider than the container and spill past its
 * edge, and `truncate` can never kick in because the box it would truncate into
 * keeps growing with the text.
 *
 * Forcing `block` pins the wrapper to the viewport's own width, which is what a
 * vertical list wants. A horizontal ScrollArea should opt back out with
 * `[&>div]:table!` rather than this default being dropped.
 */
const FIT_VIEWPORT_TO_WIDTH = "[&>div]:block!"

// Scrollable region with custom scrollbars.
// Used for panels whose content can overflow.
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          FIT_VIEWPORT_TO_WIDTH,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

// The custom scrollbar inside a ScrollArea.
// Supports vertical and horizontal orientation.
function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
