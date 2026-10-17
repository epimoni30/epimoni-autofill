// The guarded API and filler evidence, in a real browser.
//
// The guard is the reason a filler written by anybody cannot submit a form, tick a box or
// follow a link. Each check below is one way a widget filler could try (on purpose or by
// accident) and the guard's answer, which must be no. It runs the shipped bundle
// (tools/bundle.mjs), not a copy.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium } from '../tools/chromium.mjs';
import { bundleContent } from '../tools/bundle.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();

await page.setContent(`
  <form id="f" onsubmit="window.__submitted = true; return false">
    <div id="box" role="combobox" aria-controls="pop" aria-expanded="false">
      <a id="link" href="#elsewhere">help</a>
      <input id="inner">
    </div>
    <ul id="pop" role="listbox">
      <li id="opt" role="option">France</li>
      <li role="option">Belgique</li>
      <button id="submit-in-popup">Apply now</button>
      <button id="plain" type="button">Clear</button>
      <div id="fakebox" role="checkbox">Remember me</div>
    </ul>
    <li id="stray" role="option">Outside the popup</li>
    <input id="other">
    <label><input type="checkbox" id="consent"> I agree</label>
    <div id="ov" class="tz-select"><div class="trigger" id="ov-trigger">Choisir...</div></div>
    <button type="button" id="before">Already on the page</button>
  </form>
  <script>
    // An overlay library: the list is rendered at the end of <body> on click, declared nowhere.
    document.getElementById('ov-trigger').addEventListener('click', () => {
      const pane = document.createElement('div');
      pane.className = 'cdk-overlay-pane';
      pane.innerHTML =
        '<button type="button" id="ov-a" class="item">1 à 3 ans</button>' +
        '<button type="button" id="ov-b" class="item">5 à 10 ans</button>' +
        '<button id="ov-submit" type="submit" form="f">Envoyer</button>';
      document.body.appendChild(pane);
    });
  </script>`);

const results = await page.evaluate(`(() => {
  ${bundleContent(join(HERE, '..'))}
  const $ = (id) => document.getElementById(id);
  const box = $('box');
  const api = createGuard(box, { setValue, clearValue, matchOption });
  const r = {};
  r.chooseOption = api.choose($('opt'));
  r.submitInPopup = api.choose($('submit-in-popup'));
  r.plainButtonInPopup = api.choose($('plain'));
  r.roleCheckbox = api.choose($('fakebox'));
  r.strayOption = api.choose($('stray'));
  r.linkInside = api.open($('link'));
  r.typeInside = api.type($('inner'), 'abc');
  r.typeOutside = api.type($('other'), 'abc');
  r.checkboxOutside = api.open($('consent'));
  r.pickPrefix = api.pick(['Select One', 'Master\\'s degree', 'Master'], 'master');
  r.pickNone = api.pick(['Licence', 'Doctorat'], 'Master Marketing digital');
  // A popup the control's own open() rendered elsewhere is the control's; nothing else is.
  const ov = createGuard($('ov'), { setValue, clearValue, matchOption: matcherFor('years_experience') });
  const early = createGuard($('ov'), { setValue, clearValue, matchOption });
  r.overlayOpened = ov.open($('ov-trigger'));
  r.overlayPopups = ov.popups().length;
  r.overlayOption = ov.choose($('ov-b'));
  r.overlaySubmit = ov.choose($('ov-submit'));
  r.overlayBefore = ov.choose($('before'));
  r.overlayNotOpenedHere = early.choose($('ov-a'));
  r.overlayPickYears = ov.pick(['1 à 3 ans', '5 à 10 ans', 'Plus de 10 ans'], '8');
  // The budget: six clicks per write, whatever the filler's loop does.
  const budget = createGuard(box, { setValue, clearValue, matchOption });
  let n = 0;
  for (let i = 0; i < 20; i += 1) if (budget.open(box)) n += 1;
  r.clicksAllowed = n;
  r.submitted = window.__submitted === true;
  r.consentTicked = $('consent').checked;
  r.navigated = location.hash === '#elsewhere';
  r.refusals = api.refusals.length;

  // Filler evidence in block assignment: a hint may agree, disagree on the index (weak) or
  // name another section (contested), never overrule.
  const lex = createResolver({ lexicons: EPIMONI_PACKS, autocomplete: EPIMONI_AUTOCOMPLETE });
  const input = document.createElement('input');
  input.name = 'experiences[0][company]';
  document.body.appendChild(input);
  r.hintAgrees = assignBlocks([input], lex, [{ section: 'work', index: 0 }])[0];
  r.hintIndexDiffers = assignBlocks([input], lex, [{ section: 'work', index: 3 }])[0];
  r.hintSectionDiffers = assignBlocks([input], lex, [{ section: 'education', index: 0 }])[0];
  r.hintAlone = assignBlocks([$('other')], lex, [{ section: 'education', index: 1 }])[0];
  return r;
})()`);

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) fails.push(name);
};
check('an option in the declared popup can be chosen', results.chooseOption === true);
check('a submit button inside the popup is refused', results.submitInPopup === false);
check('a type="button" inside the popup is allowed', results.plainButtonInPopup === true);
check('a role="checkbox" is refused', results.roleCheckbox === false);
check('an option outside the declared popup is refused', results.strayOption === false);
check('a link inside the control is refused', results.linkInside === false);
check('typing into the widget’s own input is allowed', results.typeInside === true);
check('typing into another field is refused', results.typeOutside === false);
check('a checkbox elsewhere on the page is refused', results.checkboxOutside === false);
check('pick uses the core rule: exact before prefix', results.pickPrefix === 2, String(results.pickPrefix));
check('pick refuses a near miss', results.pickNone === -1, String(results.pickNone));
check(
  'the click budget caps a runaway loop at 6',
  results.clicksAllowed === 6,
  String(results.clicksAllowed),
);
check('nothing was submitted', results.submitted === false);
check('the consent box was not ticked', results.consentTicked === false);
check('the page did not navigate', results.navigated === false);
check('every refusal was recorded', results.refusals >= 6, String(results.refusals));
check(
  'an overlay the control opened is its popup',
  results.overlayOpened && results.overlayPopups >= 1 && results.overlayOption === true,
  JSON.stringify([results.overlayOpened, results.overlayPopups, results.overlayOption]),
);
check('a submit button in that overlay is still refused', results.overlaySubmit === false);
check('a button that was already on the page is not part of it', results.overlayBefore === false);
check('another control that opened nothing cannot click it', results.overlayNotOpenedHere === false);
check(
  'pick follows the key: eight years pick "5 à 10 ans"',
  results.overlayPickYears === 1,
  String(results.overlayPickYears),
);
check(
  'a hint that agrees with the ids fills',
  results.hintAgrees?.section === 'work' && results.hintAgrees.index === 0 && !results.hintAgrees.weak,
  JSON.stringify(results.hintAgrees),
);
check('a hint that disagrees on the index only suggests', results.hintIndexDiffers?.weak === true);
check('a hint naming another section contests the block', results.hintSectionDiffers?.section === null);
check(
  'a hint alone is evidence enough',
  results.hintAlone?.section === 'education' && results.hintAlone.index === 1,
  JSON.stringify(results.hintAlone),
);

await browser.close();
if (fails.length) {
  console.log(`\nFAILED: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nall guard checks passed');
