# REGLAS DEL SISTEMA — BASILICO PIZZERIA POS & KDS

> **REGLA CRÍTICA**: Nunca inventar tablas, columnas, endpoints o campos que no existan en el sistema.
> Antes de referenciar cualquier tabla o columna de la BD, verifica que exista en este documento.
> Antes de llamar a cualquier endpoint, verifica que exista en este documento.

---

## 1. ARQUITECTURA GENERAL

- **Frontend Web**: React + TypeScript + TailwindCSS. Servido como build estático desde `build/`.
- **Frontend Móvil**: React Native (Expo) en `App.native.tsx`. Comparte `AppContext.tsx` y `mockData.ts` con la web.
- **Backend**: Node.js + Express + Socket.IO en `server/index.js`.
- **Base de datos primaria**: PostgreSQL local (database `sdmaia`, user `postgres`, password `sdmaia1.`, port `5432`).
- **Base de datos fallback**: `server/db.json` (solo se usa si PostgreSQL no está disponible).
- **Conexión**: `server/db.js` exporta `initDb()`, que intenta conectar a PG. Si falla, `usePg` queda `false` y se usa JSON.
- **Puerto del servidor**: `3001` (configurable via `PORT` env var).

### Archivos clave
| Archivo | Descripción |
|---------|-------------|
| `server/db.js` | Conexión BD, migraciones PG, fallback JSON |
| `server/index.js` | API REST, Socket.IO, lógica de negocio |
| `src/context/AppContext.tsx` | Estado global React, llamadas API, Socket.IO |
| `src/data/mockData.ts` | Interfaces TypeScript (NO tiene datos mock activos) |
| `src/pages/MeseroPage.tsx` | Vista mesero (crear/ver comandas) |
| `src/pages/CocinaPage.tsx` | Vista cocina/KDS |
| `src/pages/CajaPage.tsx` | Vista caja/POS |
| `src/pages/MenuManagementPage.tsx` | Admin: gestionar pizzas, bebidas, ingredientes, mesas |
| `src/App.native.tsx` | Aplicación móvil React Native |
| `scripts/clean-database.js` | Script de purga de BD |
| `scripts/build-export.js` | Script de empaquetado para producción |

---

## 2. ESQUEMA DE BASE DE DATOS POSTGRESQL

### ⚠️ TABLAS QUE **SÍ** EXISTEN (las únicas válidas)

#### `users`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| username | VARCHAR(64) | NOT NULL UNIQUE |
| password | VARCHAR(64) | NOT NULL |
| role | VARCHAR(32) | NOT NULL DEFAULT 'admin' |
| name | VARCHAR(128) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `ingredients`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| name | VARCHAR(128) | NOT NULL UNIQUE |
| price_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| is_base_for_pizza | BOOLEAN | DEFAULT TRUE |
| is_extra_for_pizza | BOOLEAN | DEFAULT TRUE |
| category | VARCHAR(64) | DEFAULT 'Ingredientes' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `products`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| name | VARCHAR(128) | NOT NULL |
| category | VARCHAR(64) | NOT NULL |
| drink_type | VARCHAR(32) | |
| price | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| description | TEXT | |
| image | TEXT | |
| badge | VARCHAR(64) | |
| base_ingredients | TEXT[] | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `tables_config`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| number | INT | NOT NULL UNIQUE |
| name | VARCHAR(64) | NOT NULL |
| capacity | INT | NOT NULL DEFAULT 2 |
| status | VARCHAR(32) | NOT NULL DEFAULT 'libre' |
| zone | VARCHAR(64) | NOT NULL DEFAULT 'Salón Principal' |

#### `orders`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| order_number | VARCHAR(32) | NOT NULL |
| type | VARCHAR(32) | NOT NULL DEFAULT 'mesa' |
| table_number | INT | |
| customer_name | VARCHAR(128) | |
| status | VARCHAR(32) | NOT NULL DEFAULT 'en_preparacion' |
| payment_status | VARCHAR(32) | NOT NULL DEFAULT 'no_pagado' |
| payment_method | VARCHAR(32) | |
| total_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| waiter_name | VARCHAR(64) | DEFAULT 'Mesero' |
| kitchen_notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| is_edited | BOOLEAN | DEFAULT FALSE |
| cop_rate_at_payment | NUMERIC(10,2) | DEFAULT 3950.00 |
| bs_rate_at_payment | NUMERIC(10,2) | DEFAULT 36.50 |
| paid_amount_usd | NUMERIC(10,2) | DEFAULT 0.00 |
| merged_from_orders | TEXT[] | |
| payment_history_json | JSONB | |

