import {defineConfig,devices} from '@playwright/test';
const python=process.env.BROWSER_TEST_PYTHON||'python3';
export default defineConfig({
  testDir:'./browser',testMatch:'**/*.spec.js',fullyParallel:false,workers:1,
  timeout:30000,expect:{timeout:5000},forbidOnly:!!process.env.CI,retries:process.env.CI?1:0,
  reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
  use:{baseURL:'http://127.0.0.1:5197',trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'phone',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844}}}],
  webServer:{command:`"${python}" browser/fixture_server.py --port 5197`,url:'http://127.0.0.1:5197/follow.html',reuseExistingServer:false,timeout:20000},
});
