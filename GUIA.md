# Guia de comandos Basilico POS

## Prompt Audit

Copia este prompt completo al iniciar una auditoria con otro agente de IA:

```text
Actua como un programador senior full stack, auditor de sistemas POS y especialista en React, TypeScript, Node.js, Express y PostgreSQL. Trabajas sobre Basilico POS, un sistema de pizzeria con frontend web/React, app movil Expo/React Native, backend Express y base de datos PostgreSQL local. Tu prioridad es preservar la integridad de comandas, pagos, vueltos, caja, tasas y datos historicos.

Reglas obligatorias:
1. No asumas. Lee el codigo y sigue el flujo real de datos antes de editar.
2. No borres, reviertas ni formatees cambios locales existentes que no hayas creado. Primero ejecuta `git status --short` y trata el arbol de trabajo como potencialmente modificado por otro desarrollador.
3. Nunca uses comandos destructivos como `git reset --hard`, `git checkout --`, limpieza de base de datos o borrado masivo sin autorizacion explicita del usuario.
4. Mantiene los cambios pequenos, aislados y compatibles con el estilo existente. Si agregas logica reutilizable, ubicala en helpers, componentes o rutas especializadas; no sobrecargues componentes o archivos principales.
5. No marques una comanda como pagada, entregada, cancelada o reactivada sin validar las reglas del negocio y el estado persistido en PostgreSQL.
6. No ocultes errores de API con actualizaciones locales optimistas que cambien pagos, saldos o estados financieros. Propaga el error y conserva la fuente de verdad del servidor.
7. Cada edicion debe tener una validacion inmediata y enfocada. Al finalizar, ejecuta validacion de tipos, sintaxis backend y build web.
8. El sistema debe mantenerse siempre en tiempo real: PostgreSQL es la fuente de verdad, el backend confirma toda escritura y Socket.IO sincroniza web, APK y caja. No crees comandas, pagos, estados, tasas, catalogos, mesas o movimientos de caja solo en estado local cuando falle la red.
9. Al conectar o reconectar un cliente, verifica que reciba la instantanea Socket.IO y los eventos posteriores de comandas, productos, ingredientes, mesas, tasas y caja. Muestra un error visible si se pierde la conexion; no presentes un cambio como guardado hasta que el servidor responda correctamente.
10. Antes de hacer una modificacion que el usuario no haya explicado claramente, que amplie el alcance, cambie reglas de negocio, borre codigo, afecte datos, API, esquema, permisos o interfaz, detente y pregunta primero. No inventes requisitos ni tomes decisiones de producto sin autorizacion.
11. No elimines codigo antiguo hasta comprobar sus consumidores y confirmar que su retiro corresponde a una solicitud del usuario. Si una correccion requiere migracion, datos de prueba, limpieza o una accion irreversible, solicita autorizacion expresa.

Contexto del repositorio:
- Frontend web: `src/`, principalmente `src/pages/CajaPage.tsx`, `src/context/AppContext.tsx`, `src/components/` y `src/data/mockData.ts`.
- App movil: `src/App.native.tsx` y `src/native/`.
- Backend: `server/index.js`, `server/db.js`, `server/routes/`, `server/helpers/` y `server/schema.sql`.
- La base de datos usada en esta PC es PostgreSQL local, normalmente `sdmaia`. El backend aplica migraciones idempotentes al iniciar desde `server/db.js` mediante `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Las tasas vienen de `exchange_rates`; COP y Bs se convierten desde USD usando la tasa vigente o la tasa guardada por movimiento.
- El build web se sirve desde el backend por el puerto 3001. Desarrollo web normalmente usa el puerto 3000.

Orden obligatorio de auditoria:
1. Estado y configuracion: revisa `package.json`, `server/package.json`, `git status --short`, configuracion LAN y scripts disponibles. Identifica como levantar frontend, backend y build.
2. Modelos y persistencia: revisa `src/data/mockData.ts`, `server/schema.sql`, `server/db.js` y los mapeos de `server/helpers/fetchAll.js`. Confirma tablas, columnas, tipos, conversiones y migraciones antes de tocar rutas.
3. Backend: empieza en `server/index.js`, sigue las rutas registradas y luego revisa la ruta propietaria del comportamiento. Para cobros revisa `server/routes/payments.js`, `server/helpers/paymentLedger.js`, `server/routes/orders.js`, `server/routes/caja.js` y sus transacciones PostgreSQL.
4. Frontend: sigue desde el boton o pantalla afectada hasta `AppContext`. Para caja/cobros revisa `CajaPage.tsx`, `PaymentLedgerModal.tsx`, `OrderDetailModal.tsx` y las acciones HTTP de `AppContext.tsx`.
5. UI movil y otros consumidores: verifica que los contratos de tipos y API no rompan `App.native.tsx`, `src/native/` ni las pantallas de mesero, cocina, historico y reportes.
6. Base de datos instalada: si necesitas confirmar el esquema real, inicia el backend o usa una consulta de solo lectura. No modifiques datos productivos para probar. Reporta claramente cualquier aviso de migracion, puerto ocupado o discrepancia entre esquema y base instalada.

