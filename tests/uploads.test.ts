import { describe, expect, it } from "vitest";
import { detectImage, MAX_UPLOAD_BYTES, readUpload, saveUpload } from "@/lib/uploads";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

describe("subida de fotos", () => {
  it("detecta formato por contenido", () => {
    expect(detectImage(PNG)?.ext).toBe("png");
    expect(detectImage(JPG)?.ext).toBe("jpg");
    expect(detectImage(Buffer.from("<svg onload=alert(1)>............"))).toBeNull();
  });

  it("guarda y vuelve a leer", async () => {
    const url = await saveUpload(PNG);
    expect(url).toMatch(/^\/api\/uploads\/[A-Za-z0-9_-]+\.png$/);
    const r = await readUpload(url.split("/").pop()!);
    expect(r?.mime).toBe("image/png");
    expect(r?.buf.equals(PNG)).toBe(true);
  });

  it("rechaza vacíos, enormes y no-imágenes", async () => {
    await expect(saveUpload(Buffer.alloc(0))).rejects.toThrow(/vacía/);
    await expect(saveUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/pesa/);
    await expect(saveUpload(Buffer.from("hola mundo, no soy imagen"))).rejects.toThrow(/Formato/);
  });

  it("no permite salir de la carpeta (path traversal)", async () => {
    expect(await readUpload("../../etc/passwd")).toBeNull();
    expect(await readUpload("..%2F..%2Fsecret.png")).toBeNull();
    expect(await readUpload("noexiste1234567.png")).toBeNull();
  });
});
