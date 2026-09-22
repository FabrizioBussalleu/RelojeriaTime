import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { BrandIcon } from "@/components/icons/BrandIcon";
import type { StoreSettings } from "@/lib/catalog";
import { whatsappLink } from "@/lib/store";

const SHOP_LINKS = [
  { href: "/#catalogo", label: "Relojes" },
  { href: "/seguimiento", label: "Seguimiento de pedido" },
  { href: "/registro", label: "Recibe novedades" },
  { href: "/por-mayor", label: "Compras al por mayor" },
];

const HELP_LINKS = [
  { href: "/envios-y-cambios", label: "Envíos y cambios" },
  { href: "/terminos", label: "Términos y condiciones" },
  { href: "/privacidad", label: "Política de privacidad" },
];

const linkClass = "text-sm font-body text-muted-foreground hover:text-foreground transition-colors";

const Footer = ({
  whatsappNumber,
  contactEmail,
  socialLinks = [],
}: {
  whatsappNumber: string | null;
  contactEmail: string | null;
  socialLinks?: StoreSettings["socialLinks"];
}) => {
  return (
    <footer className="bg-background border-t border-border">
      <div className="container mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          <div className="space-y-4">
            <Image
              src="/brand/logo-horizontal-negativo.svg"
              alt="Time Relojería"
              width={139}
              height={40}
              unoptimized
              className="h-10 w-auto"
            />
            <p className="text-sm font-body text-muted-foreground max-w-xs">
              Relojería online en Perú. Atención personalizada antes y después de tu compra.
            </p>
          </div>

          <nav aria-labelledby="footer-tienda">
            <h2 id="footer-tienda" className="text-xs font-display uppercase tracking-[0.2em] mb-4">
              Tienda
            </h2>
            <ul className="space-y-3">
              {SHOP_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-ayuda">
            <h2 id="footer-ayuda" className="text-xs font-display uppercase tracking-[0.2em] mb-4">
              Ayuda
            </h2>
            <ul className="space-y-3">
              {HELP_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-display uppercase tracking-[0.2em] mb-4">Contacto</h2>
            <ul className="space-y-3">
              {whatsappNumber ? (
                <li>
                  <a href={whatsappLink(whatsappNumber)} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-2`}>
                    <BrandIcon brand="whatsapp" className="h-4 w-4" />
                    WhatsApp
                  </a>
                </li>
              ) : null}
              {contactEmail ? (
                <li>
                  <a href={`mailto:${contactEmail}`} className={`${linkClass} inline-flex items-center gap-2 break-all`}>
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {contactEmail}
                  </a>
                </li>
              ) : null}
              {socialLinks.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-2`}>
                    <BrandIcon brand={link.brand} className="h-4 w-4" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-xs font-body text-muted-foreground">
          © {new Date().getFullYear()} Time Relojería. Todos los derechos reservados.{" "}
          <a
            href="https://elarisdigitalsolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Desarrollado por Elaris Digital Solutions.
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
