import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/phone';
import { renderTemplate, toPositionalTemplate, unknownVariables } from './templates';

describe('normalizePhone (misma regla que la base)', () => {
  it.each([
    ['982 762 602', '51982762602'],
    ['+51 982-762-602', '51982762602'],
    ['0051982762602', '51982762602'],
    ['+1 (650) 555-1234', '16505551234'],
    ['01 234 5678', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('renderTemplate', () => {
  it('inserta el nombre', () => {
    expect(renderTemplate('Hola {{nombre}}, ¿cómo estás?', { nombre: 'Ana' })).toBe('Hola Ana, ¿cómo estás?');
  });

  it('quita la variable sin dejar puntuación suelta si no hay nombre', () => {
    expect(renderTemplate('Hola {{nombre}}, llegaron relojes nuevos.', { nombre: null })).toBe('Hola, llegaron relojes nuevos.');
    expect(renderTemplate('¡Hola {{ nombre }}! Mira esto', {})).toBe('¡Hola! Mira esto');
  });

  it('detecta variables desconocidas', () => {
    expect(unknownVariables('Hola {{nombre}} {{apellido}}')).toEqual(['apellido']);
  });

  it('convierte a parámetros posicionales para WhatsApp', () => {
    expect(toPositionalTemplate('Hola {{nombre}}, {{nombre}} te esperamos')).toEqual({
      text: 'Hola {{1}}, {{1}} te esperamos',
      variables: ['nombre'],
    });
  });
});
