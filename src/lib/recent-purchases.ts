// Productos comprados en esta pestaña: si al volver atrás su ficha ya no tiene stock, la tienda lleva al
// inicio en vez de mostrar un reloj que no se puede comprar. Vive solo en sessionStorage.
const KEY = 'time:comprados';

function read(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPurchase(productIds: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...new Set([...productIds, ...read()])].slice(0, 50)));
  } catch {
    // Sin almacenamiento (modo privado estricto): solo se pierde la redirección tras la compra.
  }
}

export function wasJustPurchased(productId: string) {
  return read().includes(productId);
}
