# Actualizador EJE No Penal: Calendar + Neon + Vercel

Aplicación web privada de revisión **bajo demanda** para las 35 integraciones Laboral del Programa EJE No Penal. El catálogo y las bitácoras históricas están en **Neon**; Google Calendar y Drive son las fuentes de reuniones y transcripciones. No modifica el Excel original.

## Capacidades implementadas

- Selección de rango de fechas o fecha específica en hora Lima (America/Lima).
- Descubrimiento paginado de eventos de Calendar y anexos de Drive; comparación de fechas de modificación.
- Inventario incremental de sesiones y fuentes en Neon, sin duplicarlas por reiterar el rango.
- Lectura por fragmentos de notas y transcripciones de texto con progreso persistente; si la fuente cambia, sus propuestas sin aprobar pasan a Desactualizado.
- Análisis estructurado opcional con IA compatible con OpenAI Chat Completions y fragmento literal de evidencia.
- Separación entre nota leída, fuente inaccesible y video pendiente. **No analiza videos** todavía.
- Hallazgos propuestos por integración, aprobación o rechazo con auditoría; solo los aprobados se agregan a la bitácora normalizada.
- Página de sesiones, detalle por integración, pendientes e historial.
- Descarga XLSX con Seguimiento, Sesiones, Fuentes, Historial, Pendientes y Auditoría.

## Estado del esquema

Neon: proyecto seguimientopejenp, base neondb, esquema integraciones_laboral. El catálogo con 35 integraciones se importó anteriormente del Excel, conservando números combinados como 12 / 14. Las tablas adicionales se encuentran en db/migration_calendar.sql. La migración se aplicó en Neon el 9 de noviembre de 2026.

## Habilitación en Vercel

Vincular la rama main al proyecto existente actualizar-integraciones. En Project > Settings > Environment Variables configurar las variables de .env.example para Production y ejecutar un despliegue.

1. DATABASE_URL: cadena de conexión pooled de Neon para neondb. Utilizar un rol limitado al esquema de este sistema, no permisos administrativos generales.
2. NEXTAUTH_URL: URL real del portal, por ejemplo https://TU-DOMINIO.vercel.app.
3. NEXTAUTH_SECRET: valor aleatorio de al menos 32 bytes.
4. GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET: cliente OAuth web en Google Cloud.
5. ALLOWED_EMAIL: correo del usuario autorizado a leer Calendar.
6. En Google Cloud habilitar Google Calendar API y Google Drive API. Agregar como URI OAuth autorizada https://TU-DOMINIO/api/auth/callback/google. Solicitar calendar.readonly y drive.readonly. El conector de ChatGPT **no proporciona estas credenciales**.
7. ANALYSIS_API_URL, ANALYSIS_API_KEY y ANALYSIS_MODEL: API externa Chat Completions compatible; la URL suele terminar en /v1/chat/completions.
8. AI_PROCESSING_APPROVED=true únicamente después de verificar autorización institucional, seguridad, retención y uso de transcripciones judiciales con el proveedor.

Visitar /api/health. Devuelve los nombres de variables pendientes y analysisReady, sin revelar secretos.

## Prueba funcional recomendada

- Autorizar acceso privado y seleccionar 04/11/2026 como fecha única.
- Buscar las sesiones y comprobar su listado en Neon y enlaces originales.
- Activar IA autorizada, analizar las notas de Conflicto de Autoridad y Acción Popular y comprobar la asociación de hallazgos SERNOT.
- Confirmar que las discrepancias horarias de Cautelar no se atribuyan sin evidencia a SERNOT.
- Repetir la misma fecha: no debe duplicarse ningún evento ni documento.
- Aprobar una propuesta comprobada y validar la entrada del historial; repetir la aprobación no debe duplicar el registro.
- Exportar Excel y corroborar exactamente 35 integraciones.

## Limitaciones actuales

La consulta de Calendar se realiza en una solicitud, útil para rangos de días o semanas. Para una revisión histórica masiva se requiere un trabajador con colas y reintentos duraderos. El modelo procesa transcripciones por secciones de hasta 18.000 caracteres; puede requerirse volver a pulsar analizar hasta completar la fuente. Los documentos con errores o videos sin transcribir nunca se consideran revisados por el mero descubrimiento. La fecha de un evento y el contenido no reemplazan la validación funcional por GSJ. Las acciones pendientes aprobadas necesitan una conciliación posterior para establecer su cierre real. La conexión y despliegue de producción solo se consideran operativos tras confirmar credenciales, build y pruebas.

No ejecutar tareas automáticas programadas.
