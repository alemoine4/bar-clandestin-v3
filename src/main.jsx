import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import WhiskyBarApp from '../whisky-bar-caviste.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WhiskyBarApp />
  </React.StrictMode>
);
