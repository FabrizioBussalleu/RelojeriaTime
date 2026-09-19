"use client";

import { useActionState, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, LogIn } from 'lucide-react';
import { signIn, type SignInState } from '@/app/admin/actions';
import { TurnstileWidget } from './TurnstileWidget';

const initialState: SignInState = { error: null };

export function LoginForm({ redirectTo, turnstileSiteKey }: { redirectTo: string; turnstileSiteKey: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, formAction, isSubmitting] = useActionState(signIn, initialState);
  const error = state.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/80 p-8 shadow-lg">
        <header className="mb-8 text-center">
          <Image src="/brand/logo-horizontal-negativo.svg" alt="Time Relojería" width={167} height={48} priority unoptimized className="mx-auto h-12 w-auto" />
          <h1 className="mt-6 text-2xl font-light uppercase tracking-[0.3em]">Panel administrativo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresa con las credenciales otorgadas para gestionar el catálogo.
          </p>
        </header>

        <form className="space-y-5" action={formAction}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Correo electrónico
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-border/80 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="tu@correo.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Contraseña
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-border/80 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} resetKey={state.intento ?? 0} /> : null}

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/80 bg-foreground px-4 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-background transition-colors hover:bg-foreground/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <footer className="mt-6 text-center text-xs text-muted-foreground">
          <p>
            <Link href="/" className="underline hover:text-foreground">Volver a la tienda</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
