import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/** Wrap the app in one provider. */
export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * One control with shadcn's tooltip, in this app's colors, on hover and focus.
 * No `label` means no tooltip.
 */
export function WithTooltip({
  label,
  side,
  children,
}: {
  label?: string;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side'];
  children: React.ReactElement;
}) {
  // A Root without content could open but never close, then show when a label arrives.
  if (!label) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        asChild
        // Opens on keyboard focus, not when a click or window switch moves focus.
        onFocus={(event) =>
          !event.currentTarget.matches(':focus-visible') && event.preventDefault()
        }
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          side={side}
          sideOffset={4}
          className="z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background"
        >
          {label}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
