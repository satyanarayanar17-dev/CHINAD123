import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser=await chromium.launch();const context=await browser.newContext();
const page=await context.newPage();page.setDefaultTimeout(10000);await page.setViewportSize({width:1440,height:1000});
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
try{
await page.goto('http://127.0.0.1:5173');
await page.getByRole('button',{name:'Hospital staff',exact:true}).waitFor();
async function scan(name){const s=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();console.log(name+' violations',JSON.stringify(s.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));}
await scan('Login');
await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
await page.locator('input[name=username]').fill('demo_admin');
await page.locator('input[name=password]').fill('ChettinadDemo2026!');
await page.getByRole('button',{name:'Sign in',exact:true}).click();
await page.waitForTimeout(1500);
console.log('Admin', (await page.locator('body').innerText()).slice(0,5000));
await page.screenshot({path:'/tmp/cc-opd-admin.png',fullPage:true});
await scan('Admin');
}finally{await browser.close();}
