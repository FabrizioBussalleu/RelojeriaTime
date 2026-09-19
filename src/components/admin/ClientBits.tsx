'use client';

// Piezas interactivas pequeñas del panel.
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2, MessageCircle } from 'lucide-react';
import { renderTemplate, firstName } from '@/lib/crm/templates';
import { whatsappLink } from '@/lib/store';
import { cn } from '@/lib/utils';
import { buttonClass, inputClass } from './ui';

// Botón de envío que se deshabilita mientras la acción corre; con "confirm" pide confirmación antes.
export function SubmitButton({ children, variant = 'primary', confirm, className }: { children: React.ReactNode; variant?: keyof typeof buttonClass; confirm?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonClass[variant], className)}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

// "Abrir en WhatsApp": abre el chat del cliente con el mensaje de la plantilla elegida ya escrito.
export function WhatsAppChatLink({ phone, customerName, templates }: { phone: string; customerName: string | null; templates: { id: string; name: string; body: string; isDefault: boolean }[] }) {
  const [templateId, setTemplateId] = useState(templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? '');
  const text = useMemo(() => {
    const template = templates.find((item) => item.id === templateId);
    return template ? renderTemplate(template.body, { nombre: firstName(customerName) }) : '';
  }, [templateId, templates, customerName]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {templates.length > 1 ? (
        <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={cn(inputClass, 'sm:w-48')} aria-label="Plantilla del mensaje">
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      ) : null}
      <a href={whatsappLink(phone, text || undefined)} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary} title={text || undefined}>
        <MessageCircle className="h-4 w-4" aria-hidden />
        Abrir en WhatsApp
      </a>
    </div>
  );
}
