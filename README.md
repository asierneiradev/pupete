# 🏮 Pupete

Amigo invisible familiar, reutilizable cada año. Salas con sus reglas, listas de deseos con enlaces de compra, un sorteo justo y un sobre que se abre en el móvil.

Diseño de cuento en acuarela (ilustraciones SVG originales) con tipografía de matriz de puntos (Doto, Space Grotesk, Space Mono y Fraunces). Siempre en modo claro. Avisos push (opcionales, con claves VAPID) cuando te escriben en el buzón secreto.

## Qué hace

- **Primer arranque** en `/setup`: crea la primera cuenta de administración.
- **Salas** (las crea un admin) con estas opciones:
  - Fecha, lugar, portada y mensaje para la familia.
  - Modo de alta: **invitación** (enlace por WhatsApp), **lo hace el admin** (da de alta a cada persona y reparte su código de invitación) o **ambos**.
  - Grupos: todos juntos · **adultos y peques por separado** · **los mayores regalan a los peques** (los peques no regalan).
  - **Rango de precios** opcional. Las ideas que se salen se marcan con ⚠️.
  - **Buzón secreto** (chat anónimo) y **no repetir la pareja del año pasado**.
  - Fecha límite para completar la lista.
- **Acceso con nombre + PIN de 4 números** (sin email: pensado para gente mayor). Al entrar no importan mayúsculas, tildes ni signos («inaki» = «Iñaki»). Los nombres son únicos: si dos personas se llaman igual, una añade apellido o inicial. La primera vez se entra con el enlace de invitación (nombre + PIN) o con un código de invitación tipo `PINO-4821` que da el admin, y en ese momento se elige el PIN. El código deja de valer en cuanto hay PIN. Tras 5 fallos seguidos, la cuenta se bloquea 15 minutos. Si alguien olvida el PIN, el admin le **resetea el acceso** (código nuevo).
- **El admin puede eliminar personas**: se borran su cuenta, sus listas, sus fotos subidas, sus mensajes y sus avisos.
- **Ficha personal**: tallas, colores, "me encanta", "por favor no", alergias.
- **Lista de deseos**:
  - Cada idea lleva título, prioridad (⭐/👍/🤷), precio aproximado, detalles, hasta 5 enlaces de compra con vista previa automática (foto, título y precio) y foto propia.
  - Casilla **"Lo que quieras, sorpréndeme 🥰"**. Si no hay ni ideas ni casilla, la app avisa y no deja vaciar la lista.
  - Se puede copiar la lista de la edición anterior.
- **Exclusiones** (parejas o hermanos que no se tocan) y **comprobación** previa del sorteo.
- **Sorteo**:
  - Se hace en el servidor y prefiere un gran círculo único.
  - Respeta grupos y exclusiones, y evita repetir el año anterior (si es imposible, lo relaja y avisa).
  - Está protegido contra el doble clic. Se puede deshacer.
- **Revelación**: sobre lacrado animado. Quien regala ve la lista y la ficha de quien recibe y marca "comprado"; quien recibe nunca lo ve.
- **Panel de admin**:
  - Progreso: quién tiene lista y quién ha abierto su sobre (sin ver las asignaciones).
  - Códigos de invitación (para quien aún no tiene PIN) y tarjetas imprimibles.
  - Enlace de invitación: abrir, cerrar o cambiar.
  - **Crear la edición del año siguiente** (mismas personas, grupos, exclusiones y reglas).

## Tecnología

Next.js 15 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Vitest · Playwright (E2E).

```
src/lib/draw.ts           algoritmo del sorteo (puro, sin BD)
src/lib/services/*.ts     lógica de negocio (auth, salas, participantes, deseos, sorteo, chat)
src/lib/og.ts             vista previa de enlaces con protección SSRF
src/app/actions/*.ts      server actions (formularios → servicios)
src/app/**/page.tsx       páginas
src/components/           UI (escenario, sobre, formularios, panel admin…)
prisma/                   esquema y migraciones
tests/                    tests unitarios y de integración (BD real)
e2e/flow.py               recorrido completo con Playwright
scripts/admin-cli.ts      rescate: listar usuarios, resetear acceso (borra PIN, da código nuevo), hacer admin
```

## Puesta en marcha (Docker)

Necesitas un servidor con Docker y Docker Compose, y un dominio apuntando a él. La app escucha solo en `127.0.0.1`; delante va un proxy inverso con HTTPS (nginx, Caddy, Traefik…).

```bash
git clone <url-del-repo> pupete && cd pupete
cp .env.example .env
```

Edita `.env`:

