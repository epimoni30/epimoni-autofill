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
- Language: French (default), with English, Spanish, Portuguese (Brazil), Polish and Italian
  listings
- Homepage: https://www.epimoni30.com/extension-chrome
- Support: https://github.com/epimoni30/epimoni-autofill/issues
- Privacy policy URL: https://github.com/epimoni30/epimoni-autofill/blob/main/PRIVACY.md (the
  published copy of [`PRIVACY.md`](../PRIVACY.md); the site's own policy links to it)

### Detailed description (français)

```
Remplissez vos candidatures en un clic, à partir d'un CV saisi une seule fois.

Epimoni Autofill reconnaît les champs d'un formulaire de candidature (prénom, e-mail,
téléphone, poste actuel, expériences, formations, langues, etc.) et les remplit depuis votre CV.
Vous relisez, vous corrigez, vous envoyez : l'extension ne soumet jamais rien à votre place.

VOTRE CV, UNE FOIS
• Saisissez-le dans l'extension, importez un fichier JSON Résumé, ou récupérez celui de votre
  compte Epimoni. Avec un compte connecté, importez aussi votre CV en PDF : son texte est lu sur
  votre ordinateur, puis rangé en rubriques par l'IA d'Epimoni.
• Gardez plusieurs versions (CV court, CV détaillé) et choisissez celle qui remplit.
• Exportez-le à tout moment au format JSON Résumé, lisible par d'autres outils.

UN REMPLISSAGE PRUDENT
• Sur les sites d'emploi reconnus, un bouton « Remplir avec Epimoni » apparaît : un clic suffit.
• Chaque champ rempli est listé dans un panneau, avec « Tout annuler ».
• Expériences et formations remplies bloc par bloc, dates adaptées au formulaire.
• Aucune case cochée, aucun bouton « Ajouter » pressé, aucun mot de passe ni moyen de paiement
  touché. Dans le doute, le champ est laissé vide.
• Quand le formulaire demande votre CV en fichier, l'extension joint le PDF que vous lui avez
  confié, ou un PDF créé à partir de votre CV.

OÙ ÇA MARCHE
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed et LinkedIn. Sur n'importe quel
autre site carrière (Workday, Taleez, formulaires maison), il suffit de cliquer sur l'icône, ou
d'activer le remplissage automatique pour ce site.

VOS CANDIDATURES EN UN COUP D'ŒIL
Chaque formulaire rempli rejoint un tableau par colonnes (remplie, envoyée, entretien, offre,
refusée). Glissez une carte quand ça avance, ajoutez une candidature faite ailleurs, exportez en
CSV.

L'IA POUR CHAQUE OFFRE
Sur une annonce, « Analyser cette offre » compare votre CV aux attentes du poste et donne un
score avec vos points faibles. La lettre de motivation est rédigée dans la limite du formulaire
et s'enregistre en PDF. Votre CV peut être adapté à l'offre : vous gardez les modifications qui
sont vraies pour vous, et le CV adapté remplit le formulaire avec son PDF. Ces fonctions IA
demandent un compte Epimoni connecté à l'extension (gratuit : une par heure ; illimité avec une
formule).

VIE PRIVÉE
Votre CV reste dans votre navigateur. Le remplissage n'envoie ni votre CV ni le contenu des
formulaires : avec un compte connecté, seuls des compteurs remontent (combien de champs remplis,
sur quel site). Seules les fonctions IA, lancées par vous, transmettent le CV et l'annonce aux
serveurs d'Epimoni.

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
  account. With an account connected, you can also import your CV as a PDF: its text is read on
  your computer, then sorted into sections by Epimoni's AI.
• Keep several versions (short CV, detailed CV) and choose which one fills.
• Export it any time as JSON Résumé, readable by other tools.

CAREFUL FILLING
• On the job boards it knows, a "Fill with Epimoni" button shows up: one click is enough.
• Every field filled is listed in a panel, with "Undo all".
• Work history and education filled block by block, dates fitted to the form.
• No box ticked, no "Add" button pressed, no password or payment field touched. When in doubt,
  a field is left empty.
• When the form asks for your CV as a file, the extension attaches the PDF you gave it, or one
  made from your CV.

WHERE IT WORKS
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed and LinkedIn. On any other
careers site (Workday, Taleez, in-house forms), just click the toolbar icon, or turn on
automatic filling for that site.

YOUR APPLICATIONS AT A GLANCE
Every form filled joins a board with a column per status (filled, sent, interview, offer,
rejected). Drag a card as things move, add an application made elsewhere, export to CSV.

AI FOR EVERY JOB AD
On a job ad, "Analyse this offer" compares your CV with what the role asks for and gives a
score with your weak points. The cover letter is written within the form's limit and saves as a
PDF. Your CV can be tailored to the ad: you keep the changes that are true for you, and the
tailored CV fills the form with its own PDF. These AI features need an Epimoni account connected
to the extension (free: one an hour; unlimited with a plan).

PRIVACY
Your CV stays in your browser. Filling sends neither your CV nor what the form holds: with an
account connected, only counts are reported (how many fields were filled, on which site). Only
the AI features, started by you, send your CV and the ad to Epimoni's servers.

Open source, Apache 2.0 licence.
```

