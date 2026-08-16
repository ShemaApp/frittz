# Cambios de permisos para el rol `repartidor`

## Objetivo aplicado

El rol `repartidor` queda configurado para operar clientes, pedidos y transferencias sin administrar usuarios ni realizar ajustes manuales del inventario. Puede crear una transferencia desde cero seleccionando productos existentes; en esa operación concreta se descuenta el stock de forma transaccional y la transferencia queda asignada a su propio UID.

| Capacidad | Admin | Usuario | Repartidor |
|---|---:|---:|---:|
| Ver y crear clientes | Sí | Sí | Sí |
| Crear pedidos | Sí | Sí | Sí |
| Asignar pedidos a terceros | Sí | No | No |
| Guardar un pedido para su propia transferencia | Sí | No | Sí |
| Crear una transferencia desde cero | Sí | No | Sí, solo propia |
| Seleccionar productos para la transferencia | Sí | Según módulo | Sí |
| Descontar stock al crear su transferencia | Sí | Según permisos | Sí, únicamente dentro de esa transacción |
| Dar de alta productos | Sí | Según permisos | No |
| Ajustar stock manualmente | Sí | Según permisos | No |
| Registrar y entregar pedidos de su transferencia | Sí | No | Sí |
| Enviar su transferencia a recepción | Sí | No | Sí |
| Conciliar devoluciones y reingresar mercancía | Sí | Según permisos | No |
| Ver Reportes | Sí | Según permisos | No |
| Exportar CSV | Sí | Según permisos | No |
| Crear usuarios o cambiar roles | Sí | No | No |

## Flujo operativo del repartidor

El repartidor dispone de las pestañas **Pedidos**, **Clientes**, **Créditos**, **Transferencias**, **Distribución** y **Gerencia**. Las pestañas **Productos**, **Inventario** y **Reportes** se mantienen ocultas y además se bloquean en la navegación interna.

Cuando crea un cliente desde el formulario general, el documento guarda `creadoPorUid`. Cuando crea un pedido, la aplicación lo registra con `repartidorId` igual a su propio UID y estado `asignado_pendiente_transferencia`. No puede elegir a otro repartidor.

En **Transferencias**, el formulario se muestra con el propio repartidor seleccionado. Puede buscar y agregar productos existentes, pero no puede dar de alta productos escaneados. Al confirmar, la aplicación ejecuta una transacción que comprueba disponibilidad, descuenta el stock y crea la transferencia activa con el mismo responsable. Los pedidos asignados a él pueden incluirse en esa transferencia.

Al entregar un pedido, se conserva el flujo offline existente: se crea la nota, se actualiza la transferencia y el pedido pasa a `entregado`. Al finalizar la ruta, el repartidor envía la transferencia a `pendiente_recepcion`; la conciliación de devoluciones y el reingreso de mercancía quedan reservados para almacén.

## Archivos modificados

| Archivo | Cambio principal |
|---|---|
| `sesion.js` | Permisos base y restricciones estructurales del repartidor; los overrides antiguos no pueden reactivar Productos, Inventario, Reportes ni CSV. |
| `app.js` | La navegación rechaza destinos que no estén permitidos por el rol. |
| `permisos.js` | La pantalla administrativa muestra bloqueados los permisos fijos del repartidor. |
| `clientes.js` | Los clientes nuevos guardan el UID de quien los creó. |
| `pedidos.js` | El repartidor puede guardar pedidos asignados a sí mismo. |
| `ruta.js` | El repartidor puede crear una transferencia propia; el descuento de stock se liga a esa transferencia y no se habilita el alta de productos. |
| `rutas-repartidores.js` | Los botones de exportación CSV de comprobantes quedan ocultos para el repartidor y la barrera global de CSV permanece activa. |
| `reportes.js` | El componente no renderiza para el rol repartidor. |
| `firestore.rules` | Reglas para `pedidos`, rutas propias, creación de clientes, entregas, bloqueo de ajustes manuales y excepción transaccional de descuento de stock. |

## Publicación

Reemplaza los archivos correspondientes en tu proyecto y publica primero las reglas. Desde la carpeta del proyecto ejecuta:

```bash
firebase deploy --only firestore:rules
```

Después publica los archivos de la aplicación con tu proceso habitual. No publiques los archivos temporales `firebase.json` y `firestore.indexes.json` que se usaron únicamente para validar localmente, salvo que ya formen parte de tu configuración real.

## Pruebas recomendadas

Crea una cuenta con rol `repartidor` y verifica, en este orden, que pueda crear un cliente, crear un pedido para sí mismo, crear una transferencia con un producto existente, confirmar que el stock disminuye una sola vez, entregar el pedido, cerrar la transferencia y verla como pendiente de recepción.

Después verifica que la misma cuenta no pueda abrir Productos, Inventario ni Reportes; no pueda descargar CSV; no pueda dar de alta un producto desde el escáner; no pueda modificar manualmente `productos.stock`; no pueda crear o modificar `usuarios`; y no pueda asignar un pedido a otro repartidor.

## Nota de seguridad

La aplicación y las reglas mantienen el descuento de stock y la creación de la transferencia dentro de una transacción. Las reglas comprueban que cada actualización de producto del repartidor tenga los marcadores de la transferencia propia y una cantidad coherente. Para una garantía aún más fuerte frente a clientes manipulados, la creación de transferencias puede trasladarse posteriormente a una función backend/Cloud Function; las reglas de Firestore no pueden iterar arbitrariamente todos los elementos de un mapa para demostrar que no falta una actualización de producto.
