import { useState } from 'react';

/**
 * One collapsible surface in the story detail panel.
 *
 * The open state belongs to the mounted disclosure rather than the selected
 * story, so moving between stories does not forget which surfaces the operator
 * chose to inspect.
 */
export function DetailDisclosure({
  label,
  count,
  defaultOpen = false,
  className = '',
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const title = count === undefined ? label : `${label} (${count})`;

  return (
    <details
      className={`tree-detail-section${className ? ` ${className}` : ''}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="tree-detail-section-summary">{title}</summary>
      <div className="tree-detail-section-body">{children}</div>
    </details>
  );
}
