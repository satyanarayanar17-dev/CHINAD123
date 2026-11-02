import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',
 testMatch:'clinical-consultation.spec.ts',
 fullyParallel:false,
 workers:1,
 timeout:60000,
 reporter: [['list'], ['json', { outputFile: 'qa-evidence/03-clinical/clinical-browser-results.json' }]],
 use:{baseURL:'http://127.0.0.1:5177',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:[
  {command:'node tests/start-clinical.cjs',url:'http://127.0.0.1:3005/api/v1/auth/opd/config',timeout:120000,reuseExistingServer:true},
  {command:'VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:3005 npx vite --host 127.0.0.1 --port 5177 --strictPort',url:'http://127.0.0.1:5177',timeout:60000,reuseExistingServer:true}
 ]
});