#### `order_items`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| order_id | VARCHAR(64) | REFERENCES orders(id) ON DELETE CASCADE |
| product_id | VARCHAR(64) | NOT NULL |
| product_name | VARCHAR(128) | NOT NULL |
| price | NUMERIC(10,2) | NOT NULL |
| quantity | INT | NOT NULL DEFAULT 1 |
| removed_ingredients | TEXT[] | |
| extras_json | JSONB | |
| sugar_preference | VARCHAR(32) | |
| is_takeaway | BOOLEAN | DEFAULT FALSE |
| notes | TEXT | |
| size | VARCHAR(32) | DEFAULT 'Grande' |
| is_half_half | BOOLEAN | DEFAULT FALSE |
| half_details | JSONB | |
| is_new_or_modified | BOOLEAN | DEFAULT FALSE |
| is_paid_individually | BOOLEAN | DEFAULT FALSE |
| paid_by_name | VARCHAR(128) | |

#### `order_payments`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| order_id | VARCHAR(64) | REFERENCES orders(id) ON DELETE CASCADE |
| payer_name | VARCHAR(128) | DEFAULT 'Cliente General' |
| payment_method | VARCHAR(32) | NOT NULL |
| amount_paid_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| cash_tendered_usd | NUMERIC(10,2) | DEFAULT 0.00 |
| cash_tendered_cop | NUMERIC(12,2) | DEFAULT 0.00 |
| change_given_usd | NUMERIC(10,2) | DEFAULT 0.00 |
| change_given_cop | NUMERIC(12,2) | DEFAULT 0.00 |
| item_ids | TEXT[] | |
| cop_rate | NUMERIC(10,2) | DEFAULT 3950.00 |
| bs_rate | NUMERIC(10,2) | DEFAULT 36.50 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `caja_chica_apertura`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| usd_cash | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| cop_cash | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| timestamp | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `caja_chica_transactions`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| type | VARCHAR(32) | NOT NULL |
| amount_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| amount_cop | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| payment_method | VARCHAR(32) | NOT NULL |
| description | TEXT | NOT NULL |
| order_id | VARCHAR(64) | |
| timestamp | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `caja_chica_cierres`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | VARCHAR(64) | PRIMARY KEY |
| opened_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| opened_cop | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| total_sales_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| expected_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| actual_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| actual_cop | NUMERIC(12,2) | NOT NULL DEFAULT 0.00 |
| difference_usd | NUMERIC(10,2) | NOT NULL DEFAULT 0.00 |
| closed_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| closed_by | VARCHAR(64) | DEFAULT 'Caja' |
| notes | TEXT | |

#### `exchange_rates`
| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | INT | PRIMARY KEY DEFAULT 1 |
| cop_rate | NUMERIC(10,2) | NOT NULL DEFAULT 3950.00 |
| bs_rate | NUMERIC(10,2) | NOT NULL DEFAULT 36.50 |

### Índices PostgreSQL
- `idx_orders_status` ON orders(status)
- `idx_orders_payment_status` ON orders(payment_status)
- `idx_orders_created_at` ON orders(created_at DESC)
- `idx_order_items_order_id` ON order_items(order_id)
- `idx_order_payments_order_id` ON order_payments(order_id)
- `idx_caja_tx_timestamp` ON caja_chica_transactions(timestamp DESC)

### 🚫 TABLAS QUE **NO** EXISTEN — NUNCA REFERENCIAR
- ❌ `kitchen_logs`
- ❌ `caja_transactions` (la correcta es `caja_chica_transactions`)
- ❌ `tables` (la correcta es `tables_config`)
- ❌ `cash_register`
- ❌ Cualquier columna `active_order_id` en `tables_config`

---

## 3. MAPEO PG snake_case → JS camelCase

El backend en `fetchAllOrders()` mapea las columnas de PG a propiedades JS:

### Orders
| PG (snake_case) | JS (camelCase) |
|-----------------|----------------|
| order_number | orderNumber |
| table_number | tableNumber |
| customer_name | customerName |
| payment_status | paymentStatus |
| payment_method | paymentMethod |
| total_usd | totalUSD |
| waiter_name | waiterName |
| kitchen_notes | kitchenNotes |
| created_at | createdAt |
| updated_at | updatedAt |
| is_edited | isEdited |
| cop_rate_at_payment | copRateAtPayment |
| bs_rate_at_payment | bsRateAtPayment |
| paid_amount_usd | paidAmountUSD |
| merged_from_orders | mergedFromOrders |
| payment_history_json | paymentHistory |

