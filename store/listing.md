# Chrome Web Store listing

Everything the developer dashboard asks for, in the order it asks. Copy from here; when the
extension changes, change this file in the same pull request so the listing never describes a
product that no longer exists.

Assets are rendered, not drawn: `npm run store` builds a dev copy, then writes
`store/screenshots/*.png` (1280×800) and `store/promo-<lang>-440x280.png` from the real
extension, in French and English.

## Package

- Zip: the `epimoni-autofill-v<version>.zip` attached to the GitHub release that the
  `v<version>` tag creates (`.github/workflows/release.yml`). Never zip a local `dist/` by hand:
  `npm run e2e` leaves a *dev* build there, with localhost permissions.
- Name and short description: taken from `_locales/*/messages.json` (`ext_name`,
  `ext_description`), per language. Store limits are 75 and 132 characters; `build.mjs` refuses
  a build that exceeds them.

## Store listing

- Category: Productivity, then Workflow & Planning
- Language: French (default), with English and Spanish listings
- Homepage: https://www.epimoni30.com/extension-chrome
- Support: https://github.com/epimoni30/epimoni-autofill/issues
- Privacy policy URL: the published copy of [`PRIVACY.md`](../PRIVACY.md).

### Detailed description (français)

```
Remplissez vos candidatures en un clic, à partir d'un CV saisi une seule fois.

Epimoni Autofill reconnaît les champs d'un formulaire de candidature (prénom, e-mail,
téléphone, poste actuel, expériences, formations, langues, etc.) et les remplit depuis votre CV.
Vous relisez, vous corrigez, vous envoyez : l'extension ne soumet jamais rien à votre place.

VOTRE CV, UNE FOIS
• Saisissez-le dans l'extension, importez un fichier JSON Résumé, ou récupérez celui de votre
  compte Epimoni.
• Gardez plusieurs versions (CV court, CV détaillé) et choisissez celle qui remplit.
• Exportez-le à tout moment au format JSON Résumé, lisible par d'autres outils.

UN REMPLISSAGE PRUDENT
• Chaque champ rempli est listé dans un panneau, avec « Tout annuler ».
• Expériences et formations remplies bloc par bloc, dates adaptées au formulaire.
• Aucune case cochée, aucun bouton « Ajouter » pressé, aucun mot de passe ni moyen de paiement
  touché. Dans le doute, le champ est laissé vide.

OÙ ÇA MARCHE
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed et LinkedIn. Sur n'importe quel
autre site carrière (Workday, Taleez, formulaires maison), il suffit de cliquer sur l'icône.

ANALYSE D'OFFRE PAR L'IA
Sur une annonce, « Analyser cette offre » compare votre CV aux attentes du poste et donne un
score avec vos points faibles. Une analyse par heure sans compte ; avec un compte Epimoni,
selon votre formule, et l'analyse complète s'ouvre sur epimoni30.com.

VIE PRIVÉE
Votre CV reste dans votre navigateur. Le remplissage n'envoie rien. Seule l'analyse d'offre,
lancée par vous, transmet le CV et l'annonce aux serveurs d'Epimoni.

Code source ouvert, sous licence Apache 2.0.
```

### Detailed description (English)

```
Fill in job applications in one click, from a CV you enter once.

Epimoni Autofill recognises the fields of an application form (first name, email, phone,
current role, work history, education, languages and so on) and fills them from your CV. You review,
correct and send: the extension never submits anything for you.

YOUR CV, ONCE
• Type it into the extension, import a JSON Résumé file, or bring the one from your Epimoni
  account.
• Keep several versions (short CV, detailed CV) and choose which one fills.
• Export it any time as JSON Résumé, readable by other tools.

CAREFUL FILLING
• Every field filled is listed in a panel, with "Undo all".
• Work history and education filled block by block, dates fitted to the form.
• No box ticked, no "Add" button pressed, no password or payment field touched. When in doubt,
  a field is left empty.

WHERE IT WORKS
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed and LinkedIn. On any other
careers site (Workday, Taleez, in-house forms), just click the toolbar icon.

AI OFFER ANALYSIS
On a job ad, "Analyse this offer" compares your CV with what the role asks for and gives a
score with your weak points. One analysis an hour without an account; with an Epimoni account,
according to your plan, and the full analysis opens on epimoni30.com.

PRIVACY
Your CV stays in your browser. Filling sends nothing. Only the offer analysis, started by you,
sends your CV and the ad to Epimoni's servers.

Open source, Apache 2.0 licence.
```

## Privacy practices tab

### Single purpose

> Fill job application forms from the user's own CV, and, on request, compare that CV with the
> job advert on the page.

### Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Filling runs on the page the user is on when they click the toolbar icon, including careers sites not listed in the manifest. Access lasts for that tab only. |
| `scripting` | Injects the form-filling script into the active tab when the user clicks the icon, on sites where it is not declared as a content script. |
| `storage` | Keeps the user's CVs and settings on their own computer (`storage.local`, never synced), and a per-session cache so an analysis is not paid for twice. |
| Host: epimoni30.com | Lets the user bring their CV over from their Epimoni account (`externally_connectable`, origin checked). The site can only ask; the user confirms on an extension page. |
| Host: the API endpoint (`*.lambda-url.eu-central-1.on.aws`) | The offer analysis the user requests is computed on Epimoni's server. |
| Content scripts on France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed, LinkedIn Jobs | These job boards host the application forms the extension fills and the adverts it can analyse. The script reads forms locally and sends nothing on its own. |

- Remote code: no. All code is in the package; the server returns data (scores), never code.

### Data usage

Tick:

- Personally identifiable information: name, email, phone, address from the user's CV.
- Authentication information: the Epimoni sign-in token, when the user connects an account.
- Website content: the job advert text, sent only when the user requests an analysis.
- User activity: per-site counts of fields filled, accepted and dismissed. No keystrokes,
  values or page content, but they are counts of clicks, and declaring more than the strict
  reading requires is the side to err on.

Leave unticked: health, financial and payment, personal communications, location (the CV's city
is part of the PII above, not device location), web history.

Certify all three: not sold to third parties; not used or transferred for purposes unrelated to
the single purpose; not used to determine creditworthiness or for lending.

## Releasing

1. Bump `version` in `manifest.json` and `package.json`, and date the CHANGELOG section.
2. Tag: `git tag v<version> && git push origin v<version>`. The release workflow runs the full
   `check`, builds a production `dist/`, refuses a dev build, and attaches the zip to a GitHub
   release.
3. Upload that zip in the developer dashboard, and update the text above if the release changed
   what the extension does.
