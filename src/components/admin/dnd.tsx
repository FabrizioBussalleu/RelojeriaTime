'use client';

// Arrastrar y soltar del panel (organizador y fotos del producto) sobre dnd-kit.
// Mouse: agarrar la tarjeta y soltarla donde va. Celular: mantener presionado y arrastrar.
// Teclado: enfocar la tarjeta, Espacio para levantarla, flechas para moverla y Espacio para soltarla.
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type ScreenReaderInstructions } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export function useDragSensors() {
  return useSensors(
    // Unos píxeles de margen: un clic simple sigue funcionando en los botones de la tarjeta.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // En pantallas táctiles, mantener presionado para no bloquear el scroll de la página.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

export function dragAccessibility(describe: (id: string) => string, position: (id: string) => number): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  return {
    screenReaderInstructions: {
      draggable: 'Para mover, presiona Espacio, usa las flechas y presiona Espacio de nuevo para soltar. Escape cancela.',
    },
    announcements: {
      onDragStart: ({ active }) => `Levantaste ${describe(String(active.id))}, en la posición ${position(String(active.id))}.`,
      onDragOver: ({ active, over }) => (over ? `${describe(String(active.id))} irá a la posición ${position(String(over.id))}.` : `${describe(String(active.id))} está fuera de la lista.`),
      onDragEnd: ({ active, over }) => (over ? `Soltaste ${describe(String(active.id))} en la posición ${position(String(over.id))}.` : `Soltaste ${describe(String(active.id))}.`),
      onDragCancel: ({ active }) => `Se canceló. ${describe(String(active.id))} volvió a su lugar.`,
    },
  };
}
