import { describe, expect, it } from "vitest";
import { fetchPreview, isPrivateIp, normalizeUrl, parsePreview } from "@/lib/og";

describe("parsePreview", () => {
  it("lee Open Graph y precio de producto", () => {
    const html = `<html><head>
      <meta property="og:title" content="Taza de cerámica &amp; madera">
      <meta property="og:image" content="/img/taza.jpg">
      <meta property="og:site_name" content="La Tienda">
      <meta property="product:price:amount" content="14.90">
      <meta property="product:price:currency" content="EUR">
    </head></html>`;
    const p = parsePreview(html, "https://tienda.es/taza");
    expect(p.title).toBe("Taza de cerámica & madera");
    expect(p.imageUrl).toBe("https://tienda.es/img/taza.jpg");
    expect(p.siteName).toBe("La Tienda");
    expect(p.priceText).toMatch(/14,90\s?€/);
  });

  it("usa <title> y el dominio si no hay OG", () => {
    const p = parsePreview("<title>Libro bonito</title>", "https://www.libros.com/x");
    expect(p.title).toBe("Libro bonito");
    expect(p.siteName).toBe("libros.com");
    expect(p.imageUrl).toBeUndefined();
  });

  it("lee el precio de JSON-LD", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Puzzle","offers":{"@type":"Offer","price":"24.5","priceCurrency":"EUR"}}</script>`;
    expect(parsePreview(html, "https://a.com").priceText).toMatch(/24,50\s?€/);
  });

  it("ignora JSON-LD roto e imágenes no http", () => {
    const html = `<script type="application/ld+json">{roto</script><meta property="og:image" content="javascript:alert(1)">`;
    const p = parsePreview(html, "https://a.com");
    expect(p.priceText).toBeUndefined();
    expect(p.imageUrl).toBeUndefined();
  });
});

describe("normalizeUrl", () => {
  it("añade https y valida", () => {
    expect(normalizeUrl("amazon.es/dp/123")).toBe("https://amazon.es/dp/123");
    expect(normalizeUrl("http://a.com/x")).toBe("http://a.com/x");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://a.com")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
    expect(normalizeUrl("https://user:pass@a.com")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("protección SSRF", () => {
  it("detecta IPs privadas", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.1", "2a00:1450:4003:80e::200e"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("no descarga nada de la red interna", async () => {
    const r = await fetchPreview("http://127.0.0.1/admin");
    expect(r.title).toBeUndefined();
    expect(r.url).toBe("http://127.0.0.1/admin");
    const r2 = await fetchPreview("http://169.254.169.254/latest/meta-data");
    expect(r2.title).toBeUndefined();
  });

  it("rechaza URLs inválidas", async () => {
    await expect(fetchPreview("javascript:alert(1)")).rejects.toThrow();
  });
});
