/**
 * Vista previa de enlaces de compra: título, imagen, tienda y precio.
 * Protección SSRF: solo http(s), puertos estándar, y nunca IPs privadas,
 * loopback o link-local (se comprueba en cada redirección).
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

export interface LinkPreview {
  url: string;
  title?: string;
  imageUrl?: string;
  siteName?: string;
  priceText?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

function metaContent(html: string, keys: string[]): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of keys) {
    for (const tag of tags) {
      const attr = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i);
      if (!attr || attr[1].toLowerCase() !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
      const v = content?.[1] ?? content?.[2];
      if (v && v.trim()) return decodeEntities(v);
    }
  }
  return undefined;
}

function formatPrice(amount: string, currency?: string): string | undefined {
  const n = Number(amount.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: (currency || "EUR").toUpperCase() }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

/** Busca precio en JSON-LD (schema.org Product/Offer). */
function jsonLdPrice(html: string): string | undefined {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const found = findOffer(JSON.parse(body));
      if (found) return found;
    } catch {
      /* JSON-LD inválido: ignorar */
    }
  }
  return undefined;
}

function findOffer(node: unknown, depth = 0): string | undefined {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findOffer(n, depth + 1);
      if (r) return r;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  const price = o.price ?? o.lowPrice;
  if ((typeof price === "string" || typeof price === "number") && String(price).trim()) {
    const r = formatPrice(String(price), typeof o.priceCurrency === "string" ? o.priceCurrency : undefined);
    if (r) return r;
  }
  for (const k of ["offers", "@graph", "mainEntity"]) {
    const r = findOffer(o[k], depth + 1);
    if (r) return r;
  }
  return undefined;
}

/** Extrae la vista previa de un HTML ya descargado (función pura). */
export function parsePreview(html: string, pageUrl: string): LinkPreview {
  const title =
    metaContent(html, ["og:title", "twitter:title"]) ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]) : undefined);
  let imageUrl = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
  if (imageUrl) {
    try {
      imageUrl = new URL(imageUrl, pageUrl).toString();
      if (!/^https?:/i.test(imageUrl)) imageUrl = undefined;
    } catch {
      imageUrl = undefined;
    }
  }
  const siteName = metaContent(html, ["og:site_name", "application-name"]) ?? hostLabel(pageUrl);
  const amount = metaContent(html, ["product:price:amount", "og:price:amount", "price"]);
  const currency = metaContent(html, ["product:price:currency", "og:price:currency", "pricecurrency"]);
  const priceText = (amount ? formatPrice(amount, currency) : undefined) ?? jsonLdPrice(html);
  return {
    url: pageUrl,
    title: title ? title.slice(0, 200) : undefined,
    imageUrl,
    siteName: siteName?.slice(0, 80),
    priceText,
  };
}

export function hostLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Normaliza y valida una URL que introduce el usuario. Devuelve null si no vale. */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && !net.isIP(u.hostname)) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("puerto no permitido");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("host no permitido");
}

const MAX_BYTES = 1_500_000;

/** Descarga la página y extrae la vista previa. Nunca lanza: si falla, devuelve lo mínimo. */
export async function fetchPreview(rawUrl: string): Promise<LinkPreview> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("URL no válida");
  const fallback: LinkPreview = { url, siteName: hostLabel(url) };
  try {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHost(current);
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PupeteLinkPreview/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-ES,es;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current);
        if (current.protocol !== "http:" && current.protocol !== "https:") return fallback;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return fallback;
      const reader = res.body?.getReader();
      if (!reader) return fallback;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
      return { ...parsePreview(html, current.toString()), url };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
