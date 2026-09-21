import Image from "next/image";
import { preconnect, preload } from "react-dom";

// Foto: Unsplash (licencia Unsplash: uso comercial libre). Reloj de acero con esfera negra y malla
// milanesa, sin marca a la vista. https://unsplash.com/photos/black-and-silver-round-analog-watch-
const PHOTO = "https://images.unsplash.com/photo-1585679212204-355a6966bf9a";
const WIDTHS = [640, 960, 1280, 1600, 2000, 2400];
const photoUrl = (width: number) => `${PHOTO}?auto=format&fit=crop&w=${width}&q=75`;
const SRC_SET = WIDTHS.map((width) => `${photoUrl(width)} ${width}w`).join(", ");
const SIZES = "(min-width: 768px) 58vw, 100vw";

// Entrada en CSS (sin JavaScript). El título y el texto solo se deslizan, sin transparencia, para que
// se pinten desde el primer cuadro; con "reducir movimiento" no hay animación.
const fadeUp = "motion-safe:animate-fade-in";
const rise = "motion-safe:animate-rise";

// Hero a pantalla completa (menos la barra de avisos y el menú): todo blanco, con la foto a la derecha
// (arriba en celular) fundiéndose con el fondo, sin costuras entre la foto y el texto.
const HeroSection = () => {
  // La foto es el elemento más grande de la home: se pide antes que el resto.
  preconnect("https://images.unsplash.com");
  preload(photoUrl(1280), { as: "image", imageSrcSet: SRC_SET, imageSizes: SIZES, fetchPriority: "high" });

  return (
    <section
      className="theme-light relative h-[calc(100svh-var(--site-top))] min-h-[34rem] overflow-hidden"
      aria-labelledby="hero-titulo"
    >
      <div className="absolute inset-x-0 top-0 h-[52%] md:inset-y-0 md:left-auto md:h-full md:w-[58%]" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto externa con srcset propio de Unsplash */}
        <img
          src={photoUrl(1280)}
          srcSet={SRC_SET}
          sizes={SIZES}
          alt=""
          width={2400}
          height={1800}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[52%_50%] md:object-[50%_50%]"
        />
        {/* Funde el borde de la foto con el blanco: abajo en celular, a la izquierda en escritorio. */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/0 via-55% md:bg-gradient-to-r md:via-30%" />
      </div>

      <div className="relative container mx-auto flex h-full items-end px-4 pb-24 md:items-center md:px-8 md:pb-0">
        <div className="max-w-md md:max-w-[34rem]">
          {/* En el celular no se muestra: cae sobre la foto y queda ilegible; el logo ya está en el menú. */}
          <div className={`${fadeUp} hidden items-center gap-4 [animation-delay:100ms] md:flex`}>
            <Image src="/brand/isotipo.svg" alt="" width={120} height={107} priority unoptimized className="h-10 w-auto md:h-14" />
            <p className="text-xs font-display tracking-[0.4em] text-muted-foreground md:text-sm">RELOJERÍA</p>
          </div>

          <h1 id="hero-titulo" className={`${rise} text-5xl font-display font-bold leading-[1.02] tracking-tight md:mt-6 md:text-7xl lg:text-8xl`}>
            El tiempo,
            <br />
            a tu estilo
          </h1>

          <p className={`${rise} mt-5 max-w-sm text-sm font-body leading-relaxed text-muted-foreground md:mt-6 md:max-w-md md:text-base`}>
            Relojes seleccionados para cada ocasión. Paga con Yape o transferencia y recibe atención personalizada por WhatsApp.
          </p>

          <div className={`${fadeUp} mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 md:mt-10 [animation-delay:300ms]`}>
            <a
              href="#catalogo"
              className="border border-foreground bg-foreground px-10 py-4 text-sm font-display uppercase tracking-[0.2em] text-background transition-colors duration-300 hover:bg-transparent hover:text-foreground"
            >
              Ver relojes
            </a>
            <a href="#como-comprar" className="border-b border-foreground pb-1 text-xs font-display uppercase tracking-[0.2em] hover:border-muted-foreground hover:text-muted-foreground">
              Cómo comprar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
