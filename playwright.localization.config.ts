import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'localization.spec.ts',fullyParallel:false,workers:1,timeout:180000,
 outputDir:'qa-evidence/localization-test-results',
 reporter:[['list'],['json',{outputFile:'qa-evidence/localization-results.json'}]],
 use:{baseURL:'http://127.0.0.1:5176',viewport:{width:1440,height:900},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:[
  {command:'node tests/start-localization.cjs',url:'http://127.0.0.1:3004/api/v1/auth/opd/config',timeout:120000,reuseExistingServer:false},
  {command:'VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:3004 npx vite --host 127.0.0.1 --port 5176 --strictPort',url:'http://127.0.0.1:5176',timeout:60000,reuseExistingServer:false}
 ]
});