### Detailed description (polski)

The board names in "Gdzie to działa" are the ones the extension knows by name; a Polish
board such as Pracuj.pl is filled from the toolbar icon like any other careers site, so it is
not promised by name. Screenshots are the English set.

```
Wypełniaj formularze aplikacyjne jednym kliknięciem, z CV wpisanego tylko raz.

Epimoni Autofill rozpoznaje pola formularza aplikacyjnego (imię, e-mail, telefon, obecne
stanowisko, doświadczenie, wykształcenie, języki i tak dalej) i wypełnia je danymi z twojego CV.
Ty sprawdzasz, poprawiasz i wysyłasz: rozszerzenie nigdy niczego nie wysyła za ciebie.

TWOJE CV, RAZ
• Wpisz je w rozszerzeniu, zaimportuj plik JSON Resume albo pobierz to z konta Epimoni. Z
  połączonym kontem możesz też zaimportować CV w PDF: tekst jest odczytywany na twoim
  komputerze, a potem AI Epimoni dzieli go na sekcje.
• Trzymaj kilka wersji (krótkie CV, szczegółowe CV) i wybierz, która wypełnia formularze.
• Eksportuj je w każdej chwili jako JSON Resume, czytelny dla innych narzędzi.

OSTROŻNE WYPEŁNIANIE
• Na znanych portalach z ofertami pojawia się przycisk „Wypełnij z Epimoni”: wystarczy jedno
  kliknięcie.
• Każde wypełnione pole jest widoczne w panelu, z opcją „Cofnij wszystko”.
• Doświadczenie i wykształcenie wypełniane blok po bloku, daty dopasowane do formularza.
• Gdy formularz prosi o CV w pliku, rozszerzenie dołącza PDF, który mu przekazałeś, albo PDF
  utworzony z twojego CV.
• Żadne pole wyboru nie jest zaznaczane, żaden przycisk „Dodaj” klikany, żadne pole hasła ani
  płatności ruszane. W razie wątpliwości pole zostaje puste.

GDZIE TO DZIAŁA
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed i LinkedIn. Na każdej innej
stronie kariery (Workday, Pracuj.pl, formularze firmowe) wystarczy kliknąć ikonę na pasku albo
włączyć automatyczne wypełnianie dla tej strony.

TWOJE APLIKACJE W JEDNYM MIEJSCU
Każdy wypełniony formularz trafia na tablicę z kolumną dla każdego etapu (wypełniona, wysłana,
rozmowa, oferta, odrzucona). Przeciągaj karty, gdy coś się zmienia, dodawaj aplikacje złożone
gdzie indziej, eksportuj do CSV.

AI DO KAŻDEJ OFERTY
Na stronie z ofertą „Przeanalizuj tę ofertę” porównuje twoje CV z wymaganiami stanowiska i
podaje wynik z twoimi słabymi punktami. List motywacyjny jest pisany w limicie formularza i
zapisuje się jako PDF. Twoje CV można dopasować do oferty: zostawiasz zmiany, które są o tobie
prawdziwe, a dopasowane CV wypełnia formularz własnym PDF. Te funkcje AI wymagają konta Epimoni
połączonego z rozszerzeniem (za darmo: jedna na godzinę; bez limitu w planie).

PRYWATNOŚĆ
Twoje CV zostaje w przeglądarce. Wypełnianie nie wysyła ani CV, ani treści formularzy: przy
połączonym koncie przesyłane są tylko liczniki (ile pól wypełniono, na jakiej stronie). Tylko
funkcje AI, uruchamiane przez ciebie, przesyłają CV i ofertę na serwery Epimoni.

Otwarte źródło, licencja Apache 2.0.
```

