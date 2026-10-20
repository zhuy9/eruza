import { lazy, Suspense, type ComponentProps } from 'react';

// The editor and sanitizer are large, so they load only when an item or form opens.
const RichTextField = lazy(() =>
  import('./rich-text-field').then((module) => ({ default: module.RichTextField })),
);

export function LazyRichTextField(props: ComponentProps<typeof RichTextField>) {
  return (
    <Suspense fallback={<div className="rich-text" aria-busy="true" />}>
      <RichTextField {...props} />
    </Suspense>
  );
}

const Comments = lazy(() => import('./comments').then((module) => ({ default: module.Comments })));

export function LazyComments(props: ComponentProps<typeof Comments>) {
  return (
    <Suspense
      fallback={
        <p role="status" className="muted-text">
          Loading comments…
        </p>
      }
    >
      <Comments {...props} />
    </Suspense>
  );
}
