
import React from 'react';
import './styles/index.css';
import ReactDOM from 'react-dom/client';
import App from './App';

// Le rivelazioni allo scroll nascondono il contenuto finche' non entra in
// campo. Quello stato nascosto vive dietro `reveal-ready`, che accendiamo qui:
// se questo file non arriva o va in errore prima, nessuna regola nasconde
// niente e la pagina resta leggibile. Vedi `.reveal` in styles/index.css.
document.documentElement.classList.add('reveal-ready');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);