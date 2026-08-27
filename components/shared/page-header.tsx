import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  /** Where the back chevron goes — the list this record belongs to. */
  backHref?: string;
  /** Name of that list, e.g. "Polls". Shown next to the chevron on sm+. */
  backLabel?: string;
  /** The page's identity. A string, or a node when the title is editable. */
  title: ReactNode;
  /** A quiet state pill: open/closed, draft/published. Never a button. */
  status?: ReactNode;
  /** One primary action plus an overflow menu. Keep it to two controls. */
  actions?: ReactNode;
};

/**
 * The single identity row at the top of a detail page: where you are, what
 * state it is in, and the one action you came to take. Everything rarer lives
 * behind the overflow menu in `actions`.
 *
 * Deliberately one row tall — see `docs/page-chrome.md`. Tabs, filters
 * and tools belong in the toolbar below it, not here.
 */
export function PageHeader({
  backHref,
  backLabel,
  title,
  status,
  actions,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {backHref && (
        <Link
          href={backHref}
          className="flex shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {title}
        {status}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