### Detailed description (español)

```
Rellene sus candidaturas con un clic, a partir de un CV que introduce una sola vez.

Epimoni Autofill reconoce los campos de un formulario de candidatura (nombre, correo,
teléfono, puesto actual, experiencia, formación, idiomas, etc.) y los rellena con su CV. Usted
revisa, corrige y envía: la extensión nunca envía nada en su lugar.

SU CV, UNA SOLA VEZ
• Escríbalo en la extensión, importe un archivo JSON Résumé o traiga el de su cuenta Epimoni.
  Con una cuenta conectada, también puede importar su CV en PDF: el texto se lee en su
  ordenador y la IA de Epimoni lo ordena por secciones.
• Guarde varias versiones (CV corto, CV detallado) y elija cuál rellena.
• Expórtelo cuando quiera en formato JSON Résumé, legible por otras herramientas.

UN RELLENO PRUDENTE
• En los portales de empleo que conoce aparece un botón «Rellenar con Epimoni»: basta un clic.
• Cada campo rellenado aparece en un panel, con «Deshacer todo».
• Experiencia y formación rellenadas bloque a bloque, con las fechas en el formato del
  formulario.
• No marca ninguna casilla, no pulsa ningún botón «Añadir», no toca contraseñas ni medios de
  pago. Ante la duda, el campo se queda vacío.
• Cuando el formulario pide el CV como archivo, adjunta el PDF que usted le dio, o uno creado a
  partir de su CV.

DÓNDE FUNCIONA
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed y LinkedIn. En cualquier otra
web de empleo (Workday, Taleez, formularios propios), haga clic en el icono de la extensión o
active el relleno automático para esa web.

SUS CANDIDATURAS DE UN VISTAZO
Cada formulario rellenado se suma a un tablero con una columna por estado (rellenada, enviada,
entrevista, oferta, rechazada). Arrastre una tarjeta cuando algo avance, añada una candidatura
hecha en otro sitio y exporte a CSV.

IA PARA CADA OFERTA
En un anuncio, «Analizar esta oferta» compara su CV con lo que pide el puesto y da una
puntuación con sus puntos débiles. La carta de presentación se redacta dentro del límite del
formulario y se guarda en PDF. Su CV puede adaptarse a la oferta: usted conserva los cambios
que son ciertos y el CV adaptado rellena el formulario con su propio PDF. Estas funciones de IA
requieren una cuenta Epimoni conectada a la extensión (gratis: una por hora; ilimitadas con un
plan).

PRIVACIDAD
Su CV se queda en su navegador. El relleno no envía ni su CV ni el contenido de los
formularios: con una cuenta conectada, solo se envían contadores (cuántos campos se rellenaron
y en qué web). Solo las funciones de IA, que usted lanza, envían el CV y el anuncio a los
servidores de Epimoni.

Código abierto, licencia Apache 2.0.
```

### Detailed description (português, Brasil)

