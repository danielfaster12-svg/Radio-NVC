# Radio NVC:RP en Netlify (compartida para todos)

Qué incluye: la radio, el inicio de sesión con Discord y Roblox, chat y presencia en tiempo real (con Ably) y permisos por rol.
La voz entre jugadores (LiveKit) y la instalación como app se añaden después.

## 1. Subir a GitHub
Crea un repositorio nuevo y sube TODO el contenido de esta carpeta (incluidas las carpetas `netlify` y `public`).

## 2. Ably (tiempo real)
ably.com → crea cuenta → crea una app → pestaña "API Keys" → copia la clave (parece `abc123.xyz789:secreto`).
Esa es tu `ABLY_API_KEY`.

## 3. Netlify
netlify.com → entra con GitHub → Add new site → Import an existing project → elige el repositorio → Deploy.
Anota tu dirección (`https://algo.netlify.app`). Puedes cambiarla en Site configuration → Change site name.

## 4. Aplicaciones de Discord y Roblox
Redirect de Discord: `TU_DIRECCION/auth/discord/callback`
Redirect de Roblox:  `TU_DIRECCION/auth/roblox/callback` (scopes `openid` y `profile`)

## 5. Variables en Netlify
Site configuration → Environment variables:
- SESSION_SECRET: texto aleatorio de 40 caracteres o más (invéntalo con un generador de contraseñas)
- ABLY_API_KEY
- DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
- ROBLOX_CLIENT_ID, ROBLOX_CLIENT_SECRET
- OWNER_DISCORD_ID: tu ID de Discord (eres propietario y ves todos los canales)

Roles desde tu Discord (opcional pero necesario para que la gente vea los canales):
- DISCORD_GUILD_ID, DISCORD_BOT_TOKEN (un bot tuyo dentro del servidor)
- ROLE_VERIFICADO, ROLE_MANDO, ROLE_STAFF (ID de cada rol)

Después: Deploys → Trigger deploy → Clear cache and deploy site.

## Cómo funcionan los permisos
- Sin rol Verificado: solo canales OOC.
- Verificado: todos los canales.
- Mando y Staff: oficinas superiores y mover gente (arrastrar).
- Propietario: todo.
Los roles se dan en Discord, no en la radio.

## Importante
- No he podido probarlo con tus claves. Si algo falla, copia el mensaje de error.
- Los límites gratuitos de Netlify y Ably cambian: compruébalos en sus webs.
- Los secretos solo se pegan en Netlify, nunca en el chat ni en el repositorio.
