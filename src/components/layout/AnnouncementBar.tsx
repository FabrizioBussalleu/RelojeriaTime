// Solo mensajes verificables: nada de promociones que la tienda no aplica.
const AnnouncementBar = ({ messages }: { messages: string[] }) => {
  const repeated = [...messages, ...messages, ...messages, ...messages];

  return (
    <section className="bg-foreground text-background py-2.5 overflow-hidden" aria-label="Avisos de la tienda">
      <p className="sr-only">{messages.join('. ')}</p>
      <div className="marquee flex whitespace-nowrap" aria-hidden="true">
        {repeated.map((text, index) => (
          <span key={index} className="mx-8 text-xs font-display uppercase tracking-[0.2em]">
            {text} <span className="mx-4">✦</span>
          </span>
        ))}
      </div>
    </section>
  );
};

export default AnnouncementBar;
