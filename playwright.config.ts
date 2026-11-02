import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',
 testMatch:'opd.spec.ts',
 fullyParallel:false,
 workers:1,
 timeout:60000,
 use:{baseURL:'http://127.0.0.1:5174',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:[
  {command:'node tests/start-opd.cjs',url:'http://127.0.0.1:3002/api/v1/auth/opd/config',timeout:120000,reuseExistingServer:false},
  {command:'VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:3002 npx vite --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',timeout:60000,reuseExistingServer:false}
 ]
});
