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

## Prueba controlada de OpenAI API

El motor utiliza exclusivamente el endpoint HTTPS de OpenAI Chat Completions, con modelo gpt-4.1-mini o gpt-4.1, store=false y respuesta JSON.

Variables en Vercel (Production):
- ANALYSIS_API_URL = https://api.openai.com/v1/chat/completions
- ANALYSIS_API_KEY = clave secreta del proyecto OpenAI, nunca se guarda en GitHub
- ANALYSIS_MODEL = gpt-4.1-mini
- AI_PROCESSING_APPROVED = false inicialmente. Solo cambiar a true con autorización institucional expresa.

La prueba sintética está disponible tras iniciar sesión con Google, en el botón «Ejecutar prueba sintética de OpenAI». Utiliza un acta ficticia incluida en el código; no consulta Calendar ni escribe en Neon. La ruta POST /api/analysis/test no acepta texto arbitrario del usuario.

Resultado esperado: test=SINTÉTICA, sentRealData=false, persisted=false, checks.expectedIntegration=true y al menos una evidencia literal verificable. HTTP 401/403 indica clave o permiso insuficiente; HTTP 429, cuota o límite.

Seguridad: store=false no equivale a cero retención. Antes de enviar transcripciones reales se requiere autorización institucional sobre confidencialidad judicial, retención, proveedor, acceso, minimización o anonimización, y responsabilidades sobre datos. Las grabaciones sin transcripción no se consideran revisadas.

Cuando exista autorización, comenzar con una transcripción única, examinada previamente, preferiblemente anonimizada. Los hallazgos deben quedar propuestos hasta aprobación manual; repetir fecha no debe duplicar registros.

## Flujo principal desde el 10/11/2026: Excel oficial + ChatGPT + Neon

El motor OpenAI API es opcional y **NO** forma parte del flujo principal. Mantener AI_PROCESSING_APPROVED=false. No es necesario contratar OpenAI API para consultar Calendar y Neon desde esta web.

**Línea base oficial:** el archivo Lista_Integraciones_base.xlsx aportado en la conversación (35 filas, hoja Seguimiento, 13 columnas). Su huella SHA-256 está fijada en lib/baseline.ts para impedir sustituirlo accidentalmente por otro archivo. La primera importación se realiza en el portal con dos pasos: Comparar sin aplicar y Confirmar importación con respaldo. No se publica el contenido del Excel en GitHub. La tabla baseline_integration_rows conserva cada campo original; integrations conserva el estado y la bitácora textual de referencia.

**Cotejo:** en la pestaña Línea base y cotejo se comparan las sesiones detectadas con las fechas citadas en la bitácora. Las coincidencias por fecha son candidatas, no pruebas de cobertura. Los estados de sesión son Por cotejar, Cubierta en base, Omisión detectada y Fuera de alcance; cada decisión requiere un sustento escrito y puede asociarse a varias integraciones.

**Propuestas desde ChatGPT:** tras revisar una fecha mediante las conexiones ChatGPT a Calendar, Drive y Neon, el análisis puede insertar hallazgos NUEVOS en integraciones_laboral.chatgpt_review_proposals, con fuente, fecha, evidencia, responsable y huella única. La web muestra estas propuestas para aprobación o rechazo. Solo una aprobación explícita agrega texto a integrations.situational_log; la acción registra auditoría. La reimportación del Excel preserva sufijos aprobados de la versión anterior, y rechaza divergencias no conciliadas.

**Pendientes:** la pestaña Pendientes y responsables distingue últimos pendientes explícitos en la bitácora histórica de nuevas observaciones aprobadas. Que un pendiente figure en una bitácora no acredita que siga abierto; su cierre se comprueba por sesión.

**Pilotaje 04/11/2026:** se identificaron cinco eventos de Calendar y diez adjuntos (cinco notas de Gemini y cinco grabaciones) y se registraron metadatos en Neon. Esto NO equivale a leer/transcribir videos, verificar las cinco notas completas, ni completar el cotejo.

**Base de datos:** ejecutar db/migration_baseline.sql solo en una instalación nueva. La migración aditiva ya fue aplicada al proyecto Neon vinculado.

**Seguridad:** la web exige Google OAuth + ALLOWED_EMAIL, y ninguna clave o transcripción se añade al repositorio GitHub. La consulta desde ChatGPT y el almacenamiento Neon deben cumplir las políticas institucionales del Poder Judicial; no enviar contenidos sensibles a otros proveedores sin autorización.
