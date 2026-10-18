import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ViewerApp } from '../../viewer/ViewerApp.jsx';
import './index.css';

// Two pages from one bundle, picked by the address:
//   /view, /view/CODE  -> the VR viewer (no editor panels)
//   anything else      -> the editor
// Both the Vite dev server and server/index.js send index.html for every
// path, so /view/ABC123 reaches this code.
const isViewer = /^\/view(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(isViewer ? <ViewerApp /> : <App />);