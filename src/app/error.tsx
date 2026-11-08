"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="font-dot text-5xl font-bold">VAYA</p>
      <p className="story mt-2 text-lg text-ink-soft">Se ha apagado un farolillo. Prueba otra vez.</p>
      <button type="button" className="btn mt-6" onClick={reset}>Reintentar</button>
    </div>
  );
}
