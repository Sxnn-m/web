# Tk-prints

Tk prints website — tienda de impresión 3D (React + Vite + Firebase).

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run build    # build de producción
```

## Reglas de Firestore — deploy manual ⚠️

`firestore.rules` es **solo un archivo fuente**. Mergear a `main` no lo aplica:
no hay CI que lo despliegue. Mientras no corras el deploy, Firestore sigue
usando las reglas que tenga cargadas el proyecto, y el backoffice falla con
`Missing or insufficient permissions` al crear o editar productos, pedidos o
filamentos.

**Cada vez que toques `firestore.rules`, corré:**

```bash
npx firebase-tools login    # solo la primera vez
npm run deploy:rules
```

El proyecto de destino sale de `.firebaserc` (`tkprints-74d09`). Para apuntar a
otro: `npm run deploy:rules -- --project <id>`.

**Alternativa sin CLI:** consola de Firebase → Firestore Database → pestaña
Rules → pegar el contenido de `firestore.rules` → Publish.

### Qué protegen las reglas

| Colección | Público | Admin |
|---|---|---|
| `products`, `categories` | lectura | lectura y escritura |
| `products/{id}/privado` (receta, insumos, origen, notas) | — | lectura y escritura |
| `filamentos` + `gastos` / `restocks` | — | lectura y escritura |
| `pedidos` | — | lectura y escritura |
| `settings` | — | lectura y escritura |
| `users` | cada uno lee el suyo | lectura y escritura |

Admin = documento `/users/{uid}` con `role: "admin"`. Nadie puede
auto-asignarse ese rol: solo otro admin puede cambiarlo.

> `firebase.json` declara únicamente `firestore.rules`, a propósito. No declara
> `firestore.indexes.json` para que un `firebase deploy --only firestore` no
> pueda borrar índices creados a mano desde la consola.
