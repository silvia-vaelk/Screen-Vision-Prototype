import { createRoot } from 'react-dom/client';
import './tokens.css';
import App from './App.jsx';

// Default to dark mode
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')).render(<App />);
