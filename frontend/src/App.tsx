import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WalletProvider from './contexts/WalletContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Funding from './pages/Funding';
import Strategy from './pages/Strategy';
import Dashboard from './pages/Dashboard';
import Exit from './pages/Exit';
import './App.css';

const App: React.FC = () => {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="funding" element={<Funding />} />
            <Route path="strategy" element={<Strategy />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="exit" element={<Exit />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  );
};

export default App;
