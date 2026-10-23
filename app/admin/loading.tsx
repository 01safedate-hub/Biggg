export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[40vh] place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-brand" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
