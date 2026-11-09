# Asistente de seguimiento EJE No Penal · Laboral

Aplicación Next.js de revisión **exclusivamente manual** de las 35 integraciones laborales. Archivo maestro: `1tTnYZPYV-XTX4V_aX7TKK1yluPPf4qUn` (Excel `.xlsx` alojado en Google Drive).

## Funcionalidad

- Login OAuth Google restringido al correo `ALLOWED_EMAIL`.
- Botón **Ejecutar análisis** con periodo seleccionable (1, 2, 7, 14 días).
- Busca eventos de Google Calendar en la cuenta autenticada y notas Gemini adjuntas accesibles.
- Interpreta hechos, acuerdos, responsables y pendientes con la API Gemini. No presenta como examinadas grabaciones que no haya leído.
- Presenta **propuestas de cambios** que se revisan antes de confirmar.
- Solo tras confirmar, añade registros a la columna G del Excel original y a la hoja `Revisiones asistidas`; intenta evitar duplicados. Comprueba que el archivo no haya cambiado desde la revisión y vuelve a leerlo tras la escritura.
- No existen cron jobs ni ejecuciones automáticas.

## Requisitos para operar

1. Proyecto Google Cloud con OAuth Consent Screen y OAuth 2.0 Web Application, incluyendo `https://TU-DOMINIO.vercel.app/api/auth/callback/google` en los redirect URIs.
2. APIs habilitadas: Google Calendar API, Google Drive API.
3. Solicitar permisos OAuth `calendar.readonly` y `drive` para la cuenta dueña. **El alcance Drive completo tiene implicancias de seguridad y puede requerir verificación de Google para uso externo.** Restringe la app a un único usuario y aplica el consentimiento apropiado.
4. Una clave de Google Gemini API, custodiada exclusivamente como variable de entorno.
5. Variables de entorno indicadas en `.env.example`. No introducir claves en código, GitHub ni en el navegador.
6. Desplegar el repositorio en Vercel con framework Next.js, Node.js 22 o 24.

Local: `npm install && npm run dev`.

## Observaciones y restricciones

- El archivo maestro es un **XLSX no nativo**, por eso se descarga y actualiza mediante Drive API. Se requiere permiso de edición sobre él.
- El análisis automático usa **notas de Gemini** y sus transcripciones textuales accesibles. No procesa videos MP4 ni escucha audio.
- Las ejecuciones analizan hasta 20 documentos por lote, comenzando por los eventos más recientes o los que coinciden con la integración seleccionada. Para un histórico exhaustivo se necesitan colas y paginación persistente.
- Antes de usar en producción, verificar legalmente el tratamiento de datos del Poder Judicial por proveedores externos y habilitar controles institucionales de seguridad, retención y acceso. No desplegar información procesal en una aplicación pública sin esa aprobación.
- Recomendado: backup del Excel y pruebas de escritura en una copia antes de operar sobre la fuente oficial.
- NextAuth utiliza JWT de sesión protegido en cookies; nunca exhibir tokens OAuth en la interfaz ni los logs.
- Si hay varias aprobaciones simultáneas, la comprobación de fecha de modificación reduce colisiones pero no implementa una transacción; restringir la cuenta a un operador.
- Revisar las reglas de fecha y la zona horaria del proyecto, que está diseñado para `America/Lima`.

## Estado de publicación

El código reside en [Trigoat2612/actualizar-integraciones](https://github.com/Trigoat2612/actualizar-integraciones) y está vinculado con [el proyecto Vercel](https://vercel.com/miguel-trigosos-projects/actualizar-integraciones). La publicación de código no configura automáticamente OAuth ni Gemini.

### Variables y habilitación
Configurar en Vercel > Project > Settings > Environment Variables, en **Production**:
- `NEXTAUTH_URL`: URL real de producción (por ejemplo `https://actualizar-integraciones.vercel.app`, solo si ese dominio existe).
- `NEXTAUTH_SECRET`: secreto aleatorio de 32+ bytes. Generar fuera de GitHub.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: OAuth Web Client autorizado para la ruta `/api/auth/callback/google`.
- `GEMINI_API_KEY`: clave de Google AI Studio o Vertex apropiada según las políticas institucionales.
- `ALLOWED_EMAIL=miguel.trigoso.pj@gmail.com`
- `MASTER_FILE_ID=1tTnYZPYV-XTX4V_aX7TKK1yluPPf4qUn`

El portal consulta `/api/health` y muestra **solo los nombres** de variables faltantes, nunca secretos. Tras configurar credenciales, es necesario **redeploy**. Ejecutar la revisión primero sobre una copia del maestro y verificar las fórmulas y estilos. La aprobación final de cambios es manual. El máximo por lote es de 20 documentos con notas accesibles. No hay tareas cron.
