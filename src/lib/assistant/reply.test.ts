import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '@/lib/catalog';
import { renderReply, sanitizeFreeText, type AssistantReply } from './reply';
import { brandSummary, searchCatalog } from './search';

const SITE = 'https://time.pe';

function product(overrides: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>): CatalogProduct {
  return {
    slug: overrides.id,
    brand: 'Bulova',
    category: 'Relojes',
    gender: 'hombre',
    movement: 'automatico',
    price: 1000,
    compareAtPrice: null,
    position: 1,
    wholesalePosition: 1,
    wholesaleOnly: false,
    createdAt: '2026-09-01T00:00:00Z',
    stock: 3,
    images: [
      { src: `img/${overrides.id}/1`, alt: '' },
      { src: `img/${overrides.id}/2`, alt: '' },
      { src: `img/${overrides.id}/3`, alt: '' },
      { src: `img/${overrides.id}/4`, alt: '' },
    ],
    variants: [{ id: `${overrides.id}-v`, label: 'Única', stock: 3, price: 1000 }],
    ...overrides,
  };
}

const catalog = [
  product({ id: 'a', name: 'Lunar Pilot', price: 1200, variants: [{ id: 'a-v', label: 'Única', stock: 2, price: 1200 }], stock: 2 }),
  product({ id: 'b', name: 'Classic', price: 800, position: 2, gender: 'mujer', variants: [{ id: 'b-v', label: 'Única', stock: 5, price: 800 }], stock: 5 }),
  product({ id: 'c', name: 'Agotado', stock: 0, variants: [{ id: 'c-v', label: 'Única', stock: 0, price: 900 }] }),
  product({
    id: 'd',
    brand: 'Seiko',
    name: 'Presage',
    price: 1500,
    compareAtPrice: 1800,
    variants: [
      { id: 'd-38', label: '38 mm', stock: 1, price: 1500 },
      { id: 'd-42', label: '42 mm', stock: 4, price: 1600 },
    ],
    stock: 5,
  }),
];
const byId = new Map(catalog.map((item) => [item.id, item]));
const settings = { maxProducts: 3, maxPhotosPerProduct: 3, photosMode: 'caption' as const, siteUrl: SITE };

const reply = (overrides: Partial<AssistantReply>): AssistantReply => ({
  apertura: 'Tenemos estas opciones para ti.',
  producto_ids: [],
  cierre: '',
  derivar_a_humano: false,
  motivo_derivacion: '',
  ...overrides,
});

describe('searchCatalog', () => {
  it('filtra por marca sin importar mayúsculas ni tildes y excluye agotados', () => {
    const result = searchCatalog(catalog, { marca: 'BULOVA' });
    expect(result.products.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('filtra por rango de precio usando el precio desde', () => {
    expect(searchCatalog(catalog, { precio_max: 1000 }).products.map((item) => item.id)).toEqual(['b']);
    expect(searchCatalog(catalog, { precio_min: 1400 }).products.map((item) => item.id)).toEqual(['d']);
  });

  it('el filtro de género incluye relojes unisex', () => {
    const withUnisex = [...catalog, product({ id: 'u', name: 'Unisex', gender: 'unisex' })];
    expect(searchCatalog(withUnisex, { genero: 'mujer' }).products.map((item) => item.id).sort()).toEqual(['b', 'u']);
  });

  it('resume marcas con stock y rango de precios', () => {
    expect(brandSummary(catalog)).toEqual([
      { marca: 'Bulova', relojes_disponibles: 2, precio_min: 800, precio_max: 1200 },
      { marca: 'Seiko', relojes_disponibles: 1, precio_min: 1500, precio_max: 1500 },
    ]);
  });
});

describe('renderReply', () => {
  it('arma apertura, nombre y precio desde la base, fotos y cierre', () => {
    const { parts } = renderReply(reply({ producto_ids: ['a'], cierre: '¿Quieres reservarlo?' }), byId, settings);
    expect(parts.map((part) => part.kind)).toEqual(['text', 'image', 'image', 'image', 'text']);
    const first = parts[1];
    expect(first.kind === 'image' && first.caption).toContain('*Bulova Lunar Pilot*');
    expect(first.kind === 'image' && first.caption).toContain('S/');
    expect(first.kind === 'image' && first.caption).toContain(`${SITE}/producto/a`);
    expect(first.kind === 'image' && first.caption).toContain('Últimas 2 unidades');
    expect(parts.filter((part) => part.kind === 'image' && part.caption === null)).toHaveLength(2);
  });

  it('descarta ids inventados y productos agotados', () => {
    const result = renderReply(reply({ producto_ids: ['no-existe', 'c', 'b'] }), byId, settings);
    expect(result.products.map((item) => item.id)).toEqual(['b']);
    expect(result.droppedIds).toEqual(['no-existe', 'c']);
  });

  it('respeta el máximo de productos y de fotos', () => {
    const result = renderReply(reply({ producto_ids: ['a', 'b', 'd'] }), byId, { ...settings, maxProducts: 2, maxPhotosPerProduct: 1 });
    expect(result.products).toHaveLength(2);
    expect(result.parts.filter((part) => part.kind === 'image')).toHaveLength(2);
  });

  it('en modo separado manda un texto por reloj antes de sus fotos', () => {
    const { parts } = renderReply(reply({ producto_ids: ['b'] }), byId, { ...settings, photosMode: 'separate' });
    expect(parts.map((part) => part.kind)).toEqual(['text', 'text', 'image', 'image', 'image']);
  });

  it('muestra opciones de variantes y el precio anterior tachado', () => {
    const { parts } = renderReply(reply({ producto_ids: ['d'] }), byId, settings);
    const caption = parts[1].kind === 'image' ? parts[1].caption : '';
    expect(caption).toContain('Desde S/');
    expect(caption).toMatch(/~S\/\s*1,800\.00~/);
    expect(caption).toContain('38 mm');
  });
});

describe('sanitizeFreeText', () => {
  it('quita oraciones con precios que no coinciden con los productos mostrados', () => {
    expect(sanitizeFreeText('Te gustará. Cuesta S/ 999. ¿Lo reservo?', [1200], SITE)).toBe('Te gustará. ¿Lo reservo?');
    expect(sanitizeFreeText('Cuesta 1,200.00 soles, ideal para ti.', [1200], SITE)).toBe('Cuesta 1,200.00 soles, ideal para ti.');
  });

  it('quita enlaces que no son de la tienda', () => {
    expect(sanitizeFreeText('Mira https://otra-tienda.com/x y https://time.pe/#catalogo', [], SITE)).toBe('Mira y https://time.pe/#catalogo');
  });
});
