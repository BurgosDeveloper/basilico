# GUIA DE INSTALACION Y CONFIGURACION LAN

## Basilico Pizzeria POS y KDS

Esta guia instala Basilico en una PC nueva y conecta tablets o telefonos Android a la misma red local. PostgreSQL guarda comandas y pagos; Socket.IO actualiza Caja, Mesero, Cocina y Android en tiempo real.

## 1. Requisitos en la PC servidor

1. Instala Node.js 18 o superior desde https://nodejs.org y marca `Add to PATH`.
2. Instala PostgreSQL y recuerda la clave del usuario `postgres`.
3. Usa la base `basilico` y la clave predeterminada configurada actualmente: `basilico1.`.
4. Instala Google Chrome o Microsoft Edge.
5. Conecta la PC y todas las tablets a la misma red Wi-Fi o Ethernet. No uses una red de invitados.
6. Solo si vas a compilar la APK, instala Android Studio con Android SDK y sus Platform Tools. El script detecta el SDK en el perfil del usuario actual de Windows o desde `ANDROID_HOME`.

Si PostgreSQL tiene otra clave, define estas variables en PowerShell antes de iniciar Basilico:

    $env:DB_USER = 'postgres'
    $env:DB_PASSWORD = 'TU_CLAVE_DE_POSTGRES'
    $env:DB_NAME = 'basilico'

El backend intenta crear `basilico` si el usuario de PostgreSQL tiene permiso `CREATEDB`. Si no puede hacerlo, abre pgAdmin, crea una base vacia llamada `basilico` y vuelve a iniciar Basilico. No ejecutes `server/schema.sql` manualmente: el backend aplica migraciones idempotentes al arrancar.

## 2. Copiar el sistema e instalar dependencias

1. Copia la carpeta completa `basilico` a una ruta permanente, por ejemplo `C:\basilico`. No la muevas despues de generar el acceso directo.
2. Abre PowerShell dentro de la carpeta y ejecuta:

    npm install
    Set-Location server
    npm install
    Set-Location ..

3. Permite una vez el puerto del servidor en el Firewall de Windows. Abre PowerShell como administrador y ejecuta:

    New-NetFirewallRule -DisplayName 'Basilico POS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private

4. Comprueba que Windows identifica la red como privada en `Configuracion > Red e Internet`. Si la red es publica, las tablets no podran entrar aunque el sistema este iniciado.

## 3. Generar produccion y el acceso directo

Desde la raiz `basilico`, ejecuta:

    npm run build:export

El comando detecta la IP privada activa, actualiza `src/config/lanConfig.json`, compila `build/` y genera:

- `export/BasilicoPOS.vbs`
- `export/BasilicoPOS_Con_Consola.bat`
- `export/Basilico Pizzeria.lnk`

Usa `export/Basilico Pizzeria.lnk` diariamente. El acceso directo inicia `scripts/launch-pos.js` mediante VBS sin mostrar una terminal, espera al backend y abre Chrome o Edge con la direccion LAN vigente.

`BasilicoPOS_Con_Consola.bat` hace lo mismo mostrando una consola. Usalo solo para diagnostico si el acceso directo no abre el sistema.

## 4. Iniciar sesion por primera vez

En una instalacion nueva puedes entrar con:

- Usuario: `basilico`
- Clave de propietario: `basilico1.`

La cuenta de propietario ve ambos turnos. Las cuentas por turno usan el mismo usuario `basilico` y una de estas claves: `mesero.manana`, `caja.manana`, `cocina.manana`, `admin.manana`, `mesero.noche`, `caja.noche`, `cocina.noche` o `admin.noche`.

## 5. Verificar la IP LAN y abrir cada pantalla

Con la PC conectada a la red operativa, ejecuta:

    node scripts/print-lan.js

El resultado muestra una direccion como `http://192.168.1.15:3001`. En otro dispositivo de la misma red abre:

- Mesero: `http://IP_DE_LA_PC:3001/mesonero`
- Caja: `http://IP_DE_LA_PC:3001/caja`
- Cocina: `http://IP_DE_LA_PC:3001/cocina`
- Administracion: `http://IP_DE_LA_PC:3001/menu-admin`

No copies esa IP dentro de `AppContext.tsx`: el acceso directo vuelve a detectarla al iniciar y el servidor actualiza su configuracion cuando cambia la interfaz LAN. Si el router cambia la IP, reinicia el acceso directo. Para evitar cambios, crea una reserva DHCP para la direccion MAC del adaptador de la PC servidor.

## 6. Generar e instalar la APK Android

La APK incluye la IP LAN detectada al compilar. Antes de compilar, conecta la PC servidor a la red que usaran las tablets.

1. En PowerShell, desde la raiz del proyecto, ejecuta:

       npm run build:apk

2. El script detecta la IP, actualiza `src/config/lanConfig.json`, prepara Android y compila la APK.
3. Al terminar, toma `export/BasilicoPizzeria.apk`.
4. Copiala a cada tablet e instalala. Android puede pedir permitir la instalacion desde la aplicacion de archivos usada.
5. Conecta la tablet a la misma red privada que la PC y abre Basilico.

Cuando cambie la IP de la PC o se use otra red, repite los pasos 1 a 4 y reinstala la APK nueva. Una APK ya instalada no puede conocer una IP diferente si no logra contactar al servidor.

## 7. Inicio manual para soporte

Usa estas dos consolas solo para diagnostico o desarrollo:

    Set-Location server
    npm run start

En otra consola:

    npm run start

La interfaz de desarrollo usa normalmente `http://localhost:3000/caja`. La version de produccion que sirve el backend usa el puerto `3001`.

## 8. Actualizar una PC ya instalada

1. Copia los archivos nuevos sin borrar `server/config/thermal-printer.json` ni PostgreSQL.
2. Ejecuta `npm install`, luego `Set-Location server; npm install; Set-Location ..`.
3. Ejecuta `npm run build:export`.
4. Cierra cualquier backend anterior y abre otra vez `Basilico Pizzeria.lnk`.
5. Si cambio la red o actualizaste Android, ejecuta `npm run build:apk` e instala la APK nueva.

### Copiar datos operativos a la PC nueva

Para conservar menu, comandas, pagos y caja, realiza una copia de PostgreSQL en la PC anterior:

    pg_dump -U postgres -Fc -d basilico -f C:\Respaldo\basilico.backup

Copia `basilico.backup` a la PC nueva. Con `basilico` vacia y el backend apagado, restaura:

    pg_restore -U postgres -d basilico C:\Respaldo\basilico.backup

No uses opciones de limpieza sobre una base que ya tiene datos operativos. Inicia Basilico despues de restaurar para que aplique migraciones pendientes.

## 9. Impresora termica de cocina y reportes

1. Configura la IP de la impresora en `server/config/thermal-printer.json` y conserva el puerto `9100` salvo que la autoprueba de la impresora indique otro.
2. Reinicia el backend despues de guardar esa configuracion.
3. Solo cuando la impresora este conectada, valida con:

       npm run print:test

No ejecutes esa prueba mientras la impresora este desconectada. Las comandas se guardan en PostgreSQL antes de intentar imprimir; un error de impresora no borra ni modifica la comanda.

## 10. Reiniciar datos de prueba

Atencion: este comando elimina comandas y movimientos de caja. Haz una copia de seguridad de PostgreSQL antes de usarlo.

    node scripts/clean-database.js

No uses esta limpieza para resolver un problema de conexion, acceso directo, impresora o APK.