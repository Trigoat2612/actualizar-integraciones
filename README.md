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
- Las ejecuciones analizan un máximo inicial de 12 documentos por lote; ampliar exige colas y paginación persistente.
- Antes de usar en producción, verificar legalmente el tratamiento de datos del Poder Judicial por proveedores externos y habilitar controles institucionales de seguridad, retención y acceso. No desplegar información procesal en una aplicación pública sin esa aprobación.
- Recomendado: backup del Excel y pruebas de escritura en una copia antes de operar sobre la fuente oficial.
- NextAuth utiliza JWT de sesión protegido en cookies; nunca exhibir tokens OAuth en la interfaz ni los logs.
- Si hay varias aprobaciones simultáneas, la comprobación de fecha de modificación reduce colisiones pero no implementa una transacción; restringir la cuenta a un operador.
- Revisar las reglas de fecha y la zona horaria del proyecto, que está diseñado para `America/Lima`.

## Estado de publicación

El conector Vercel respondió `403 forbidden` al intentar crear el proyecto. No se ha publicado esta app. Una vez habilitados los permisos de creación/despliegue y las credenciales externas, debe instalarse y validarse con datos de prueba antes de declararla operativa.
