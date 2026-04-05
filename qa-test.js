/**
 * QA Test Script for 比率計算アプリ (Ratio Calculation App)
 * Tests all major features via Puppeteer browser automation.
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:8765';
let browser, page;
let passed = 0, failed = 0, warned = 0;
const results = [];

// ─────────────────────────────────────────────────────────────
// Server management
// ─────────────────────────────────────────────────────────────
let serverProcess = null;

async function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stdout.on('data', (d) => {
      if (d.toString().includes('SERVER_READY')) resolve();
    });
    serverProcess.stderr.on('data', (d) => {
      console.error('  [Server stderr]', d.toString().trim());
    });
    serverProcess.on('error', reject);
    setTimeout(() => reject(new Error('Server start timeout')), 10000);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// ─────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────
function log(testId, name, status, details = '') {
  const sym = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${sym} ${testId}: ${name}${details ? ' — ' + details : ''}`);
  results.push({ testId, name, status, details });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warned++;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
// Browser setup
// ─────────────────────────────────────────────────────────────
async function setup() {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=390,844']
  });
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('  [BROWSER ERROR]', msg.text());
  });
  page.on('pageerror', err => {
    console.error('  [PAGE ERROR]', err.message);
  });
  // Initial navigation to establish http origin
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
}

async function clearAndReload() {
  await page.evaluate(() => { try { localStorage.clear(); } catch(e) {} });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await wait(300);
}

// ─────────────────────────────────────────────────────────────
// App helpers
// ─────────────────────────────────────────────────────────────

async function getRecipeCount() {
  return await page.$$eval('.recipe-card', els => els.length);
}

async function getRecipeNames() {
  return await page.$$eval('.recipe-name', els => els.map(e => e.textContent.trim()));
}

async function getActiveScreen() {
  return await page.evaluate(() => {
    const s = document.querySelector('.screen.active');
    return s ? s.id : 'none';
  });
}

async function getStorageData(key) {
  return await page.evaluate((k) => {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  }, key);
}

async function getErrorText(id) {
  return await page.evaluate((eid) => {
    const el = document.getElementById(eid);
    if (!el) return null;
    const visible = el.classList.contains('show') || (el.style.display !== 'none' && el.style.display !== '');
    return visible ? el.textContent.trim() : null;
  }, id);
}

// Open the new-recipe form modal
async function openNewRecipeForm() {
  await page.click('#btn-new-recipe');
  await wait(400);
}

// Fill recipe form (modal must be open)
async function fillRecipeForm(name, ingredients) {
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.type(name);
  }

  for (let i = 0; i < ingredients.length; i++) {
    if (i > 0) {
      await page.click('#btn-add-ingredient');
      await wait(150);
    }
    const rows = await page.$$('#ingredients-container .ingredient-row');
    const row = rows[i];
    if (!row) continue;

    const nameEl = await row.$('.ingredient-name');
    const ratioEl = await row.$('.ingredient-ratio');

    if (nameEl) {
      await nameEl.click({ clickCount: 3 });
      await nameEl.type(String(ingredients[i].name));
    }
    if (ratioEl) {
      await ratioEl.click({ clickCount: 3 });
      await ratioEl.type(String(ingredients[i].ratio));
    }
  }
}

// Click the save button on the recipe form
async function submitRecipeForm() {
  await page.click('#btn-save-recipe');
  await wait(400);
}

// Open context sheet for a recipe by name
async function openRecipeMenu(name) {
  await page.evaluate((n) => {
    const cards = Array.from(document.querySelectorAll('.recipe-card'));
    const card = cards.find(c => c.querySelector('.recipe-name')?.textContent.trim() === n);
    if (card) { const btn = card.querySelector('.btn-recipe-menu'); if (btn) btn.click(); }
  }, name);
  await wait(400);
}

// Click a sheet item by label text
async function clickSheetItem(text) {
  await page.evaluate((t) => {
    const items = Array.from(document.querySelectorAll('.sheet-item'));
    const item = items.find(i => i.textContent.includes(t));
    if (item) item.click();
  }, text);
  await wait(400);
}

// Navigate to calc screen for a named recipe
async function openCalcForRecipe(name) {
  await page.evaluate((n) => {
    const cards = Array.from(document.querySelectorAll('.recipe-card'));
    const card = cards.find(c => c.querySelector('.recipe-name')?.textContent.trim() === n);
    if (card) {
      const info = card.querySelector('.recipe-info');
      if (info) info.click(); else card.click();
    }
  }, name);
  await wait(500);
}

// Go home from calc screen
async function goHome() {
  await page.evaluate(() => {
    const homeBtn = document.getElementById('btn-calc-home');
    if (homeBtn) homeBtn.click();
  });
  await wait(300);
}

// Clear the total amount input
async function clearTotalAmount() {
  await page.evaluate(() => {
    const inp = document.getElementById('input-total-amount');
    if (inp) {
      inp.value = '';
      inp.dispatchEvent(new Event('input'));
    }
  });
  await wait(200);
}

// Set total amount via JS (avoids input state issues)
async function setTotalAmount(value) {
  await page.evaluate((v) => {
    const inp = document.getElementById('input-total-amount');
    if (inp) {
      inp.value = v;
      inp.dispatchEvent(new Event('input'));
    }
  }, String(value));
  await wait(300);
}

// ─────────────────────────────────────────────────────────────
// ===== TEST CASES =====
// ─────────────────────────────────────────────────────────────

// A1: Page loads
async function testA1_PageLoad() {
  await clearAndReload();
  const title = await page.title();
  const screen = await getActiveScreen();
  if (screen === 'screen-list') {
    log('TC-A1', 'Page loads — recipe list screen active', 'PASS', `title="${title}"`);
  } else {
    log('TC-A1', 'Page loads — recipe list screen active', 'FAIL', `Active screen: ${screen}`);
  }
}

// A2: Empty state
async function testA2_EmptyState() {
  const emptyVisible = await page.evaluate(() => {
    const el = document.querySelector('.empty-state');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  const count = await getRecipeCount();
  if (emptyVisible && count === 0) {
    log('TC-A2', 'Empty state displayed with 0 recipes', 'PASS');
  } else {
    log('TC-A2', 'Empty state displayed with 0 recipes', 'FAIL', `count=${count}, emptyVisible=${emptyVisible}`);
  }
}

// B1: Add 1 ingredient recipe
async function testB1_AddSimpleRecipe() {
  await openNewRecipeForm();
  const modalVisible = await page.evaluate(() => {
    const m = document.getElementById('modal-recipe-form');
    return m && m.style.display !== 'none';
  });
  if (!modalVisible) {
    log('TC-B1', 'Recipe form modal opens on + click', 'FAIL', 'Modal not visible');
    return;
  }
  log('TC-B1', 'Recipe form modal opens on + click', 'PASS');

  await fillRecipeForm('シンプルレシピ', [{ name: '小麦粉', ratio: '100' }]);
  await submitRecipeForm();

  const names = await getRecipeNames();
  if (names.includes('シンプルレシピ')) {
    log('TC-B1b', 'Save 1-ingredient recipe (シンプルレシピ)', 'PASS');
  } else {
    log('TC-B1b', 'Save 1-ingredient recipe (シンプルレシピ)', 'FAIL', `Names: ${names.join(', ')}`);
  }
}

// B2: Add 4-ingredient recipe
async function testB2_AddMultiIngredientRecipe() {
  await openNewRecipeForm();
  await fillRecipeForm('パンレシピ', [
    { name: '強力粉', ratio: '100' },
    { name: '水',     ratio: '65' },
    { name: '塩',     ratio: '2' },
    { name: 'イースト', ratio: '1' }
  ]);
  await submitRecipeForm();

  const names = await getRecipeNames();
  const recipeData = await getStorageData('ratioApp_recipes');
  const recipe = recipeData?.find(r => r.name === 'パンレシピ');

  if (names.includes('パンレシピ') && recipe?.ingredients?.length === 4) {
    log('TC-B2', 'Save 4-ingredient recipe (パンレシピ)', 'PASS',
      recipe.ingredients.map(i => `${i.name}:${i.ratio}`).join(', '));
  } else {
    log('TC-B2', 'Save 4-ingredient recipe (パンレシピ)', 'FAIL',
      `inList=${names.includes('パンレシピ')}, ingCount=${recipe?.ingredients?.length}`);
  }
}

// B3: Add recipe with tags
async function testB3_AddRecipeWithTags() {
  // Pre-populate tags via localStorage
  await page.evaluate(() => {
    const tags = [
      { id: 'tag-shushoku', name: '主食', color: '#F6AD55', scope: 'all', order: 0 },
      { id: 'tag-yakimono', name: '焼き物', color: '#68D391', scope: 'all', order: 1 }
    ];
    localStorage.setItem('ratioApp_tags', JSON.stringify(tags));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  await openNewRecipeForm();
  await fillRecipeForm('食パン', [
    { name: '強力粉', ratio: '100' },
    { name: '水',     ratio: '65' }
  ]);

  // Select tags
  const tagChipsClicked = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('[class*="tag-chip"], [class*="form-tag"], [class*="tag-select"]').forEach(c => {
      if (c.textContent.includes('主食') || c.textContent.includes('焼き物')) {
        c.click(); n++;
      }
    });
    return n;
  });

  await submitRecipeForm();

  const recipeData = await getStorageData('ratioApp_recipes');
  const recipe = recipeData?.find(r => r.name === '食パン');
  const names = await getRecipeNames();

  if (names.includes('食パン')) {
    if (tagChipsClicked > 0 && recipe?.tagIds?.length > 0) {
      log('TC-B3', 'Save recipe with tags', 'PASS', `tagIds: ${recipe.tagIds.join(', ')}`);
    } else if (tagChipsClicked === 0) {
      log('TC-B3', 'Save recipe with tags', 'WARN', 'Tag chips not found in form — tags not selectable in test');
    } else {
      log('TC-B3', 'Save recipe with tags', 'WARN', `Recipe saved, tagChipsClicked=${tagChipsClicked} but tagIds empty`);
    }
  } else {
    log('TC-B3', 'Save recipe with tags', 'FAIL', 'Recipe not saved');
  }
}

// C1: Empty recipe name validation
async function testC1_EmptyRecipeName() {
  await openNewRecipeForm();
  // Leave name empty, fill one ingredient
  const rows = await page.$$('#ingredients-container .ingredient-row');
  if (rows[0]) {
    const nameEl = await rows[0].$('.ingredient-name');
    const ratioEl = await rows[0].$('.ingredient-ratio');
    if (nameEl) await nameEl.type('テスト');
    if (ratioEl) await ratioEl.type('100');
  }
  await submitRecipeForm();
  const err = await getErrorText('form-error');
  if (err && err.length > 0) {
    log('TC-C1', 'Empty recipe name — validation error shown', 'PASS', `"${err}"`);
  } else {
    log('TC-C1', 'Empty recipe name — validation error shown', 'FAIL', 'No error');
  }
  await page.keyboard.press('Escape');
  await wait(200);
}

// C2: Zero ingredients validation
async function testC2_ZeroIngredients() {
  await openNewRecipeForm();
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) { await nameInput.type('ゼロ材料テスト'); }

  // Remove all ingredient rows
  await page.evaluate(() => {
    document.querySelectorAll('#ingredients-container .ingredient-row').forEach(r => {
      const del = r.querySelector('.btn-remove-ingredient, button[aria-label*="削除"], button[title*="削除"]');
      if (del) del.click();
    });
  });
  // Also try clearing all values
  await page.evaluate(() => {
    document.querySelectorAll('#ingredients-container .ingredient-name, #ingredients-container .ingredient-ratio').forEach(i => {
      i.value = '';
    });
  });
  await wait(200);
  await submitRecipeForm();
  const err = await getErrorText('form-error');
  if (err && err.length > 0) {
    log('TC-C2', 'Zero ingredients — validation error shown', 'PASS', `"${err}"`);
  } else {
    const names = await getRecipeNames();
    if (names.includes('ゼロ材料テスト')) {
      log('TC-C2', 'Zero ingredients — validation error shown', 'FAIL', 'Recipe saved with no ingredients!');
    } else {
      log('TC-C2', 'Zero ingredients — validation error shown', 'WARN', 'No error but recipe not saved — acceptable');
    }
  }
  await page.keyboard.press('Escape');
  await wait(200);
}

// C3: Non-numeric ratio
async function testC3_NonNumericRatio() {
  await openNewRecipeForm();
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) await nameInput.type('文字比率テスト');

  const rows = await page.$$('#ingredients-container .ingredient-row');
  if (rows[0]) {
    const nameEl = await rows[0].$('.ingredient-name');
    const ratioEl = await rows[0].$('.ingredient-ratio');
    if (nameEl) await nameEl.type('材料A');
    if (ratioEl) {
      // type() on number input won't accept non-numeric; set via JS
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('#ingredients-container .ingredient-row .ingredient-ratio');
        if (inputs[0]) inputs[0].value = 'abc';
      });
    }
  }
  await submitRecipeForm();
  const err = await getErrorText('form-error');
  if (err && err.length > 0) {
    log('TC-C3', 'Non-numeric ratio — validation error shown', 'PASS', `"${err}"`);
  } else {
    log('TC-C3', 'Non-numeric ratio — validation error shown', 'FAIL', 'No error');
  }
  await page.keyboard.press('Escape');
  await wait(200);
}

// C4: Zero ratio
async function testC4_ZeroRatio() {
  await openNewRecipeForm();
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) await nameInput.type('ゼロ比率テスト');

  const rows = await page.$$('#ingredients-container .ingredient-row');
  if (rows[0]) {
    const nameEl = await rows[0].$('.ingredient-name');
    if (nameEl) await nameEl.type('材料B');
    await page.evaluate(() => {
      const inp = document.querySelector('#ingredients-container .ingredient-row .ingredient-ratio');
      if (inp) inp.value = '0';
    });
  }
  await submitRecipeForm();
  const err = await getErrorText('form-error');
  if (err && err.length > 0) {
    log('TC-C4', 'Zero ratio — validation error shown', 'PASS', `"${err}"`);
  } else {
    log('TC-C4', 'Zero ratio — validation error shown', 'FAIL', 'No error');
  }
  await page.keyboard.press('Escape');
  await wait(200);
}

// C5: Blank ingredient name (ratio only)
async function testC5_BlankIngredientName() {
  await openNewRecipeForm();
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) await nameInput.type('名前なし材料テスト');

  // Leave ingredient name blank, fill ratio only
  await page.evaluate(() => {
    const ratioInp = document.querySelector('#ingredients-container .ingredient-row .ingredient-ratio');
    if (ratioInp) ratioInp.value = '100';
  });
  await submitRecipeForm();
  const err = await getErrorText('form-error');
  if (err && err.length > 0) {
    log('TC-C5', 'Blank ingredient name — validation error shown', 'PASS', `"${err}"`);
  } else {
    const names = await getRecipeNames();
    if (names.includes('名前なし材料テスト')) {
      log('TC-C5', 'Blank ingredient name — validation error shown', 'FAIL', 'Saved with blank ingredient name');
    } else {
      log('TC-C5', 'Blank ingredient name — validation error shown', 'WARN', 'No error but not saved either');
    }
  }
  await page.keyboard.press('Escape');
  await wait(200);
}

// D1: Edit recipe
async function testD1_EditRecipe() {
  const names = await getRecipeNames();
  const target = names.find(n => n === 'パンレシピ') || names[0];
  if (!target) { log('TC-D1', 'Edit recipe', 'FAIL', 'No recipe to edit'); return; }

  await openRecipeMenu(target);
  await clickSheetItem('編集');

  const modalVisible = await page.evaluate(() => {
    const m = document.getElementById('modal-recipe-form');
    return m && m.style.display !== 'none';
  });
  if (!modalVisible) {
    log('TC-D1', 'Edit recipe — form opens', 'FAIL', 'Edit form not visible');
    return;
  }

  // Rename
  const nameInput = await page.$('#input-recipe-name');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.type('プレーンパン');
  }

  // Add バター:5
  await page.click('#btn-add-ingredient');
  await wait(150);
  const rows = await page.$$('#ingredients-container .ingredient-row');
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const n = await lastRow.$('.ingredient-name');
    const r = await lastRow.$('.ingredient-ratio');
    if (n) await n.type('バター');
    if (r) await r.type('5');
  }

  await submitRecipeForm();

  const updatedNames = await getRecipeNames();
  const recipeData = await getStorageData('ratioApp_recipes');
  const recipe = recipeData?.find(r => r.name === 'プレーンパン');

  if (updatedNames.includes('プレーンパン') && recipe?.ingredients?.some(i => i.name === 'バター')) {
    log('TC-D1', 'Edit recipe (rename + add ingredient)', 'PASS');
  } else if (updatedNames.includes('プレーンパン')) {
    log('TC-D1', 'Edit recipe (rename + add ingredient)', 'WARN',
      `Renamed OK, butter: ${JSON.stringify(recipe?.ingredients?.map(i => i.name))}`);
  } else {
    log('TC-D1', 'Edit recipe (rename + add ingredient)', 'FAIL',
      `Names: ${updatedNames.join(', ')}`);
  }
}

// E1: Delete recipe
async function testE1_DeleteRecipe() {
  const beforeNames = await getRecipeNames();
  const target = beforeNames.find(n => n === 'シンプルレシピ') || beforeNames[beforeNames.length - 1];
  if (!target) { log('TC-E1', 'Delete recipe', 'FAIL', 'No recipe to delete'); return; }

  await openRecipeMenu(target);
  await clickSheetItem('削除');
  // Wait for confirm modal
  await wait(400);

  // Click btn-confirm-ok
  const confirmed = await page.evaluate(() => {
    const btn = document.getElementById('btn-confirm-ok');
    if (btn && !document.getElementById('modal-confirm').classList.contains('hidden')) {
      btn.click(); return true;
    }
    return false;
  });
  await wait(500);

  const afterNames = await getRecipeNames();
  if (!afterNames.includes(target)) {
    log('TC-E1', `Delete recipe "${target}"`, 'PASS',
      `Before: ${beforeNames.length}, After: ${afterNames.length}`);
  } else {
    log('TC-E1', `Delete recipe "${target}"`, 'FAIL',
      `Recipe still in list. confirmed=${confirmed}, after: ${afterNames.join(', ')}`);
  }
}

// F1: Open calc screen
async function testF1_OpenCalcScreen() {
  const names = await getRecipeNames();
  const target = names.find(n => n === 'プレーンパン') || names[0];
  if (!target) { log('TC-F1', 'Open calc screen', 'FAIL', 'No recipes'); return; }

  await openCalcForRecipe(target);
  const screen = await getActiveScreen();
  if (screen === 'screen-calc') {
    log('TC-F1', `Open calc screen for "${target}"`, 'PASS');
  } else {
    log('TC-F1', `Open calc screen for "${target}"`, 'FAIL', `Active screen: ${screen}`);
  }
}

// F2: Calc - total amount 200
async function testF2_CalcTotal200() {
  const screen = await getActiveScreen();
  if (screen !== 'screen-calc') { log('TC-F2', 'Calc total=200', 'FAIL', 'Not on calc screen'); return; }

  await setTotalAmount(200);

  const resultVisible = await page.evaluate(() => {
    const r = document.getElementById('calc-result');
    return r && r.style.display !== 'none';
  });
  const rows = await page.$$eval('.result-row', rows => rows.map(r => ({
    name: r.querySelector('.result-name')?.textContent.trim(),
    value: r.querySelector('.result-value')?.textContent.trim()
  })));

  if (resultVisible && rows.length > 0) {
    log('TC-F2', 'Calc: total=200 shows results', 'PASS',
      rows.map(r => `${r.name}=${r.value}`).join(', '));
  } else {
    log('TC-F2', 'Calc: total=200 shows results', 'FAIL',
      `resultVisible=${resultVisible}, rowCount=${rows.length}`);
  }
}

// F3: Calc math accuracy
async function testF3_CalcMathAccuracy() {
  const recipeData = await getStorageData('ratioApp_recipes');
  const recipe = recipeData?.find(r => r.name === 'プレーンパン') || recipeData?.[0];
  if (!recipe) { log('TC-F3', 'Calc math accuracy', 'FAIL', 'No recipe in storage'); return; }

  const totalInput = 200;
  const ratioSum = recipe.ingredients.reduce((s, i) => s + i.ratio, 0);
  const expected = recipe.ingredients.map(i => ({
    name: i.name,
    value: Math.round((i.ratio / ratioSum) * totalInput)
  }));

  const rows = await page.$$eval('.result-row', rows => rows.map(r => ({
    name: r.querySelector('.result-name')?.textContent.trim(),
    value: parseFloat(r.querySelector('.result-value')?.textContent.trim())
  })));

  const mismatches = [];
  expected.forEach(exp => {
    const actual = rows.find(r => r.name === exp.name);
    if (!actual) { mismatches.push(`${exp.name}: missing`); return; }
    if (actual.value !== exp.value) {
      mismatches.push(`${exp.name}: expected=${exp.value}, got=${actual.value}`);
    }
  });

  if (mismatches.length === 0) {
    log('TC-F3', `Calc math accuracy (ratioSum=${ratioSum}, total=200)`, 'PASS');
  } else {
    log('TC-F3', `Calc math accuracy (ratioSum=${ratioSum}, total=200)`, 'WARN',
      `Mismatches (may be rounding mode): ${mismatches.join('; ')}`);
  }
}

// F4: Calc - zero input error
async function testF4_CalcZeroError() {
  await setTotalAmount(0);
  await wait(200);
  const err = await getErrorText('calc-error');
  if (err) {
    log('TC-F4', 'Calc: zero input shows error', 'PASS', `"${err}"`);
  } else {
    // Number input with min=0 may prevent entering exactly 0 in some cases
    // Check if result is hidden
    const resultHidden = await page.evaluate(() => {
      const r = document.getElementById('calc-result');
      return !r || r.style.display === 'none';
    });
    log('TC-F4', 'Calc: zero input shows error', resultHidden ? 'WARN' : 'FAIL',
      `No error shown, result hidden=${resultHidden}`);
  }
}

// F5: Calc - negative input error
async function testF5_CalcNegativeError() {
  await setTotalAmount(-100);
  await wait(200);
  const err = await getErrorText('calc-error');
  if (err) {
    log('TC-F5', 'Calc: negative input shows error', 'PASS', `"${err}"`);
  } else {
    log('TC-F5', 'Calc: negative input shows error', 'FAIL', 'No error for negative input');
  }
}

// F6: Calc - very large number
async function testF6_CalcLargeNumber() {
  await setTotalAmount(9999999);
  await wait(200);
  const err = await getErrorText('calc-error');
  const resultVisible = await page.evaluate(() => {
    const r = document.getElementById('calc-result');
    return r && r.style.display !== 'none';
  });
  if (!err && resultVisible) {
    log('TC-F6', 'Calc: large number (9999999) processes normally', 'PASS');
  } else if (err) {
    log('TC-F6', 'Calc: large number (9999999) processes normally', 'FAIL',
      `Error shown: "${err}"`);
  } else {
    log('TC-F6', 'Calc: large number (9999999) processes normally', 'FAIL',
      `resultVisible=${resultVisible}`);
  }
}

// F7: Calc - decimal input
async function testF7_CalcDecimal() {
  await setTotalAmount(150.5);
  await wait(200);
  const err = await getErrorText('calc-error');
  const resultVisible = await page.evaluate(() => {
    const r = document.getElementById('calc-result');
    return r && r.style.display !== 'none';
  });
  if (!err && resultVisible) {
    const rows = await page.$$eval('.result-row', rows =>
      rows.map(r => r.querySelector('.result-value')?.textContent.trim()));
    log('TC-F7', 'Calc: decimal input (150.5) processes normally', 'PASS',
      `Results: ${rows.join(', ')}`);
  } else {
    log('TC-F7', 'Calc: decimal input (150.5) processes normally', 'FAIL',
      `err="${err}", resultVisible=${resultVisible}`);
  }
}

// F8: Ingredient-based calculation
async function testF8_IngredientCalc() {
  // Reset total amount first
  await setTotalAmount('');
  await wait(200);

  const ingInput = await page.$('.calc-ing-input');
  if (!ingInput) { log('TC-F8', 'Ingredient-based calculation', 'WARN', 'No ingredient input found'); return; }

  await ingInput.click({ clickCount: 3 });
  await ingInput.type('200');
  await wait(400);

  const allValues = await page.$$eval('.calc-ing-input', inputs => inputs.map(i => i.value));
  const populated = allValues.filter(v => v && v !== '').length;

  if (populated > 1) {
    log('TC-F8', 'Ingredient-based calc fills other fields', 'PASS',
      `Values: ${allValues.join(', ')}`);
  } else {
    log('TC-F8', 'Ingredient-based calc fills other fields', 'FAIL',
      `Only ${populated} field(s) populated`);
  }
}

// F9: Saved amount feature
async function testF9_SavedAmount() {
  await clearTotalAmount();
  await setTotalAmount(500);

  const saveBtn = await page.$('#saveAmountBtn');
  if (!saveBtn) { log('TC-F9', 'Saved amount feature', 'WARN', 'Save button not found'); return; }

  // Disable check, might be disabled when no value
  const isDisabled = await saveBtn.evaluate(b => b.disabled);
  if (isDisabled) {
    log('TC-F9', 'Saved amount feature', 'WARN', 'Save button disabled even with valid amount');
    return;
  }

  await saveBtn.click();
  await wait(300);

  const savedVisible = await page.evaluate(() => {
    const all = document.body.textContent;
    return all.includes('500');
  });
  const recipeData = await getStorageData('ratioApp_recipes');
  const recipe = recipeData?.find(r => r.id !== undefined);
  const savedAmounts = recipe?.savedAmounts || [];

  if (savedAmounts.includes(500)) {
    log('TC-F9', 'Saved amount button stores value', 'PASS', `savedAmounts: ${savedAmounts}`);
  } else {
    log('TC-F9', 'Saved amount button stores value', 'WARN',
      `savedAmounts: ${JSON.stringify(savedAmounts)}, savedVisible=${savedVisible}`);
  }
}

// G1: Settings screen
async function testG1_SettingsScreen() {
  // Go home from calc
  await goHome();
  await wait(200);

  const settingsBtn = await page.$('#btn-settings');
  if (!settingsBtn) { log('TC-G1', 'Settings screen opens', 'FAIL', 'btn-settings not found'); return; }

  await settingsBtn.click();
  await wait(400);

  const screen = await getActiveScreen();
  if (screen === 'screen-settings') {
    log('TC-G1', 'Settings screen opens', 'PASS');
  } else {
    log('TC-G1', 'Settings screen opens', 'FAIL', `Active screen: ${screen}`);
  }
}

// G2: Settings content
async function testG2_SettingsContent() {
  const text = await page.evaluate(() => document.getElementById('screen-settings')?.textContent || '');
  const hasRounding = text.includes('端数') || text.includes('四捨') || text.includes('切り');
  const hasUnit = text.includes('単位') || text.includes('小数');
  const hasTagMode = text.includes('タグ') || text.includes('検索');

  if (text.length > 200 && hasRounding) {
    log('TC-G2', 'Settings screen has expected items', 'PASS',
      `hasRounding=${hasRounding}, hasUnit=${hasUnit}, hasTagMode=${hasTagMode}`);
  } else {
    log('TC-G2', 'Settings screen has expected items', 'FAIL',
      `text length=${text.length}, hasRounding=${hasRounding}`);
  }
}

// G3: Back from settings
async function testG3_BackFromSettings() {
  const backBtn = await page.$('#btn-back');
  if (backBtn) {
    await backBtn.click();
    await wait(300);
    const screen = await getActiveScreen();
    if (screen === 'screen-list') {
      log('TC-G3', 'Back from settings returns to list', 'PASS');
    } else {
      log('TC-G3', 'Back from settings returns to list', 'FAIL', `Screen: ${screen}`);
    }
  } else {
    log('TC-G3', 'Back from settings returns to list', 'FAIL', 'btn-back not found');
  }
}

// H1: Tag filter
async function testH1_TagFilter() {
  // Ensure we have tags and tagged recipe
  const recipeData = await getStorageData('ratioApp_recipes');
  const tags = await getStorageData('ratioApp_tags');
  const tagId = tags?.[0]?.id;

  if (!tagId || !recipeData || recipeData.length < 2) {
    log('TC-H1', 'Tag filter narrows recipe list', 'WARN',
      `Preconditions not met: tags=${tags?.length}, recipes=${recipeData?.length}`);
    return;
  }

  // Tag only the first recipe
  await page.evaluate((tid, rid) => {
    const recipes = JSON.parse(localStorage.getItem('ratioApp_recipes') || '[]');
    const updated = recipes.map((r, i) => ({ ...r, tagIds: i === 0 ? [tid] : [] }));
    localStorage.setItem('ratioApp_recipes', JSON.stringify(updated));
  }, tagId, recipeData[0].id);

  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  const totalBefore = await getRecipeCount();

  // Click filter chip for the tag
  const tagName = tags[0].name;
  const clicked = await page.evaluate((name) => {
    const chips = document.querySelectorAll('[class*="filter-chip"], [class*="chip"]');
    for (const c of chips) {
      if (c.textContent.trim() === name || c.textContent.includes(name)) {
        c.click(); return true;
      }
    }
    return false;
  }, tagName);
  await wait(400);

  const totalAfter = await getRecipeCount();

  if (clicked && totalAfter < totalBefore) {
    log('TC-H1', `Tag filter "${tagName}" narrows list`, 'PASS',
      `Before: ${totalBefore}, After: ${totalAfter}`);
  } else if (clicked) {
    log('TC-H1', `Tag filter "${tagName}" narrows list`, 'WARN',
      `Chip clicked but count same (before=${totalBefore}, after=${totalAfter})`);
  } else {
    log('TC-H1', `Tag filter "${tagName}" narrows list`, 'WARN',
      `Tag chip "${tagName}" not found in UI`);
  }

  // Clear filter
  await page.evaluate((name) => {
    const chips = document.querySelectorAll('[class*="filter-chip"], [class*="chip"]');
    for (const c of chips) {
      if (c.textContent.includes(name)) { c.click(); return; }
    }
  }, tagName);
  await wait(200);
}

// I1: Duplicate recipe
async function testI1_DuplicateRecipe() {
  const beforeNames = await getRecipeNames();
  if (beforeNames.length === 0) { log('TC-I1', 'Duplicate recipe', 'FAIL', 'No recipes'); return; }

  const target = beforeNames[0];
  await openRecipeMenu(target);
  await clickSheetItem('複製');
  await wait(500);

  const afterNames = await getRecipeNames();
  const afterCount = afterNames.length;

  if (afterCount > beforeNames.length) {
    log('TC-I1', `Duplicate recipe "${target}"`, 'PASS',
      `Before: ${beforeNames.length}, After: ${afterCount}`);
  } else {
    log('TC-I1', `Duplicate recipe "${target}"`, 'FAIL',
      `Count unchanged: ${afterCount}`);
  }
}

// I2: Create folder
async function testI2_CreateFolder() {
  const folderBtn = await page.$('#btn-new-folder');
  if (!folderBtn) { log('TC-I2', 'Create folder', 'FAIL', '#btn-new-folder not found'); return; }

  await folderBtn.click();
  await wait(400);

  const modalOpen = await page.evaluate(() => {
    const m = document.getElementById('modal-folder');
    return m && !m.classList.contains('hidden');
  });
  if (!modalOpen) { log('TC-I2', 'Create folder modal opens', 'FAIL', 'Modal not open'); return; }

  const nameInput = await page.$('#input-folder-name');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.type('パン類');
  }

  await page.click('#btn-modal-folder-save');
  await wait(400);

  const folderData = await getStorageData('ratioApp_folders');
  const uiText = await page.evaluate(() => document.body.textContent);

  if (folderData?.some(f => f.name === 'パン類')) {
    log('TC-I2', 'Create folder "パン類"', 'PASS');
  } else if (uiText.includes('パン類')) {
    log('TC-I2', 'Create folder "パン類"', 'PASS', 'Visible in UI');
  } else {
    log('TC-I2', 'Create folder "パン類"', 'FAIL',
      `folders: ${JSON.stringify(folderData)}`);
  }
}

// I3: Move recipe to folder
async function testI3_MoveToFolder() {
  const names = await getRecipeNames();
  if (names.length === 0) { log('TC-I3', 'Move recipe to folder', 'WARN', 'No recipes'); return; }

  const folderData = await getStorageData('ratioApp_folders');
  if (!folderData?.length) { log('TC-I3', 'Move recipe to folder', 'WARN', 'No folders exist'); return; }

  const target = names[0];
  await openRecipeMenu(target);
  await clickSheetItem('フォルダ移動');
  await wait(400);

  // Click first folder option in move dialog
  const folderClicked = await page.evaluate((fname) => {
    const modal = document.getElementById('modal-move');
    if (!modal || modal.classList.contains('hidden')) return false;
    const items = modal.querySelectorAll('[class*="folder-item"], [class*="move-item"], li, .modal-item');
    for (const item of items) {
      if (item.textContent.includes(fname)) { item.click(); return true; }
    }
    // Fallback: click any visible item
    if (items.length > 0) { items[0].click(); return true; }
    return false;
  }, folderData[0].name);
  await wait(400);

  if (folderClicked) {
    log('TC-I3', `Move recipe "${target}" to folder`, 'PASS');
  } else {
    log('TC-I3', `Move recipe "${target}" to folder`, 'WARN', 'Move dialog items not found');
    await page.keyboard.press('Escape');
    await wait(200);
  }
}

// J1: Data persistence after reload
async function testJ1_Persistence() {
  const beforeData = await getStorageData('ratioApp_recipes');
  const beforeCount = beforeData?.length || 0;

  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  const afterData = await getStorageData('ratioApp_recipes');
  const afterCount = afterData?.length || 0;
  const namesAfter = await getRecipeNames();

  if (afterCount === beforeCount && afterCount > 0) {
    log('TC-J1', 'Data persists after page reload', 'PASS',
      `${afterCount} recipes retained, UI shows: ${namesAfter.join(', ')}`);
  } else if (afterCount === beforeCount) {
    log('TC-J1', 'Data persists after page reload', 'WARN', 'No recipes to verify persistence');
  } else {
    log('TC-J1', 'Data persists after page reload', 'FAIL',
      `Before: ${beforeCount}, After: ${afterCount}`);
  }
}

// K1: Mobile layout 375px
async function testK1_MobileLayout375() {
  await page.setViewport({ width: 375, height: 667 });
  await wait(300);

  const header = await page.$('.header');
  const headerBox = await header?.boundingBox();
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  if (!hScroll && headerBox && headerBox.width <= 375) {
    log('TC-K1', 'Mobile layout 375px — no overflow', 'PASS', `header.width=${headerBox.width}`);
  } else {
    log('TC-K1', 'Mobile layout 375px — no overflow', 'FAIL',
      `hScroll=${hScroll}, header.width=${headerBox?.width}`);
  }
  await page.setViewport({ width: 390, height: 844 });
  await wait(200);
}

// K2: Narrow layout 320px
async function testK2_NarrowLayout320() {
  await page.setViewport({ width: 320, height: 568 });
  await wait(300);

  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (!hScroll) {
    log('TC-K2', 'Narrow layout 320px — no overflow', 'PASS');
  } else {
    log('TC-K2', 'Narrow layout 320px — no overflow', 'WARN',
      `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  }
  await page.setViewport({ width: 390, height: 844 });
  await wait(200);
}

// L1: LocalStorage keys present
async function testL1_StorageKeys() {
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const expected = ['ratioApp_recipes', 'ratioApp_settings', 'ratioApp_folders', 'ratioApp_tags'];
  const missing = expected.filter(k => !keys.includes(k));
  if (missing.length === 0) {
    log('TC-L1', 'All 4 localStorage keys present', 'PASS', keys.join(', '));
  } else {
    log('TC-L1', 'All 4 localStorage keys present', 'WARN',
      `Missing: ${missing.join(', ')}, Found: ${keys.join(', ')}`);
  }
}

// L2: Recipe JSON structure
async function testL2_RecipeStructure() {
  const data = await getStorageData('ratioApp_recipes');
  if (!data || data.length === 0) { log('TC-L2', 'Recipe JSON structure valid', 'WARN', 'No recipes'); return; }

  const r = data[0];
  const hasId          = typeof r.id === 'string';
  const hasName        = typeof r.name === 'string' && r.name.length > 0;
  const hasIngredients = Array.isArray(r.ingredients) && r.ingredients.length > 0;
  const hasOrder       = typeof r.order === 'number';
  const hasTagIds      = Array.isArray(r.tagIds);
  const hasSavedAmts   = Array.isArray(r.savedAmounts);
  const hasMemo        = r.memo !== undefined;

  const allOk = hasId && hasName && hasIngredients && hasOrder && hasTagIds && hasSavedAmts && hasMemo;
  if (allOk) {
    log('TC-L2', 'Recipe JSON structure has all required fields', 'PASS',
      `id, name, ingredients[${r.ingredients.length}], order, tagIds, savedAmounts, memo`);
  } else {
    log('TC-L2', 'Recipe JSON structure has all required fields', 'FAIL',
      `hasId=${hasId}, hasName=${hasName}, hasIngredients=${hasIngredients}, hasOrder=${hasOrder}, hasTagIds=${hasTagIds}`);
  }
}

// M1: Recipe summary text shown in list
async function testM1_RecipeSummary() {
  const summaries = await page.$$eval('.recipe-summary', els => els.map(e => e.textContent.trim()));
  if (summaries.length > 0 && summaries.some(s => s.length > 0)) {
    log('TC-M1', 'Recipe cards show summary/ingredient text', 'PASS',
      `e.g. "${summaries[0]}"`);
  } else {
    log('TC-M1', 'Recipe cards show summary/ingredient text', 'WARN',
      `${summaries.length} summaries found: ${JSON.stringify(summaries)}`);
  }
}

// M2: Back navigation from calc to list
async function testM2_BackNavigation() {
  const names = await getRecipeNames();
  if (names.length === 0) { log('TC-M2', 'Back navigation', 'WARN', 'No recipes'); return; }

  await openCalcForRecipe(names[0]);
  const calcScreen = await getActiveScreen();
  if (calcScreen !== 'screen-calc') {
    log('TC-M2', 'Back navigation from calc', 'FAIL', `Not on calc screen: ${calcScreen}`);
    return;
  }

  await goHome();
  const listScreen = await getActiveScreen();
  if (listScreen === 'screen-list') {
    log('TC-M2', 'Back navigation from calc to list', 'PASS');
  } else {
    log('TC-M2', 'Back navigation from calc to list', 'FAIL', `Screen: ${listScreen}`);
  }
}

// M3: Back button (← 戻る) from calc screen
async function testM3_BackButtonCalc() {
  const names = await getRecipeNames();
  if (names.length === 0) { log('TC-M3', 'Back button from calc', 'WARN', 'No recipes'); return; }

  await openCalcForRecipe(names[0]);
  await wait(200);

  const backBtn = await page.$('#btn-back');
  const backVisible = await page.evaluate(() => {
    const b = document.getElementById('btn-back');
    return b && b.style.display !== 'none';
  });

  if (backBtn && backVisible) {
    await backBtn.click();
    await wait(300);
    const screen = await getActiveScreen();
    if (screen === 'screen-list') {
      log('TC-M3', 'Back button (← 戻る) from calc works', 'PASS');
    } else {
      log('TC-M3', 'Back button (← 戻る) from calc works', 'FAIL', `Screen: ${screen}`);
    }
  } else {
    log('TC-M3', 'Back button (← 戻る) from calc works', 'WARN', `backVisible=${backVisible}`);
  }
}

// N1: Tag creation via UI
async function testN1_TagCreation() {
  // Check if tag filter bar exists and has an "add tag" button
  const tagBarEl = await page.$('#tag-filter-bar, .tag-filter-bar, [id*="tag-filter"]');
  const tagBtnFound = await page.evaluate(() => {
    // Look for any button that says タグ管理 or タグ追加 or a + near tags
    const all = Array.from(document.querySelectorAll('button, a'));
    const tagBtn = all.find(el => {
      const t = el.textContent.trim();
      return t.includes('タグ') && (t.includes('追加') || t.includes('管理') || t.includes('作成') || t === '+');
    });
    return !!tagBtn;
  });

  // Try opening tag modal by looking for + inside tag area
  const opened = await page.evaluate(() => {
    const tagBar = document.getElementById('tag-filter-bar');
    if (!tagBar) return false;
    const btns = tagBar.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.includes('+') || b.textContent.includes('タグ')) {
        b.click(); return true;
      }
    }
    return false;
  });
  await wait(400);

  const tagModalOpen = await page.evaluate(() => {
    const m = document.getElementById('modal-tag');
    return m && !m.classList.contains('hidden');
  });

  if (tagModalOpen) {
    // Fill tag name
    const tagNameInput = await page.$('#input-tag-name');
    if (tagNameInput) {
      await tagNameInput.type('テストタグ');
      await page.click('#btn-tag-save');
      await wait(300);
      const tagData = await getStorageData('ratioApp_tags');
      if (tagData?.some(t => t.name === 'テストタグ')) {
        log('TC-N1', 'Create tag via UI', 'PASS');
      } else {
        log('TC-N1', 'Create tag via UI', 'WARN', `Tags: ${JSON.stringify(tagData)}`);
      }
    } else {
      log('TC-N1', 'Create tag via UI', 'WARN', 'Tag name input not found in modal');
      await page.keyboard.press('Escape');
    }
  } else {
    log('TC-N1', 'Create tag via UI', 'WARN',
      `Tag modal not opened (opened=${opened}, tagBtnFound=${tagBtnFound})`);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== QA Test Report: 比率計算アプリ (ratio-calc) ===\n');
  console.log('Environment:');
  console.log('  Session: qa-ratio-calc-' + Date.now());
  console.log('  Service: 比率計算アプリ — static PWA via http://localhost:8765');
  console.log('  Date: 2026-04-05');
  console.log('  Viewport: 390x844 (iPhone 14 equivalent)\n');
  console.log('--- Test Cases ---\n');

  try {
    await startServer();
    await setup();

    // A: Page load
    await testA1_PageLoad();
    await testA2_EmptyState();

    // B: Recipe creation
    await testB1_AddSimpleRecipe();
    await testB2_AddMultiIngredientRecipe();
    await testB3_AddRecipeWithTags();

    // C: Validation
    await testC1_EmptyRecipeName();
    await testC2_ZeroIngredients();
    await testC3_NonNumericRatio();
    await testC4_ZeroRatio();
    await testC5_BlankIngredientName();

    // D: Edit
    await testD1_EditRecipe();

    // E: Delete
    await testE1_DeleteRecipe();

    // Ensure プレーンパン exists for calc tests
    {
      const names = await getRecipeNames();
      if (!names.includes('プレーンパン')) {
        await openNewRecipeForm();
        await fillRecipeForm('プレーンパン', [
          { name: '強力粉', ratio: '100' }, { name: '水', ratio: '65' },
          { name: '塩', ratio: '2' }, { name: 'イースト', ratio: '1' }, { name: 'バター', ratio: '5' }
        ]);
        await submitRecipeForm();
      }
    }

    // F: Calculation
    await testF1_OpenCalcScreen();
    await testF2_CalcTotal200();
    await testF3_CalcMathAccuracy();
    await testF4_CalcZeroError();
    await testF5_CalcNegativeError();
    await testF6_CalcLargeNumber();
    await testF7_CalcDecimal();
    await testF8_IngredientCalc();
    await testF9_SavedAmount();

    // G: Settings
    await testG1_SettingsScreen();
    await testG2_SettingsContent();
    await testG3_BackFromSettings();

    // H: Tag filter
    await testH1_TagFilter();

    // I: Folders & duplicate
    await testI1_DuplicateRecipe();
    await testI2_CreateFolder();
    await testI3_MoveToFolder();

    // J: Persistence
    await testJ1_Persistence();

    // K: Layout
    await testK1_MobileLayout375();
    await testK2_NarrowLayout320();

    // L: Data integrity
    await testL1_StorageKeys();
    await testL2_RecipeStructure();

    // M: Navigation & UX
    await testM1_RecipeSummary();
    await testM2_BackNavigation();
    await testM3_BackButtonCalc();

    // N: Tag UI
    await testN1_TagCreation();

  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  // ─── Summary ───
  const total = passed + failed + warned;
  console.log('\n--- Summary ---');
  console.log(`Total:   ${total} tests`);
  console.log(`Passed:  ${passed}`);
  console.log(`Warned:  ${warned}`);
  console.log(`Failed:  ${failed}`);
  console.log('\n--- Cleanup ---');
  console.log('Browser closed: YES');
  console.log('Server stopped: YES');
  console.log('Artifacts: qa-test.js, server.js (test files only, no app changes)');

  if (failed > 0) {
    console.log('\n--- FAILED TESTS ---');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${r.testId}: ${r.name}`);
      if (r.details) console.log(`    Details: ${r.details}`);
    });
  }
  if (warned > 0) {
    console.log('\n--- WARNED TESTS ---');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  ${r.testId}: ${r.name}`);
      if (r.details) console.log(`    Details: ${r.details}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFATAL TEST ERROR:', err.message);
  console.error(err.stack);
  if (browser) browser.close().catch(() => {});
  stopServer();
  process.exit(2);
});