### Order Items
| PG (snake_case) | JS (camelCase) |
|-----------------|----------------|
| product_id | productId |
| product_name | productName |
| order_id | orderId |
| removed_ingredients | removedIngredients |
| extras_json | extras |
| sugar_preference | sugarPreference |
| is_takeaway | isTakeaway |
| is_half_half | isHalfHalf |
| half_details | halfDetails |
| is_new_or_modified | isNewOrModified |
| is_paid_individually | isPaidIndividually |
| paid_by_name | paidByName |

### Ingredients
| PG (snake_case) | JS (camelCase) |
|-----------------|----------------|
| price_usd | priceUSD |
| is_base_for_pizza | isBaseForPizza |
| is_extra_for_pizza | isExtraForPizza |

### Products
| PG (snake_case) | JS (camelCase) |
|-----------------|----------------|
| drink_type | drinkType |
| base_ingredients | baseIngredients |

### Tables
| PG (snake_case) | JS (camelCase) |
|-----------------|----------------|
| current_order_id | currentOrderId |

---

## 4. ESTRUCTURA JSON de db.json (fallback)

```json
{
  "users": [],
  "ingredients": [],
  "products": [],
  "tables": [],
  "orders": [],
  "order_items": [],
  "order_payments": [],
  "order_sequence": 0,
  "caja_apertura": null,
  "caja_transactions": [],
  "caja_chica_transactions": [],
  "caja_chica_cierres": [],
  "exchange_rates": { "cop_rate": 3950, "bs_rate": 36.50 }
}
```

---

## 5. API REST — ENDPOINTS REALES

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login con username/password |

### Productos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/products | Listar todos |
| POST | /api/products | Crear o actualizar (si body.id existe, actualiza) |
| PUT | /api/products/:id | Actualizar producto |
| DELETE | /api/products/:id | Eliminar producto |

### Ingredientes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/ingredients | Listar todos |
| POST | /api/ingredients | Crear ingrediente |
| PUT | /api/ingredients/:id | Actualizar ingrediente |
| DELETE | /api/ingredients/:id | Eliminar ingrediente |

### Mesas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/tables | Listar todas |
| POST | /api/tables | Crear mesa |
| PUT | /api/tables/:id | Actualizar mesa |
| DELETE | /api/tables/:id | Eliminar mesa |

### Comandas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/orders | Listar todas las comandas con items y payments |
| POST | /api/orders | Crear nueva comanda |
| PUT | /api/orders/:id | Actualizar comanda (status, items, etc.) |
| DELETE | /api/orders/:id | Cancelar/eliminar comanda individual |
| DELETE | /api/orders/purge-all | Purgar TODAS las comandas y transacciones |
| POST | /api/orders/:id/merge | Fusionar comandas |
| POST | /api/orders/:id/pay | Procesar pago |

### Caja
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/caja/open | Abrir caja chica |
| POST | /api/caja/close | Cerrar caja chica |
| GET | /api/caja/status | Estado de la caja |
| POST | /api/caja/ai-chat | Asistente IA de caja |

### Tasas de Cambio
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/exchange-rates | Obtener tasas actuales |
| PUT | /api/exchange-rates | Actualizar tasas COP/Bs |

### Otros
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/upload | Subir imagen base64 |
| GET | /api/users | Listar usuarios |

---

## 6. EVENTOS SOCKET.IO

### Eventos emitidos por el servidor
| Evento | Cuándo | Payload |
|--------|--------|---------|
| orders:sync | Al cambiar cualquier comanda | Array completo de orders |
| tables:sync | Al cambiar mesas | Array completo de tables |
| products:sync | Al cambiar productos | Array completo de products |
| ingredients:sync | Al cambiar ingredientes | Array completo de ingredients |
| rates:updated | Al cambiar tasas de cambio | { COP, Bs } |
| order:new | Al crear nueva comanda | Objeto order individual |
| caja:updated | Al cambiar estado de caja | (sin payload, frontend re-fetch) |

### Eventos escuchados por el frontend (AppContext)
- `order:created`, `order:status_updated`, `order:prepared_sound`, `order:cancelled_sound`
- `order:cancelled`, `order:edited`, `order:paid`
- `orders:sync`, `products:sync`, `ingredients:sync`, `tables:sync`
- `caja:updated`, `rates:updated`

