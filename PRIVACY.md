# Epimoni Autofill privacy policy

*Last updated: 25 September 2026. [Version française plus bas.](#fr)*

Epimoni Autofill is a browser extension that fills job application forms from a CV you keep in
the extension. This page says what it stores, what it sends, and to whom. It describes the
extension only; the Epimoni website has
[its own policy](https://www.epimoni30.com/politique-de-confidentialite).

The data controller is Epimoni30, Untere Roostmatt 8, CH-6300 Zug, Switzerland
(contact.epimoni30@gmail.com).

## The short version

- Filling a form sends nothing anywhere. Your CV stays in your browser, and the extension
  matches it to the form on your own machine.
- Something leaves your browser only when you press a button that says so. "Analyse this
  offer" sends your CV and the job advert to Epimoni's server for a comparison.
- The extension never submits a form, never reads password or payment fields, and does not sell
  or share your data.

## What is stored on your computer

In your browser's extension storage (`chrome.storage.local`), never synchronised to other
devices:

- the CVs you type, import or bring over from epimoni30.com, and which one is active;
- the suggestions you dismissed, so they are not offered again;
- if you connected an Epimoni account: your name, account id and the sign-in token that lets
  the extension act for that account. The site can only offer to connect; the extension asks
  you on its own page first, showing the account's email address;
- if you ran an offer analysis without an account: a temporary session token, replaced after at
  most 31 days.

A short-lived cache of analysis results and of your remaining allowance is kept in session
storage, which your browser clears when it closes. Uninstalling the extension deletes all of it.
You can also delete a CV, or everything, from the extension's CV page.

## What is read on the web pages you visit

On the job sites listed in the Chrome Web Store entry, and on any other page only when you click
the toolbar icon, the extension reads the page's form fields and labels, to know what to put
where, and the text of the job advert, to offer an analysis. That reading happens in your
browser. Nothing from the page is sent unless you ask for an analysis.

## What is sent, and when

All requests go to Epimoni's own server (an AWS endpoint in the EU, Frankfurt region).

| When | What is sent | Why |
|---|---|---|
| You click "Analyse this offer" | your active CV, the text of the advert, a sign-in or session token | to compare the two and show a score |
| Your first analysis without an account | a request to open a session | the free allowance is counted per session and network address |
| You open the extension's menu while connected | your sign-in token | to show your remaining allowance |
| If you are connected or have run an analysis: when a supported job board shows an application form, after a fill, and when you leave that page | the site's host name; how many form fields the page has and how many were filled, accepted or dismissed; which *kinds* of field were filled (for example "email", "phone") | to find the sites where filling fails |

The usage statistics in the last row never contain what you typed, what was filled, field labels
or page content. Nothing is sent by an install that has never run an analysis or been connected
to an account.

To produce an analysis, Epimoni's server sends the CV and the advert to an AI model provider
(OpenAI) acting as a processor. They are not used to train models. Analyses run while connected
to an account are kept in that account, as on the website; see the website's policy for how
long and how to delete them.

## What the extension does not do

- It does not collect browsing history, and it does not run on pages outside the listed job
  sites unless you click its icon there.
- It does not sell data, show advertising, or pass data to anyone except as described above.
- It does not use your data for anything unrelated to filling applications and analysing offers,
  in line with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your rights

You can access, correct or delete the data held about you in the extension itself, on
epimoni30.com, or by writing to contact.epimoni30@gmail.com. Under the Swiss FADP and the GDPR
you may also object to processing and complain to a supervisory authority.

## Changes

Changes to this policy are recorded in this file's history, and a material change is noted in
the extension's changelog.

---

<a id="fr"></a>

# Politique de confidentialité d'Epimoni Autofill

*Mise à jour : 25 septembre 2026.*

Epimoni Autofill est une extension de navigateur qui remplit les formulaires de candidature à
partir d'un CV conservé dans l'extension. Cette page dit ce qu'elle enregistre, ce qu'elle envoie
et à qui. Elle ne concerne que l'extension ; le site Epimoni a
[sa propre politique](https://www.epimoni30.com/politique-de-confidentialite).

Responsable du traitement : Epimoni30, Untere Roostmatt 8, CH-6300 Zoug, Suisse
(contact.epimoni30@gmail.com).

## En bref

- Remplir un formulaire n'envoie rien. Votre CV reste dans votre navigateur, et
  l'association avec le formulaire se fait sur votre machine.
- Rien ne quitte votre navigateur tant que vous n'appuyez pas sur un bouton qui le dit.
  « Analyser cette offre » envoie votre CV et l'annonce au serveur d'Epimoni pour les comparer.
- L'extension n'envoie jamais un formulaire à votre place, ne lit ni mot de passe ni données de
  paiement, et ne vend ni ne partage vos données.

## Ce qui est enregistré sur votre ordinateur

Dans le stockage de l'extension (`chrome.storage.local`), jamais synchronisé vers d'autres
appareils :

- les CV saisis, importés ou récupérés depuis epimoni30.com, et celui qui est actif ;
- les suggestions que vous avez écartées, pour ne pas les reproposer ;
- si vous avez connecté un compte Epimoni : votre nom, l'identifiant du compte et le jeton de
  connexion qui permet à l'extension d'agir pour ce compte. Le site peut seulement proposer la
  connexion ; l'extension vous la fait d'abord confirmer sur sa propre page, en affichant
  l'adresse e-mail du compte ;
- si vous avez lancé une analyse sans compte : un jeton de session temporaire, renouvelé au plus
  tard après 31 jours.

Un cache de courte durée (résultats d'analyse, quota restant) est conservé en stockage de
session, vidé à la fermeture du navigateur. Désinstaller l'extension supprime l'ensemble. Vous
pouvez aussi supprimer un CV, ou tout, depuis la page CV de l'extension.

## Ce qui est lu sur les pages visitées

Sur les sites d'emploi indiqués dans la fiche Chrome Web Store, et sur toute autre page
uniquement quand vous cliquez sur l'icône, l'extension lit les champs et libellés du
formulaire, pour savoir quoi mettre où, et le texte de l'annonce, pour proposer une analyse.
Cette lecture se fait dans votre navigateur. Rien n'est envoyé sans demande d'analyse.

## Ce qui est envoyé, et quand

Toutes les requêtes vont au serveur d'Epimoni (un point d'accès AWS dans l'UE, région de
Francfort).

| Quand | Quoi | Pourquoi |
|---|---|---|
| Vous cliquez « Analyser cette offre » | votre CV actif, le texte de l'annonce, un jeton de connexion ou de session | comparer les deux et afficher un score |
| Première analyse sans compte | une demande d'ouverture de session | le quota gratuit est compté par session et adresse réseau |
| Vous ouvrez le menu de l'extension en étant connecté | votre jeton de connexion | afficher le quota restant |
| Si vous êtes connecté ou avez lancé une analyse : quand un site d'emploi pris en charge affiche un formulaire de candidature, après un remplissage, et quand vous quittez cette page | le nom du site ; le nombre de champs du formulaire, et combien ont été remplis, acceptés ou écartés ; les *types* de champs remplis (par exemple « e-mail », « téléphone ») | repérer les sites où le remplissage échoue |

Ces statistiques ne contiennent jamais ce que vous avez saisi, ce qui a été rempli, les libellés
ni le contenu des pages. Une installation qui n'a jamais lancé d'analyse ni été connectée à un
compte n'envoie rien.

Pour produire une analyse, le serveur d'Epimoni transmet le CV et l'annonce à un fournisseur de
modèles d'IA (OpenAI), en qualité de sous-traitant. Ils ne servent pas à entraîner de modèles.
Les analyses faites avec un compte connecté sont conservées dans ce compte, comme sur le site ;
voir la politique du site pour leur durée et leur suppression.

## Ce que l'extension ne fait pas

- Elle ne collecte pas l'historique de navigation et ne s'exécute pas hors des sites d'emploi
  indiqués, sauf si vous cliquez sur son icône.
- Elle ne vend pas de données, n'affiche pas de publicité et ne transmet rien à quiconque hors
  des cas décrits ci-dessus.
- Elle n'utilise vos données que pour remplir des candidatures et analyser des offres,
  conformément à la politique des données utilisateur du Chrome Web Store, y compris ses
  exigences d'usage limité.

## Vos droits

Vous pouvez accéder à vos données, les corriger ou les supprimer dans l'extension, sur
epimoni30.com, ou en écrivant à contact.epimoni30@gmail.com. Au titre de la LPD suisse et du
RGPD, vous pouvez aussi vous opposer à un traitement et saisir une autorité de contrôle.

## Modifications

Les modifications de cette politique sont tracées dans l'historique de ce fichier, et tout
changement important est signalé dans le journal des versions de l'extension.
