import { type ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-paper-2 px-8 py-16 text-center">
      {icon && <div className="text-3xl mb-1">{icon}</div>}
      <p className="font-serif italic text-xl text-ink">{title}</p>
      {description && (
        <p className="text-sm text-ink-mute max-w-xs">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
