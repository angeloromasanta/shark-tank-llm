import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App showLeaderboard={true} />} />
        <Route path="/setup" element={<App />} />
        <Route path="/game/:gameId" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);