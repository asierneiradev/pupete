import Link from "next/link";
import { Lantern } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <div className="flex justify-center"><Lantern size={40} /></div>
      <p className="mt-3 font-dot text-6xl font-bold">404</p>
      <p className="story mt-2 text-lg text-ink-soft">Este sendero no lleva a ninguna parte… o no tienes permiso para verlo.</p>
      <Link href="/" className="btn mt-6">Volver al inicio</Link>
    </div>
  );
}
