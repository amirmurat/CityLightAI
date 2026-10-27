import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.VITE_BASE_PATH||'/',plugins:[react()],css:{postcss:{plugins:[]}},worker:{format:'es'},server:{host:'127.0.0.1',proxy:process.env.VITE_BROWSER_MODE==='false'?{'/api':process.env.CITYLIGHT_API_URL||'http://127.0.0.1:8000'}:undefined}});
