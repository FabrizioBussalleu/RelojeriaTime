import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat, betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { getProductDetailById, type CatalogProduct, type StoreSettings } from '@/lib/catalog';
import { formatPhone, GENDER_LABELS, MOVEMENT_LABELS } from '@/lib/store';
import { AssistantReplySchema, type AssistantReply } from './reply';
import { brandSummary, productForModel, searchCatalog } from './search';

export type AssistantModel = 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5';

export type ModelRequest = {
  model: AssistantModel;
  effort: 'low' | 'medium' | 'high';
  system: { stable: string; context: string };
  messages: Anthropic.Beta.BetaMessageParam[];
  catalog: CatalogProduct[];
  store: StoreSettings;
  siteUrl: string;
};

export type ModelResult =
  | { ok: true; reply: AssistantReply; usage: UsageTotals }
  | { ok: false; reason: string; usage: UsageTotals };

type UsageTotals = { input: number; output: number; cacheRead: number; cacheWrite: number; requests: number };

const GENDERS = Object.keys(GENDER_LABELS) as [keyof typeof GENDER_LABELS, ...(keyof typeof GENDER_LABELS)[]];
const MOVEMENTS = Object.keys(MOVEMENT_LABELS) as [keyof typeof MOVEMENT_LABELS, ...(keyof typeof MOVEMENT_LABELS)[]];

function catalogTools(catalog: CatalogProduct[], store: StoreSettings, siteUrl: string) {
  return [
    betaZodTool({
      name: 'buscar_relojes',
      description:
        'Busca relojes en el stock real de la tienda. Úsala siempre que el cliente pregunte por modelos, marcas, precios, presupuesto, género, tipo de movimiento o quiera ver opciones. Devuelve hasta 8 relojes con su id, precio desde, variantes y stock. Sin filtros devuelve los destacados.',
      inputSchema: z.object({
        marca: z.string().optional().describe('Marca pedida por el cliente, p. ej. "Bulova".'),
        genero: z.enum(GENDERS).optional().describe('hombre, mujer o unisex. Los unisex aparecen también para hombre y mujer.'),
        movimiento: z.enum(MOVEMENTS).optional(),
        precio_min: z.number().optional().describe('Soles.'),
        precio_max: z.number().optional().describe('Soles. Para "hasta 800" usa 800.'),
        texto: z.string().optional().describe('Palabras clave del modelo o estilo, p. ej. "dorado", "cronógrafo".'),
        incluir_agotados: z.boolean().optional().describe('Solo si el cliente pregunta por un modelo agotado.'),
      }),
      run: async (filters) => {
        const { total, products } = searchCatalog(catalog, filters);
        return JSON.stringify({ total_encontrados: total, relojes: products.map((product) => productForModel(product, siteUrl)) });
      },
    }),
    betaZodTool({
      name: 'listar_marcas',
      description: 'Lista las marcas con stock y su rango de precios. Úsala cuando pregunten qué marcas hay o cuando la marca pedida no aparece.',
      inputSchema: z.object({}),
      run: async () => JSON.stringify({ marcas: brandSummary(catalog) }),
    }),
    betaZodTool({
      name: 'ver_reloj',
      description: 'Devuelve la ficha completa de un reloj (descripción y especificaciones como diámetro, material o resistencia al agua). Úsala cuando el cliente pregunte detalles de un modelo concreto.',
      inputSchema: z.object({ id: z.string().describe('id devuelto por buscar_relojes.') }),
      run: async ({ id }) => {
        const product = await getProductDetailById(id);
        if (!product) return JSON.stringify({ error: 'No existe un reloj activo con ese id.' });
        return JSON.stringify({ ...productForModel(product, siteUrl), descripcion: product.description, especificaciones: product.specs });
      },
    }),
    betaZodTool({
      name: 'info_tienda',
      description: 'Datos de la tienda: métodos de pago, cómo comprar, reserva de pedidos y envíos. Úsala para preguntas que no son sobre un reloj en particular.',
      inputSchema: z.object({}),
      run: async () =>
        JSON.stringify({
          metodos_de_pago: [
            store.yapeNumber ? `Yape al ${formatPhone(store.yapeNumber)}` : null,
            store.plinNumber ? `Plin al ${formatPhone(store.plinNumber)}` : null,
            store.bankAccounts.length ? 'Transferencia bancaria (los datos se muestran al confirmar el pedido)' : null,
          ].filter(Boolean),
          como_comprar: `En la web (${siteUrl}) agregando el reloj al carrito, o pidiendo ayuda a una persona del equipo por este chat.`,
          reserva: `Los pedidos hechos en la web se reservan ${store.pendingOrderTtlHours} horas mientras se confirma el pago.`,
          envios: 'Se coordinan con una persona del equipo por WhatsApp después de confirmar el pago.',
          web: siteUrl,
        }),
    }),
  ];
}

// Parámetros según el modelo: Opus 5 y Sonnet 5 usan pensamiento adaptativo y esfuerzo;
// Haiku 4.5 no acepta "effort". Opus 5 lleva el respaldo del servidor ante negativas.
function modelParams(model: AssistantModel, effort: ModelRequest['effort']) {
  if (model === 'claude-haiku-4-5') return {};
  const base = { thinking: { type: 'adaptive' as const } };
  if (model === 'claude-opus-5') {
    return { ...base, effort, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
  }
  return { ...base, effort };
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export function isAssistantConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function generateAssistantReply(request: ModelRequest): Promise<ModelResult> {
  const usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
  const { effort, betas, fallbacks, ...thinking } = modelParams(request.model, request.effort) as {
    effort?: ModelRequest['effort'];
    betas?: string[];
    fallbacks?: 'default';
    thinking?: { type: 'adaptive' };
  };

  const runner = anthropic().beta.messages.toolRunner({
    model: request.model,
    max_tokens: 16000,
    max_iterations: 6,
    ...(betas ? { betas } : {}),
    ...(fallbacks ? { fallbacks } : {}),
    ...thinking,
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: request.system.stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: request.system.context },
    ],
    tools: catalogTools(request.catalog, request.store, request.siteUrl),
    output_config: { format: betaZodOutputFormat(AssistantReplySchema), ...(effort ? { effort } : {}) },
    messages: request.messages,
  });

  let final: Anthropic.Beta.BetaMessage | null = null;
  for await (const message of runner) {
    final = message;
    usage.requests += 1;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
  }

  if (!final) return { ok: false, reason: 'El modelo no respondió.', usage };
  if (final.stop_reason === 'refusal') return { ok: false, reason: 'El modelo se negó a responder.', usage };
  if (final.stop_reason === 'max_tokens') return { ok: false, reason: 'La respuesta superó el límite de tokens.', usage };
  if (final.stop_reason === 'tool_use') return { ok: false, reason: 'El asistente no terminó dentro del límite de consultas.', usage };

  const text = final.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'La respuesta no tuvo el formato esperado.', usage };
  }
  const parsed = AssistantReplySchema.safeParse(json);
  return parsed.success ? { ok: true, reply: parsed.data, usage } : { ok: false, reason: 'La respuesta no tuvo el formato esperado.', usage };
}
