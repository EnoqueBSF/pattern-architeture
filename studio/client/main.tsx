import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('elemento #root nao encontrado');

createRoot(root).render(<App />);
