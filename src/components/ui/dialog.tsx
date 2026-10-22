import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** shadcn's Dialog in this app's colors, with only the parts Eruza uses. */
export const Dialog = DialogPrimitive.Root;

export function DialogContent({
  className,
  children,
  onCloseAutoFocus,
  closeDisabled,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeDisabled?: boolean }) {
  // Eruza opens dialogs from shortcuts and buttons, not a Radix Trigger, so closing
  // returns focus to whatever had it before, as a native <dialog> does.
  const [opener] = React.useState(() => document.activeElement);
  const content = React.useRef<HTMLDivElement>(null);
  // A button that disables itself while its request runs drops focus to the page body, where
  // Tab reaches the controls behind the dialog. Move focus to the dialog itself instead.
  React.useLayoutEffect(() => {
    const active = document.activeElement;
    if (closeDisabled && (active === document.body || active?.matches(':disabled'))) {
      content.current?.focus();
    }
  }, [closeDisabled]);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/50"
        // Keeps focus in the dialog, so page shortcuts do not fire behind it.
        onMouseDown={(event) => event.preventDefault()}
      />
      <DialogPrimitive.Content
        ref={content}
        data-slot="dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-lg outline-none sm:max-w-lg',
          className,
        )}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          // Something that opened as the dialog closed, such as a new item's panel, keeps focus.
          const idle = !document.activeElement || document.activeElement === document.body;
          const back = opener instanceof HTMLElement && opener.isConnected ? opener : null;
          if (idle) (back ?? document.getElementById('content'))?.focus();
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          disabled={closeDisabled}
          className="absolute top-4 right-4 rounded-xs opacity-70 pointer-coarse:top-2 pointer-coarse:right-2 pointer-coarse:p-2 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-wrap justify-end gap-2', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
