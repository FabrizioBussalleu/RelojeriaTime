// Datos del proveedor que exigen el Libro de Reclamaciones y las páginas legales.
export const BUSINESS = {
  tradeName: 'Time Relojería',
  // Persona natural con negocio: en SUNAT el RUC figura a nombre del titular.
  legalName: 'Águila Pérez, Diego Aníbal',
  ruc: '10714907854',
  address: 'Av. Constructores Los Álamos 3',
  // Correo de contacto para consultas legales y ejercicio de derechos (Ley 29733).
  email: 'contact.time.pe@gmail.com',
} as const;

// Plazo de respuesta del Reglamento del Libro de Reclamaciones (D.S. 011-2011-PCM, modificado por D.S. 101-2022-PCM).
export const COMPLAINT_RESPONSE_DAYS = 15;
