'use client';

import { useEffect, useRef } from 'react';

// Widget de Cloudflare Turnstile. Se dibuja de forma explícita para poder reiniciarlo después de un
// intento fallido: cada verificación sirve una sola vez. El propio widget agrega al formulario el campo
// oculto "cf-turnstile-response" que valida el servidor.
type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript() {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) return existing;
  const script = document.createElement('script');
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  return script;
}

export function TurnstileWidget({ siteKey, resetKey = 0 }: { siteKey: string; resetKey?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active || !holder.current || widgetId.current) return;
      widgetId.current = window.turnstile!.render(holder.current, { sitekey: siteKey, theme: 'dark', language: 'es', action: 'ingreso-panel' });
    };
    if (window.turnstile) draw();
    else loadScript().addEventListener('load', draw);
    return () => {
      active = false;
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  // Tras un error del formulario, el token ya se gastó: se pide uno nuevo.
  useEffect(() => {
    if (resetKey > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  return <div ref={holder} className="flex min-h-[65px] justify-center" />;
}
