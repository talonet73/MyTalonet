import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button',{name:'Effects',exact:true}).waitFor();
  await page.getByRole('button',{name:'Effects',exact:true}).click();
  await page.getByRole('dialog',{name:'Pannello Effects'}).waitFor();
  await page.getByLabel('Chiudi pannello',{exact:true}).click();
  await page.getByRole('tab',{name:'AUDIO',exact:true}).click();
  await page.getByRole('tab',{name:'COLOR',exact:true}).click();
  await page.getByRole('region',{name:'Color grading'}).waitFor();
  await page.getByRole('tab',{name:'VIDEO',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS: installed production browser UI, Effects, AUDIO, COLOR, VIDEO; no page errors.');
} finally {await browser.close();}
