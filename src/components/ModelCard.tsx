import type { ReactNode } from 'react';

// Generic presentational shell — Marketplace and My Models compose it with
// different badge sets and footer actions rather than duplicating layout.
export function ModelCard({
  title,
  badges,
  meta,
  footer,
}: {
  title: string;
  badges?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {badges && <div className="card-meta">{badges}</div>}
      {meta && <div className="card-meta">{meta}</div>}
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}
