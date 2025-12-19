import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import AppPage from './pages/AppPage';
import DriveLogbook from './pages/TripRecords'; // Import TripRecords as DriveLogbook (Alias for compatibility)
import LoveTracker from './pages/LoveTracker';
import University from './pages/University';
import CarFinance from './pages/CarFinance';
import AdminPage from './pages/AdminPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/drive-logbook" element={<DriveLogbook />} />
        <Route path="/love-tracker" element={<LoveTracker />} />
        <Route path="/university" element={<University />} />
        <Route path="/car-finance" element={<CarFinance />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App;
