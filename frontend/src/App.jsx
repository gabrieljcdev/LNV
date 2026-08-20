import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerProvider } from './context/PlayerContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import HDD from './pages/HDD';
import FDD from './pages/FDD';
import CratePage from './pages/CratePage';
import CollectionLogs from './pages/CollectionLogs';
import Artists from './pages/Artists';
import Labels from './pages/Labels';
import Genres from './pages/Genres';
import Profile from './pages/Profile';
import About from './pages/About';
import Donate from './pages/Donate';
import Contact from './pages/Contact';
import Logs from './pages/Logs';
import Login from './pages/Login';
import PageNotFound from './utils/PageNotFound';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5 } }
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlayerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index                    element={<Home />} />
              <Route path="hdd"               element={<HDD />} />
              <Route path="fdd"               element={<FDD />} />
              <Route path="crates/:id"        element={<CratePage />} />
              <Route path="collection-logs"   element={<CollectionLogs />} />
              <Route path="artists"           element={<Artists />} />
              <Route path="artists/:name"     element={<Artists />} />
              <Route path="labels"            element={<Labels />} />
              <Route path="labels/:name"      element={<Labels />} />
              <Route path="genres"            element={<Genres />} />
              <Route path="genres/:name"      element={<Genres />} />
              <Route path="profile/:username" element={<Profile />} />
              <Route path="about"             element={<About />} />
              <Route path="donate"            element={<Donate />} />
              <Route path="contact"           element={<Contact />} />
              <Route path="logs"              element={<Logs />} />
              <Route path="*"                 element={<PageNotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PlayerProvider>
    </QueryClientProvider>
  );
}