# 🔐 Credenciales del Sistema Basilico POS 2.0

Este documento contiene todas las credenciales oficiales de acceso, roles, turnos y seguridad del sistema **Basilico POS**.

---

## ☀️ TURNO MAÑANA (Restaurante / Almuerzos)
El turno mañana gestiona el menú de almuerzos (pastas, especialidades, entradas, sopas, contornos y bebidas matutinas).

| Rol | Usuario | Contraseña | Acceso Directo |
| :--- | :--- | :--- | :--- |
| **Mesero Mañana** | `mesero.manana` | `mesero123` | Toma de pedidos, comandas de salón y mesas |
| **Caja Mañana** | `caja.manana` | `caja123` | Facturación, cobros multimoneda y cierre de caja mañana |
| **Cocina Mañana** | `cocina.manana` | `cocina123` | Monitor KDS de preparación de almuerzos |
| **Admin Mañana** | `admin.manana` | `admin123` | Gestión total del turno mañana, menú y reportes |

---

## 🌙 TURNO NOCHE (Pizzería Basilico)
El turno noche gestiona el menú de pizzería (pizzas grandes, pequeñas, mitades, ingredientes adicionales y bebidas).

| Rol | Usuario | Contraseña | Acceso Directo |
| :--- | :--- | :--- | :--- |
| **Mesero Noche** | `mesero.noche` | `mesero123` | Salón de mesas, pizzas enteras/mitades, delivery |
| **Caja Noche** | `caja.noche` | `caja123` | Control de caja, pagos combinados USD/COP/Bs y arqueo |
| **Cocina Noche** | `cocina.noche` | `cocina123` | KDS de pizzas, horneado y despacho |
| **Admin Noche** | `admin.noche` | `admin123` | Control administrativo del turno pizzería |

---

## 👑 ADMINISTRACIÓN GENERAL & DUEÑO (Ambos Turnos)
Usuarios maestros con visibilidad completa para auditar, supervisar o gestionar ambos turnos sin restricciones:

| Cuenta | Usuario | Contraseña | Descripción |
| :--- | :--- | :--- | :--- |
| **Administrador General** | `admin` | `basilico1.` | Acceso global a reportes, auditoría y configuración |
| **Dueño Basilico** | `basilico` | `basilico1.` | Usuario propietario con privilegios maestros |

---

## 🔒 PIN DE SEGURIDAD ADMINISTRATIVO
El sistema solicita un código PIN para autorizaciones críticas (como anulación de comandas, edición de pedidos ya cobrados o reimpresiones protegidas):

- **PIN de Autorización Oficial:** `1234`

---

## 🗄️ BASE DE DATOS POSTGRESQL
Configuración de conexión local y de producción:

- **Host:** `localhost` (o IP local de la red LAN)
- **Puerto:** `5432`
- **Base de Datos:** `basilico`
- **Usuario:** `postgres`
- **Contraseña:** `basilico1.`
