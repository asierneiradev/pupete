import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";
import { Logo } from "./Logo";

export async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="no-print relative z-20 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <Logo />
      <nav className="flex items-center gap-2">
        {user ? (
          <>
            {user.role === "ADMIN" && (
              <Link href="/admin/nueva" className="btn btn-sm hidden sm:inline-flex">
                + Nueva sala
              </Link>
            )}
            <Link href="/perfil" className="avatar w-10 h-10 text-xl hover:scale-105 transition-transform" title={`Mi perfil (${user.name})`} aria-label="Mi perfil">
              {user.avatar}
            </Link>
            <LogoutButton />
          </>
        ) : (
          <Link href="/entrar" className="btn btn-sm">Entrar</Link>
        )}
      </nav>
    </header>
  );
}
