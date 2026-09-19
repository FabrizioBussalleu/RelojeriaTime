export type LegalSection = { title: string; paragraphs: string[] };

export default function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: string; sections: LegalSection[] }) {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-10 md:py-14">
      <header className="mb-10 space-y-3">
        <h1 className="text-3xl md:text-4xl font-display">{title}</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Actualizado: {updated}</p>
        {intro ? <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}
      </header>
      <div className="space-y-8">
        {sections.map((section, index) => (
          <section key={section.title} aria-labelledby={`seccion-${index}`} className="space-y-3">
            <h2 id={`seccion-${index}`} className="text-lg font-display tracking-wider">
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
