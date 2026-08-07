import React, { useEffect } from 'react';
import { useAthenaStore } from './store/useAthenaStore';
import { Header } from './components/Header';
import { UTCTimeBar } from './components/UTCTimeBar';
import { DashboardPage } from './pages/DashboardPage';
import { ScannerPage } from './pages/ScannerPage';
import { SignalsPage } from './pages/SignalsPage';
import { PaperTradingPage } from './pages/PaperTradingPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HealthPage } from './pages/HealthPage';
import { SniperPage } from './pages/SniperPage';

export const App: React.FC = () => {
  const { activePage, connect } = useAthenaStore();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="min-h-screen bg-athena-bg text-athena-text flex flex-col font-sans">
      <Header />
      <UTCTimeBar />

      <main className="flex-1">
        {activePage === 'dashboard' && <DashboardPage />}
        {activePage === 'scanner' && <ScannerPage />}
        {activePage === 'signals' && <SignalsPage />}
        {activePage === 'paper-trading' && <PaperTradingPage />}
        {activePage === 'analytics' && <AnalyticsPage />}
        {activePage === 'settings' && <SettingsPage />}
        {activePage === 'health' && <HealthPage />}
        {activePage === 'sniper' && <SniperPage />}
      </main>
    </div>
  );
};

export default App;