Reglas de negocio criticas de cobro:
- La modal de cobro debe mostrar tres tarjetas: monto total de la comanda, total pagado y vuelto pendiente. Cada una debe mostrar USD, COP y Bs con la tasa correspondiente.
- Un registro es de tipo `payment` o `change` (vuelto); no son el mismo movimiento. Un pago acredita como maximo la deuda de la venta, pero conserva el dinero realmente recibido. El vuelto debe quedar registrado por separado.
- Metodos validos: USD = Efectivo USD, Binance, Zelle. COP = Efectivo COP, Bancolombia, Nequi. Bs = Pago Movil, Tarjeta de Debito, Tarjeta de Credito. El cliente no puede elegir un metodo de otra moneda.
- No se puede cerrar una comanda si existe deuda pendiente o vuelto pendiente. Cerrar la modal debe conservar los registros ya guardados. El cierre final no debe crear un pago ficticio de monto cero.
- Los pagos divididos deben usar las mismas validaciones. No pueden marcar items como pagados si el pago no cubre los items seleccionados.
- Anular un registro debe actualizar pago acumulado, estado de pago, movimientos de caja asociados y marcas de items pagados individualmente.
- Reactivar una comanda entregada debe devolverla al flujo activo para editarla sin borrar su historial de pagos. Cambiar estados no debe destruir datos financieros.

Reglas de interfaz:
- Conserva el lenguaje visual existente. En fondos claros usa texto negro o verde oscuro; nunca texto blanco o gris claro sobre blanco.
- Usa controles claros, estados deshabilitados cuando aplique, mensajes de error visibles y tablas legibles para el historial de movimientos.
- Evita duplicar modales o flujos de cobro. Si existe codigo antiguo inutilizado, retiralo solo despues de comprobar que no tenga consumidores.
- Nunca uses texto, iconos, bordes o indicadores del mismo color, transparencia o luminosidad que su fondo. Revisa estados normal, hover, activo, deshabilitado, error, exito, lista, pagado y responsive en web y APK.
- Ningun texto, boton, modal, tooltip, tarjeta, tabla o indicador puede taparse, quedar debajo de otra modal ni superponerse de forma ilegible. Define capas `z-index` coherentes, dimensiones estables y prueba vistas movil y escritorio.
- Cuando una accion dependa de la conexion en tiempo real, comunica claramente si esta sincronizada, reconectando o fallida. No cierres formularios ni borres carritos ante un error de red; conserva los datos para reintentar.

Validacion minima antes de finalizar:
```powershell
npx tsc --noEmit --pretty false
node --check server/routes/payments.js
node --check server/routes/orders.js
npm run build
```

Para cambios de cobro, valida tambien manualmente este escenario sin modificar datos reales: pago parcial, pago exacto, pago con excedente, registro de vuelto, intento de cierre con vuelto pendiente, anulacion de pago/vuelto, pago dividido por items y reactivacion desde historico.

Para cambios de sincronizacion, valida sin modificar datos reales: conexion Socket.IO desde web y APK, recepcion de instantanea inicial, propagacion de eventos hacia otro cliente, desconexion visible, reconexion automatica y recuperacion del estado desde PostgreSQL.

Entrega final esperada:
- Explica el problema y su causa raiz.
- Lista los archivos modificados y el impacto de cada uno.
- Indica las migraciones aplicadas o pendientes y si se tocaron datos existentes.
- Muestra los comandos de validacion ejecutados y sus resultados.
- Menciona riesgos, advertencias preexistentes o validaciones manuales pendientes.
```

Ejecuta los comandos desde la carpeta raiz del proyecto `basilico` en PowerShell.

## Generar ejecutable y acceso directo de PC

Cada vez que cambies el sistema y quieras actualizar los archivos para la PC, ejecuta:

```powershell
npm run build:export
```

El comando compila la version web de produccion y genera o actualiza en `export/`:

- `BasilicoPOS.vbs`: inicio silencioso del POS.
- `BasilicoPOS_Con_Consola.bat`: inicio del POS con consola del servidor.
- `Basilico Pizzeria.lnk`: acceso directo de Windows.
- `pizza_icon.ico`: icono del acceso directo.

Tambien puedes hacer doble clic en `Actualizar_Accesos_Directos.bat`. Ese archivo ejecuta solo el generador de exportacion; para incluir cambios nuevos de la interfaz usa primero `npm run build` o, preferiblemente, `npm run build:export`.

## Abrir el sistema en desarrollo

En una consola:

```powershell
cd server
npm run start
```

En otra consola:

```powershell
npm run start
```

El POS de caja queda en `http://localhost:3000/caja` durante desarrollo. La version exportada abre `http://localhost:3001` porque el backend sirve la carpeta `build/`.

## Inicio confiable desde el acceso directo

El acceso directo `Basilico Pizzeria.lnk` abre el POS por la IP LAN actual del backend, por ejemplo `http://192.168.1.5:3001`. La interfaz y Socket.IO se conectan siempre por esa dirección LAN, incluso cuando se abre el POS desde la PC servidor.

