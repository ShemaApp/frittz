# Cambio: consulta interna de avisos

## Alcance aplicado

La PWA incorpora la opción **🛡️ Privacidad** para todos los usuarios autenticados. El acceso en el menú lateral lleva a **Configuración → Privacidad**, donde se muestran enlaces al aviso de privacidad y al compromiso de uso confidencial del equipo móvil.

Los documentos se abren en una pestaña nueva del mismo sitio. Esto conserva la sesión y no descarta el pedido, transferencia, ruta u otra pantalla que el usuario estuviera trabajando.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `app.js` | Agrega la entrada de menú, el estado de apertura de Privacidad y el enlace con Configuración. |
| `config.js` | Agrega la subpestaña Privacidad y sus dos accesos públicos. |
| `sw.js` | Actualiza a `pdlc-v58-internal-privacy-links` para descargar `app.js` y `config.js` actualizados junto con los avisos ya precacheados. |

## Sin cambios de datos

Esta integración no crea colecciones, no envía datos a Firestore, no modifica rutas de venta ni altera permisos operativos. Los documentos siguen abiertos para consulta pública también desde la pantalla de login.
