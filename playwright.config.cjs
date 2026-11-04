const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/browser',timeout:45000,fullyParallel:false,workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:4173',headless:true,channel:process.env.CI?undefined:'chrome',viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
  webServer:{command:'node scripts/serve.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:15000}
});