```
Preencha suas candidaturas com um clique, a partir de um currículo digitado uma única vez.

O Epimoni Autofill reconhece os campos de um formulário de candidatura (nome, e-mail,
telefone, cargo atual, experiências, formação, idiomas etc.) e os preenche com o seu currículo.
Você revisa, corrige e envia: a extensão nunca envia nada no seu lugar.

SEU CURRÍCULO, UMA VEZ
• Digite na extensão, importe um arquivo JSON Résumé ou traga o da sua conta Epimoni. Com uma
  conta conectada, você também pode importar o currículo em PDF: o texto é lido no seu
  computador e a IA da Epimoni o organiza em seções.
• Guarde várias versões (currículo curto, currículo completo) e escolha qual preenche.
• Exporte quando quiser em JSON Résumé, legível por outras ferramentas.

UM PREENCHIMENTO CUIDADOSO
• Nos sites de vagas que ela conhece, aparece um botão "Preencher com Epimoni": basta um
  clique.
• Cada campo preenchido aparece em um painel, com "Desfazer tudo".
• Experiências e formação preenchidas bloco a bloco, com as datas no formato do formulário.
• Nenhuma caixa marcada, nenhum botão "Adicionar" clicado, nenhum campo de senha ou pagamento
  tocado. Na dúvida, o campo fica vazio.
• Quando o formulário pede o currículo em arquivo, a extensão anexa o PDF que você enviou a ela,
  ou um criado a partir do seu currículo.

ONDE FUNCIONA
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed e LinkedIn. Em qualquer outro
site de carreiras (Workday, Gupy, formulários próprios), clique no ícone da extensão ou ative o
preenchimento automático para aquele site.

SUAS CANDIDATURAS EM UM SÓ LUGAR
Cada formulário preenchido entra em um quadro com uma coluna por etapa (preenchida, enviada,
entrevista, proposta, recusada). Arraste um cartão quando algo avançar, adicione uma
candidatura feita em outro lugar e exporte para CSV.

IA PARA CADA VAGA
Em um anúncio, "Analisar esta vaga" compara seu currículo com o que a vaga pede e dá uma nota
com seus pontos fracos. A carta de apresentação é escrita dentro do limite do formulário e pode
ser salva em PDF. Seu currículo pode ser adaptado à vaga: você mantém as mudanças que são
verdadeiras, e o currículo adaptado preenche o formulário com o próprio PDF. Essas funções de
IA exigem uma conta Epimoni conectada à extensão (grátis: uma por hora; ilimitadas com um
plano).

PRIVACIDADE
Seu currículo fica no seu navegador. O preenchimento não envia nem o currículo nem o conteúdo
dos formulários: com uma conta conectada, só são enviados contadores (quantos campos foram
preenchidos e em qual site). Só as funções de IA, iniciadas por você, enviam o currículo e o
anúncio aos servidores da Epimoni.

Código aberto, licença Apache 2.0.
```

### Detailed description (italiano)

The extension's own interface has no Italian translation yet, so an Italian Chrome shows it in
French (the default locale) until `_locales/it` exists. Publish this listing together with that
locale, not before.

