import { createRoot } from 'react-dom/client';
import { AssistantPage } from './assistant-page.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
	throw new Error('Missing React root element');
}

createRoot(root).render(<AssistantPage />);
