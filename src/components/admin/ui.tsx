// Piezas visuales del panel (sin estado): encabezados, tarjetas, insignias, campos y botones.
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 border border-foreground bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-background transition-colors hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center gap-2 border border-border bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center gap-2 border border-destructive/60 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-sm underline underline-offset-4 hover:text-muted-foreground',
};

export const inputClass =
  'w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none disabled:opacity-60';

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-medium tracking-wide">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border border-border bg-card p-4 sm:p-5', className)}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="font-display text-sm tracking-[0.18em] text-muted-foreground">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const content = (
    <>
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block border border-border bg-card p-4 transition-colors hover:border-foreground/60">
      {content}
    </Link>
  ) : (
    <div className="border border-border bg-card p-4">{content}</div>
  );
}

const BADGE_TONES = {
  neutral: 'border-border text-muted-foreground',
  success: 'border-emerald-500/50 text-emerald-400',
  warning: 'border-amber-500/50 text-amber-300',
  danger: 'border-destructive/60 text-red-400',
  info: 'border-sky-500/50 text-sky-300',
  strong: 'border-foreground text-foreground',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider', BADGE_TONES[tone], className)}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-border px-6 py-10 text-center">
      <p className="font-display tracking-[0.15em]">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', className)}>
      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: React.ReactNode }) {
  const tones = {
    info: 'border-sky-500/40 bg-sky-500/5 text-sky-100',
    warning: 'border-amber-500/40 bg-amber-500/5 text-amber-100',
    danger: 'border-destructive/50 bg-destructive/10 text-red-200',
    success: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-100',
  };
  return <div className={cn('border px-4 py-3 text-sm', tones[tone])}>{children}</div>;
}

const DATE_TIME = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const DATE = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' });

export function formatDateTime(value: string | null | undefined) {
  return value ? DATE_TIME.format(new Date(value)) : '—';
}

export function formatDate(value: string | null | undefined) {
  return value ? DATE.format(new Date(value)) : '—';
}

// "hace 5 min", "hace 3 h", "hace 2 días".
export function timeAgo(value: string | null | undefined, now = Date.now()) {
  if (!value) return '—';
  const minutes = Math.round((now - Date.parse(value)) / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 60) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  return formatDate(value);
}

// Fecha ISO de hace n días (para filtros de consultas).
export function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