| Variable | Qué poner |
|---|---|
| `APP_URL` | Tu URL pública, sin barra final: `https://pupete.tudominio.com`. Se usa en los enlaces de invitación y para activar las cookies seguras. |
| `APP_SECRET` | `openssl rand -base64 48`. **No lo cambies después**: invalida códigos de invitación y PIN. |
| `POSTGRES_PASSWORD` | Una contraseña larga para la BD. |
| `SETUP_TOKEN` | Recomendado: `openssl rand -hex 16`. `/setup` lo pedirá para crear el primer admin. |
| `APP_PORT` / `DB_PORT` | Puertos en `127.0.0.1` del host (3020 y 3021 por defecto). |
| `APP_TIMEZONE` | Zona horaria de las salas (por defecto `Europe/Madrid`). |
| `VAPID_*` | Opcional, para avisos push: `npx web-push generate-vapid-keys`. `VAPID_SUBJECT` = `mailto:` con tu email. |

```bash
docker compose up -d --build        # migra la BD sola al arrancar
curl -s http://127.0.0.1:3020/api/health
```

### HTTPS con nginx

Si usas nginx y certbot en el host, `deploy/nginx-setup.sh` crea el vhost y emite el certificado:

```bash
sudo ./deploy/nginx-setup.sh pupete.tudominio.com tu@email.com 3020
```

Con otro proxy, lo imprescindible es:

- Reenviar `Host`, `X-Real-IP`, `X-Forwarded-For` y `X-Forwarded-Proto`. Sin `Host`, las server actions fallan con "Invalid Server Actions request". Sin `X-Real-IP`, el limitador de intentos trata a todos como la misma IP.
- Permitir peticiones de hasta ~6 MB (fotos de hasta 3 MB).
- **No publiques el puerto de la app directamente**: la IP del cliente se lee de esas cabeceras.

Después abre `https://pupete.tudominio.com/setup` y crea tu cuenta de admin.

### Arranque automático y backups (opcional)

```bash
sudo ./deploy/host-setup.sh     # unidad systemd + cron diario de backup (03:30, 30 días)
./deploy/backup.sh ./backups    # backup manual: BD + fotos + .env
```

El backup incluye el `.env` (con `APP_SECRET`): guárdalo en un sitio seguro. Restaurar la BD:

```bash
gunzip -c backups/pupete-db-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U pupete -d pupete
```

### Actualizar

```bash
git pull && docker compose up -d --build
```

### A tener en cuenta

- Una sola réplica: el limitador de intentos de login vive en memoria.
- `/setup` solo está abierto mientras no hay usuarios. Sin `SETUP_TOKEN`, quien llegue primero se queda el admin: créalo nada más arrancar o define el token.
- Los datos viven en `./data` (BD en `data/pg`, fotos en `data/uploads`). Ni `data/`, ni `backups/`, ni `.env` van a git.
- La interfaz está en castellano.

## Desarrollo

```bash
cp .env.example .env            # APP_URL=http://localhost:3000 y DATABASE_URL a tu Postgres
npm install
npx prisma migrate dev          # crea las tablas
npm run dev                     # http://localhost:3000 → /setup
```

En desarrollo `APP_SECRET` puede quedar vacío (usa uno de prueba). En producción es obligatorio.

## Tests

Los tests usan un PostgreSQL real. La base de datos `pupete_test` se migra al empezar y se vacía antes de cada test:

```bash
docker run -d --name pupete-test-pg -e POSTGRES_USER=pupete -e POSTGRES_PASSWORD=pupete \
  -e POSTGRES_DB=pupete_test -p 127.0.0.1:5544:5432 postgres:17-alpine
npm test
# otra BD: TEST_DATABASE_URL=postgresql://… npm test
```

E2E con Playwright para Python (instancia arrancada y BD **vacía**). Usa `localhost`, no `127.0.0.1`: la cookie va por host.

```bash
DATABASE_URL=postgresql://… ./e2e/reset-db.sh     # ¡vacía todas las tablas!
python3 e2e/flow.py http://localhost:3000 ./screenshots
```

## Rescate

CLI para cuando alguien se queda fuera. Necesita `DATABASE_URL` hacia la BD (con Docker, `127.0.0.1:DB_PORT`) y el **mismo** `APP_SECRET` que la app:

```bash
npm run admin -- list
npm run admin -- reset-code "Maite"      # borra su PIN y le da un código nuevo
npm run admin -- make-admin "Maite"
```

## Licencia

MIT. Puedes usarlo, modificarlo y redistribuirlo citando el aviso de copyright (ver `LICENSE`).

