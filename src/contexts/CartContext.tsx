"use client";

import React, { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';
import { CartItem, CartContextType } from '@/types/cart';

// Las notificaciones (sonner) se cargan aparte para no pesar en la carga inicial de la tienda.
function notify(kind: 'success' | 'info', message: string) {
  void import('sonner').then(({ toast }) => toast[kind](message));
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Store del carrito respaldado en localStorage. Con useSyncExternalStore el servidor renderiza un
// carrito vacío y el cliente toma el guardado al hidratar, sin desajustes ni efectos encadenados.
// Clave versionada: los carritos del sitio legado (por producto, no por variante) se ignoran.
const CART_STORAGE_KEY = 'time-cart-v1';
const EMPTY_CART: CartItem[] = [];
const listeners = new Set<() => void>();
let cachedCart: CartItem[] | null = null;

// localStorage puede estar bloqueado o tener un valor corrupto: nunca debe tumbar la app.
const readStoredCart = (): CartItem[] => {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]');
        return Array.isArray(parsed) ? (parsed as CartItem[]).filter((item) => typeof item?.variantId === 'string') : EMPTY_CART;
    } catch {
        return EMPTY_CART;
    }
};

const getCartSnapshot = () => (cachedCart ??= readStoredCart());
const getServerCartSnapshot = () => EMPTY_CART;

const subscribeToCart = (listener: () => void) => {
    listeners.add(listener);
    // Mantiene el carrito sincronizado entre pestañas.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== CART_STORAGE_KEY) return;
        cachedCart = null;
        listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
};

const updateCart = (update: (previous: CartItem[]) => CartItem[]) => {
    cachedCart = update(getCartSnapshot());
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cachedCart));
    } catch {
        // Sin almacenamiento el carrito sigue funcionando en memoria.
    }
    listeners.forEach((listener) => listener());
};

const subscribeToNothing = () => () => {};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const items = useSyncExternalStore(subscribeToCart, getCartSnapshot, getServerCartSnapshot);
    const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
    const [isOpen, setIsOpen] = useState(false);

    const addItem = useCallback((newItem: Omit<CartItem, 'quantity'>) => {
        const existing = getCartSnapshot().find((item) => item.variantId === newItem.variantId);
        if (existing && existing.quantity >= newItem.maxQuantity) {
            notify('info', `Ya tienes en el carrito todo el stock disponible de ${newItem.name}`);
            setIsOpen(true);
            return;
        }
        updateCart((prev) =>
            existing
                ? prev.map((item) =>
                    item.variantId === newItem.variantId ? { ...item, ...newItem, quantity: item.quantity + 1 } : item
                )
                : [...prev, { ...newItem, quantity: 1 }]
        );
        notify('success', `${newItem.name} se agregó al carrito`);
        setIsOpen(true);
    }, []);

    const removeItem = useCallback((variantId: string) => {
        updateCart((prev) => prev.filter((item) => item.variantId !== variantId));
        notify('info', 'Producto retirado del carrito');
    }, []);

    const updateQuantity = useCallback((variantId: string, quantity: number) => {
        if (quantity <= 0) {
            removeItem(variantId);
            return;
        }
        updateCart((prev) =>
            prev.map((item) =>
                item.variantId === variantId ? { ...item, quantity: Math.min(quantity, item.maxQuantity) } : item
            )
        );
    }, [removeItem]);

    const toggleCart = useCallback((open?: boolean) => {
        setIsOpen((prev) => (open !== undefined ? open : !prev));
    }, []);

    const clearCart = useCallback(() => {
        updateCart(() => EMPTY_CART);
    }, []);

    const cartCount = items.reduce((acc, item) => acc + item.quantity, 0);
    const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                items,
                hydrated,
                isOpen,
                addItem,
                removeItem,
                updateQuantity,
                toggleCart,
                clearCart,
                cartCount,
                subtotal,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
