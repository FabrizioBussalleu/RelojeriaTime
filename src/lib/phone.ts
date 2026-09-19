// Misma regla que public.normalize_phone en la base: dígitos con código de país y sin "+".
// Un celular peruano de 9 dígitos (9XXXXXXXX) recibe el prefijo 51.
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return `51${digits}`;
  if (/^0051\d{9,}$/.test(digits)) return digits.slice(2);
  if (/^[1-9]\d{9,14}$/.test(digits)) return digits;
  return null;
}

// 51982762602 → "+51 982 762 602"; otros países se muestran con "+" y los dígitos agrupados de a 3.
export function displayPhone(normalized: string) {
  if (/^51\d{9}$/.test(normalized)) return `+51 ${normalized.slice(2).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`;
  return `+${normalized}`;
}
