// Una línea del carrito es una variante concreta (p. ej. "Aurora — 40 mm").
// El precio es solo informativo: el total real lo calcula la base al crear el pedido.
export interface CartItem {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  variantLabel: string | null;
  price: number;
  imageSrc: string | null;
  quantity: number;
  maxQuantity: number;
}

export interface CartContextType {
  items: CartItem[];
  hydrated: boolean;
  isOpen: boolean;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  toggleCart: (isOpen?: boolean) => void;
  clearCart: () => void;
  cartCount: number;
  subtotal: number;
}
