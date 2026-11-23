-- Rol intermedio: organizador (crea y gestiona solo sus salas).
-- Aditivo: nadie cambia de rol con esta migración.
ALTER TYPE "Role" ADD VALUE 'ORGANIZER' BEFORE 'ADMIN';
