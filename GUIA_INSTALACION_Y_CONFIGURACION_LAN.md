# 🍕 GUÍA DE INSTALACIÓN Y CONFIGURACIÓN LAN PASO A PASO
### Basilico Pizzeria POS & KDS (Servidor PC y Tablets Android)

Esta guía explica en detalle cómo instalar el sistema Basilico POS en cualquier computadora con Windows desde cero y cómo conectar las tablets/teléfonos Android a la red local (LAN) sin complicaciones.

---

## 📌 PARTE 1: INSTALACIÓN EN UNA NUEVA COMPUTADORA (SERVIDOR PRINCIPAL)

### Requisitos Previos en la nueva PC:
1. **Node.js (Versión 18 o superior)**:
   - Descarga e instala Node.js desde [https://nodejs.org](https://nodejs.org).
   - Marca la casilla *"Add to PATH"* durante la instalación.
2. **PostgreSQL (Base de Datos)**:
   - Descarga e instala PostgreSQL desde [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/).
   - Durante la instalación, asigna la contraseña: `sdmaia1.`
   - Abre **pgAdmin 4** o la consola de PostgreSQL y crea una base de datos llamada: `sdmaia`

> 💡 *Nota*: Si no deseas instalar PostgreSQL, el sistema arrancará automáticamente usando su base de datos local de respaldo (`server/db.json`) sin fallar.

---

### Paso 1: Copiar la carpeta del proyecto
Copiar toda la carpeta del proyecto `basilico` a la nueva computadora (por ejemplo, en el Escritorio o en `C:\basilico`).

### Paso 2: Instalar Dependencias
Abre **PowerShell** o el **Símbolo del sistema (CMD)** como Administrador dentro de la carpeta `basilico` y ejecuta:

```powershell
npm install
cd server
npm install
cd ..
```

---

## 📌 PARTE 2: CÓMO OBTENER LA DIRECCIÓN IP LAN DE TU PC SERVIDOR

Para que las tablets/teléfonos Android se conecten al servidor de la PC, necesitan saber la IP de la computadora en la red Wi-Fi local.

### Paso 1: Buscar la IP local
1. En la PC Servidor, presiona las teclas `Windows + R`, escribe `cmd` y presiona **Enter**.
2. En la ventana negra, escribe el siguiente comando y presiona **Enter**:
   ```cmd
   ipconfig
   ```
3. Busca la sección llamada **Adaptador de LAN inalámbrica Wi-Fi** (o *Adaptador de Ethernet* si la PC está conectada por cable).
4. Ubica la línea que dice **Dirección IPv4**. Ejemplo:
   ```text
   Dirección IPv4. . . . . . . . . . . . . . : 192.168.1.15
   ```
   > 📌 *Apunta esa dirección IP* (ejemplo: `192.168.1.15`). Esa es la IP de tu servidor LAN.

---

## 📌 PARTE 3: CONFIGURACIÓN Y RECOMPILACIÓN DE LA APK ANDROID

Si la dirección IP de tu PC cambió o colocaste el sistema en una PC nueva, debes actualizar la IP en la APK para que las tablets se puedan conectar.

### Paso 1: Cambiar la IP en el proyecto
Abre el archivo `src/context/AppContext.tsx` en tu editor de código o Bloc de notas y busca la constante `DEFAULT_SERVER_IP`:

```typescript
const DEFAULT_SERVER_IP = '192.168.1.15'; // <-- Reemplaza aquí con la nueva IP de tu PC
```

### Paso 2: Regenerar la APK de Android
En la PC Servidor, abre PowerShell dentro de la carpeta `basilico` y ejecuta el comando de compilación:

```powershell
npm run build:apk
```

El script compilará automáticamente la APK y colocará el nuevo ejecutable actualizado en:
`export/BasilicoPizzeria.apk`

### Paso 3: Instalar la APK en las Tablets Android
1. Copia el archivo `export/BasilicoPizzeria.apk` a una memoria USB, correo o envíalo por WhatsApp/Telegram a la tablet.
2. En la tablet Android, abre el archivo para instalarlo.
3. Asegúrate de que **la tablet esté conectada a la misma red Wi-Fi** que la PC Servidor.

---

## 📌 PARTE 4: CÓMO ARRANCAR EL SISTEMA EN LA PC

Para abrir el sistema en la computadora principal:

1. Entra en la carpeta `export/`.
2. Haz doble clic en el acceso directo:
   - **`Basilico Pizzeria.lnk`** o **`BasilicoPOS_Con_Consola.bat`**
3. El sistema encenderá el servidor backend en segundo plano y abrirá automáticamente la aplicación en Google Chrome o Microsoft Edge en la dirección `http://localhost:3001`.

---

## 📌 PARTE 5: RESETEAR Y LIMPIAR LA BASE DE DATOS (EMPEZAR DE CERO)

Si deseas eliminar todas las comandas de prueba y reiniciar los contadores desde la **Comanda #1**:

Abre PowerShell en la carpeta `basilico` y ejecuta:

```powershell
node scripts/clean-database.js
```

Este comando purgará PostgreSQL y `db.json`, reseteando el sistema al estado inicial sin tocar tu menú de pizzas ni ingredientes.
