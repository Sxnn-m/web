import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// BrowserRouter y no HashRouter: las URLs son de verdad (/producto/p01), lo que
// exige que el hosting sirva index.html para cualquier ruta. Eso lo resuelve el
// rewrite de vercel.json; sin él, refrescar en una URL profunda da 404.
createRoot(document.getElementById('root')).render(
  // El ErrorBoundary va por FUERA del router: un error al resolver la ruta
  // también tiene que caer en él, no dejar la pantalla en blanco.
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