---

## 7. VALORES VÁLIDOS DE ENUMERACIONES

### Order Status
`'en_preparacion'` | `'preparada'` | `'entregada'` | `'cancelado'` | `'fusionada'`

### Payment Status
`'no_pagado'` | `'pagado'` | `'parcial'`

### Order Type
`'mesa'` | `'delivery'` | `'pickup'`

### Payment Method
`'Divisas'` | `'COP'` | `'Bs'` | `'Binance'` | `'Mixto'`

### Table Status
`'libre'` | `'ocupada'` | `'reservada'`

### Product Category
`'Pizzas'` | `'Bebidas'`

### Drink Type
`'refresco'` | `'jugo'` | `'licor'` | null

### Pizza Size
`'Grande'` | `'Pequeña'`

---

## 8. REGLAS DE DESARROLLO OBLIGATORIAS

### Base de datos
1. **NUNCA** crear tablas o columnas que no estén documentadas arriba.
2. **NUNCA** usar `TRUNCATE` con múltiples tablas en una sola sentencia — usar `DELETE FROM` individual por tabla con `try/catch`.
3. **SIEMPRE** respetar el orden de eliminación por foreign keys: `order_payments` → `order_items` → `orders`.
4. La tabla de mesas se llama `tables_config`, **NO** `tables`.
5. La tabla de transacciones se llama `caja_chica_transactions`, **NO** `caja_transactions`.
6. No existe tabla `kitchen_logs` ni `cash_register`.

### Frontend
7. **Todas las vistas** (Mesero, Cocina, Caja) deben excluir comandas con status `'cancelado'` y `'fusionada'` de las listas activas.
8. La UI móvil debe tener la **misma funcionalidad** que PC: selección de tamaño, mitad y mitad, extras por mitad, ingredientes removidos.
9. El detalle de pizza mitad y mitad debe mostrar **cada mitad por separado** con sus extras (✚ EXTRA:) e ingredientes removidos (✕ SIN:).
10. Iconografía: usar `react-icons/io5` (Ionicons 5) y emojis estándar para claridad visual.

### Backend
11. `POST /api/products` con `body.id` existente debe **actualizar** el producto, no crear uno nuevo.
12. Todo dato de comandas proviene de la BD (PG o JSON). **CERO** localStorage, **CERO** datos mock, **CERO** datos simulados para comandas.
13. `localStorage` solo se usa para `basilico_server_ip` y `basilico_user_session`.

### Build y Producción
14. Después de cualquier cambio en el frontend, ejecutar `npm run build` para actualizar `build/`.
15. Después del build, ejecutar `node scripts/build-export.js` para actualizar los archivos en `export/`.
16. El ejecutable de escritorio sirve la carpeta `build/` — si no se recompila, los cambios no se ven.

### Calidad de Código
17. **NUNCA** dejar imports sin usar ni variables sin usar.
18. **NUNCA** crear código duplicado ni espaguetti.
19. **NUNCA** suponer la existencia de tablas/columnas — siempre verificar en este documento.
20. Mantener todos los comentarios y documentación existentes que no estén relacionados con los cambios.

---

## 9. ESTILO VISUAL

- **Fondo Base**: `#070707` (Negro Profundo)
- **Tarjetas/Paneles**: `#0B2A1A` (Verde Esmeralda Oscuro) con `backdrop-blur-xl` y `rounded-3xl`
- **Acentos/Badges**: `#D8E6DF` (Menta Neón) y verdes esmeralda brillantes
- **Textos**: Blanco puro `#FFFFFF`
- **Iconos**: `react-icons/io5` (Ionicons 5) exclusivamente
- **Tamaños PC**: Títulos `text-2xl`+, items `text-lg`+, botones `text-lg font-bold`
- **Responsive**: Grids con `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`

---

## 10. SCRIPTS DISPONIBLES

| Script | Comando | Descripción |
|--------|---------|-------------|
| Limpiar BD | `node scripts/clean-database.js` | Purga PostgreSQL + db.json |
| Build web | `npm run build` | Compilar frontend de producción |
| Export | `node scripts/build-export.js` | Generar ejecutables en export/ |
| Servidor | `node server/index.js` | Iniciar backend en puerto 3001 |
| LAN info | `node scripts/print-lan.js` | Mostrar IPs de red local |