Al abrir el acceso directo, Basilico inicia el backend si hace falta y consulta su dirección LAN vigente antes de abrir el navegador. No debes ejecutar `ipconfig`, copiar IP ni editar archivos: `npm run build:export` y el acceso directo detectan automáticamente la IP privada de la interfaz Wi-Fi/Ethernet activa.

Si el router cambia la IP mientras el sistema está apagado, el acceso directo vuelve a consultar la IP al iniciar. Para que tablets, celulares u otras PCs puedan conservar una dirección fija, crea una reserva DHCP para la PC servidor en el router usando la dirección MAC de su adaptador Wi-Fi.

## Generar APK Android

```powershell
npm run build:apk
```

El resultado se copia a `export/BasilicoPizzeria.apk` cuando la compilacion Android finaliza correctamente.

## Verificar antes de exportar

```powershell
npx tsc --noEmit --pretty false
npm run build
node --check server/routes/payments.js
```

## Impresora térmica LAN FREMORT FRM-8330 (80 mm)

La FRM-8330 usa papel térmico de 80 mm y se integra por LAN con comandos ESC/POS. Las comandas no se convierten a PDF: se imprimen como tickets ESC/POS de 80 mm, con corte automático, para que el texto llegue completo y legible. Esto es más fiable que enviar un PDF a una térmica de este tipo.

Al crear una comanda que requiere cocina, Basilico la guarda primero en PostgreSQL. Solo después intenta imprimirla. Un fallo de impresora nunca borra ni modifica la comanda; el POS muestra una alerta visible para reintentar tras corregir la conexión.

### Configuración manual inicial

1. Conecta la impresora y la PC servidor a la misma red Wi-Fi o LAN. No uses una red de invitados.
2. Enciende la impresora, coloca el rollo térmico de 80 mm y verifica que haga su autoprueba manteniendo presionado `FEED` mientras la enciendes. Anota la dirección IP que aparezca en el ticket de autoprueba.
3. En Windows, instala el controlador que suministró FREMORT para la FRM-8330. En `Configuración > Bluetooth y dispositivos > Impresoras y escáneres`, agrega la impresora por dirección TCP/IP si el controlador lo solicita.
4. En las propiedades de impresión de Windows, configura papel de `80 mm`, orientación vertical, escala `100 %` o `Tamaño real` y activa el corte automático si el controlador lo ofrece. Imprime una página de prueba de Windows.
5. Abre [server/config/thermal-printer.json](server/config/thermal-printer.json) y completa la IP obtenida en la autoprueba. Conserva el puerto `9100` salvo que el ticket de autoprueba o el manual indique otro:

```json
{
	"enabled": true,
	"host": "192.168.1.200",
	"port": 9100,
	"timeoutMs": 5000,
	"copies": 1
}
```

6. Guarda el archivo, reinicia el backend desde `server/` con `npm run start` y ejecuta desde la raíz del proyecto:

```powershell
npm run print:test
```

7. El comando imprime un ticket de prueba sin crear ni cambiar datos de la base. Confirma que el ancho, el corte y el texto se leen correctamente antes de activar el uso operativo.
8. Envía una comanda real de prueba. El ticket incluye número, fecha/hora, tipo de servicio, mesa/cliente, mesero, cada ítem, cantidad, tamaño, mitad y mitad, ingredientes retirados, extras, preferencias, para llevar, notas individuales, nota general, número de ítems y total.

### Reportes en la misma impresora

Todos los botones de reportes de Caja envían de inmediato una versión ESC/POS de 80 mm a la FRM-8330 configurada en [server/config/thermal-printer.json](server/config/thermal-printer.json). El reporte incluye cobros y egresos en USD, COP y Bs con sus métodos de pago. Al mismo tiempo se abre una vista optimizada para rollo de 80 mm; desde su diálogo puedes seleccionar `Microsoft Print to PDF` si necesitas una copia PDF.

Si la térmica está apagada, fuera de red o deshabilitada, el POS muestra el error y no genera una impresión falsa. Verifica primero la conexión con `npm run print:test`.

## Base de datos y migraciones

Las migraciones son automaticas: al iniciar el backend, `server/db.js` ejecuta los `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` necesarios. No ejecutes el esquema manualmente para una actualizacion normal.

En esta PC se inicio el backend el 11 de agosto de 2026 y se conecto a PostgreSQL en la base local `sdmaia`; las migraciones se ejecutaron. Esto incluye las columnas de bolivares del libro de pagos: `cash_tendered_bs` y `change_given_bs` en `order_payments`.

El puerto `3001` estaba ocupado por una instancia previa. Para que esa instancia use el codigo nuevo, detenla y vuelve a iniciar el backend desde `server/` con `npm run start`.

## Limpiar pedidos de prueba

Atencion: elimina comandas y movimientos. No lo uses para una limpieza operativa sin respaldo.

```powershell
node scripts/clean-database.js
```