```
Compila le candidature con un clic, partendo da un CV inserito una volta sola.

Epimoni Autofill riconosce i campi di un modulo di candidatura (nome, e-mail, telefono, ruolo
attuale, esperienze, formazione, lingue e così via) e li compila dal tuo CV. Tu rileggi,
correggi e invii: l'estensione non invia mai nulla al posto tuo.

IL TUO CV, UNA VOLTA
• Scrivilo nell'estensione, importa un file JSON Résumé o recupera quello del tuo account
  Epimoni. Con un account collegato puoi anche importare il CV in PDF: il testo viene letto sul
  tuo computer e l'IA di Epimoni lo divide in sezioni.
• Tieni più versioni (CV breve, CV dettagliato) e scegli quale usare per compilare.
• Esportalo quando vuoi in formato JSON Résumé, leggibile da altri strumenti.

UNA COMPILAZIONE PRUDENTE
• Sui siti di annunci che conosce compare un pulsante "Compila con Epimoni": basta un clic.
• Ogni campo compilato è elencato in un pannello, con "Annulla tutto".
• Esperienze e formazione compilate blocco per blocco, con le date nel formato del modulo.
• Nessuna casella spuntata, nessun pulsante "Aggiungi" premuto, nessun campo di password o di
  pagamento toccato. Nel dubbio, il campo resta vuoto.
• Quando il modulo chiede il CV come file, l'estensione allega il PDF che le hai dato, oppure
  uno creato dal tuo CV.

DOVE FUNZIONA
France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed e LinkedIn. Su qualsiasi altro
sito di carriera (Workday, InfoJobs, moduli aziendali) clicca sull'icona dell'estensione,
oppure attiva la compilazione automatica per quel sito.

LE TUE CANDIDATURE A COLPO D'OCCHIO
Ogni modulo compilato entra in una bacheca con una colonna per stato (compilata, inviata,
colloquio, offerta, rifiutata). Sposta una scheda quando qualcosa avanza, aggiungi una
candidatura fatta altrove ed esporta in CSV.

L'IA PER OGNI ANNUNCIO
Su un annuncio, "Analizza questa offerta" confronta il tuo CV con ciò che chiede il ruolo e dà
un punteggio con i tuoi punti deboli. La lettera di presentazione viene scritta entro il limite
del modulo e si salva in PDF. Il tuo CV può essere adattato all'annuncio: tieni le modifiche
vere per te, e il CV adattato compila il modulo con il proprio PDF. Queste funzioni di IA
richiedono un account Epimoni collegato all'estensione (gratis: una all'ora; illimitate con un
piano).

PRIVACY
Il tuo CV resta nel browser. La compilazione non invia né il CV né il contenuto dei moduli: con
un account collegato vengono inviati solo dei contatori (quanti campi compilati, su quale
sito). Solo le funzioni di IA, avviate da te, inviano il CV e l'annuncio ai server di Epimoni.

Codice aperto, licenza Apache 2.0.
```

## Privacy practices tab

### Single purpose

> Help the user apply for jobs: fill application forms from their own CV, keep track of the
> applications, and, on request, prepare the documents for the job advert on the page
> (comparison with the CV, cover letter, CV tailored to the advert).

### Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Filling runs on the page the user is on when they click the toolbar icon, including careers sites not listed in the manifest. Access lasts for that tab only. |
| `scripting` | Injects the form-filling script into the active tab when the user clicks the icon, on sites where it is not declared as a content script. |
| `storage` | Keeps the user's CVs and settings on their own computer (`storage.local`, never synced), and a per-session cache so an analysis is not paid for twice. |
| Host: epimoni30.com | Lets the user bring their CV over from their Epimoni account (`externally_connectable`, origin checked). The site can only ask; the user confirms on an extension page. |
| Host: the API endpoint (`*.lambda-url.eu-central-1.on.aws`) | The AI features the user requests (offer analysis, cover letter, tailored CV, sorting an imported CV's text into sections) are computed on Epimoni's server. |
| Optional host access (`https://*/*`, `http://*/*`): all sites for the button, or one site at a time | Never asked at install. When the user turns on the "Fill with Epimoni" button for every site (popup or Sites page), the browser asks for all sites: a small script then only checks whether a page holds an application form and shows the button; nothing is read further or filled without the user's click. When the user ticks "Fill automatically on <site>" in the popup, the browser asks for that one site only, and the form-filling script then runs there on page load so an application form is filled as it appears. Turned off from the panel, the popup or the dashboard, the site's access is handed back. |
| Content scripts on France Travail, HelloWork, APEC, Welcome to the Jungle, Indeed (with Indeed Apply, `smartapply.indeed.com`), LinkedIn | These job boards host the application forms the extension fills and the adverts it can analyse. The script reads forms locally and sends nothing on its own. On LinkedIn, only the small script that shows the "Fill with Epimoni" button runs outside the Jobs pages, because LinkedIn opens a job without loading a new page; the form-filling script runs on the Jobs pages, or after a click on the button. |

- Remote code: no. All code is in the package; the server returns data (scores, text), never code.

### Data usage

Tick:

- Personally identifiable information: name, email, phone, address from the user's CV.
- Authentication information: the Epimoni sign-in token, when the user connects an account.
- Website content: the job advert text, sent only when the user requests an analysis, a cover
  letter or a tailored CV.
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
