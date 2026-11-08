import { NextResponse, type NextRequest } from "next/server";
import { readUpload } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse("No autorizado", { status: 401 });
  const { name } = await params;
  const file = await readUpload(name);
  if (!file) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(file.buf), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
