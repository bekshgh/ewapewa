export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  action,
  titleAction,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  action?: React.ReactNode;
  /** Small control next to the title, e.g. rename. */
  titleAction?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && (
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-faint">{breadcrumb}</p>
        )}
        {titleAction ? (
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">{title}</h1>
            {titleAction}
          </div>
        ) : (
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">{title}</h1>
        )}
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
