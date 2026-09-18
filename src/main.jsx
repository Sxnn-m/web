import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

// BrowserRouter y no HashRouter: las URLs son de verdad (/producto/p01), lo que
// exige que el hosting sirva index.html para cualquier ruta. Eso lo resuelve el
// rewrite de vercel.json; sin él, refrescar en una URL profunda da 404.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
