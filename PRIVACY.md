# Epimoni Autofill privacy policy

*Last updated: 2 October 2026. [Version française plus bas.](#fr)*

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
  offer" sends your CV and the job advert to Epimoni's server for a comparison; the cover letter,
  the CV tailored to a job and the import of an existing CV work the same way.
- The extension never submits a form, never reads password or payment fields, and does not sell
  or share your data.

## What is stored on your computer

In your browser's extension storage (`chrome.storage.local`), never synchronised to other
devices:

- the CVs you type, import or bring over from epimoni30.com, and which one is active;
- the suggestions you dismissed, so they are not offered again;
- the list of applications the extension filled, and the ones you add by hand (the page's
  address, the job title and company when the page shows them or you type them, the dates, the
  status and any note you add), which you can export or delete from the extension's "My
  applications" page;
- the sites where you turned on automatic filling;
- if you connected an Epimoni account: your name, account id and the sign-in token that lets
  the extension act for that account. The site can only offer to connect; the extension asks
  you on its own page first, showing the account's email address;

If you attach a PDF to a CV, it is kept in the extension's own database in your browser
(IndexedDB), also never synchronised, and deleted with that CV. If you have not, the extension
makes a PDF from the CV itself, on your computer, whenever a form asks for one; that file is
not stored.

A short-lived cache of analysis results and of your remaining allowance is kept in session
storage, which your browser clears when it closes. Uninstalling the extension deletes all of it.
You can also delete a CV, or everything, from the extension's CV page.

## What is read on the web pages you visit

On the job sites listed in the Chrome Web Store entry, on the sites where you turned on automatic
filling, and on any other page only when you click the toolbar icon, the extension reads the
page's form fields and labels, to know what to put
where, and the text of the job advert, to offer an analysis. That reading happens in your
browser. Nothing from the page is sent unless you ask for an analysis.

If you turn on the "Fill with Epimoni" button for every site, your browser asks you for access
to all sites. On each page a small script then only checks whether there is an application
form, to show the button; it reads nothing else, sends nothing, and fills nothing until you
click. You can turn it off from the extension's Sites page.

Automatic filling is off everywhere until you turn it on for a site, from the extension's menu
on that site. Outside the listed job sites, your browser then asks you to allow the extension on
that one site, and turning it off hands that access back.

When you fill a form that has a CV upload, the extension puts your CV's PDF in it (the one you
attached, or the one made from your CV), as if you had picked it yourself. The page can then read
it, and it reaches the employer when you submit the form. Other uploads (a cover letter, a
photo, "other documents") are left empty.

## What is sent, and when

All requests go to Epimoni's own server (an AWS endpoint in the EU, Frankfurt region).

| When | What is sent | Why |
|---|---|---|
| You click "Analyse this offer" | your active CV, the text of the advert, a sign-in or session token | to compare the two and show a score |
| You click "Write my letter with AI" | your active CV, the text of the advert, the form's character limit, a sign-in or session token | to write a cover letter, which is shown to you and goes into the form only if you click to insert it |
| You click "Tailor my CV with AI" | your CV, the text of the advert, a sign-in token | to propose changes to your CV for that job, which you review; only the ones you keep make a new CV, and your original is not changed |
| You click "Create the CV with AI" on the extension's CV page | the text of your CV, read from your PDF on your computer or pasted, after you have seen it; a sign-in token | to sort it into the sections of a CV, copied as written. Nothing is stored on the server |
| You open the extension's menu while connected | your sign-in token | to show your remaining allowance |
| If you are connected or have run an analysis: when a supported job board shows an application form, after a fill, and when you leave that page | the site's host name; how many form fields the page has and how many were filled, accepted or dismissed; which *kinds* of field were filled (for example "email", "phone") | to find the sites where filling fails |

Reading a PDF to import it, saving a cover letter as a PDF, and the application board all happen
on your computer and send nothing.

The usage statistics in the last row never contain what you typed, what was filled, field labels
or page content. Nothing is sent by an install that has never run an analysis or been connected
to an account.

To produce an analysis, Epimoni's server sends the CV and the advert to an AI model provider
(OpenAI) acting as a processor. They are not used to train models. Analyses run while connected
to an account are kept in that account, as on the website; see the website's policy for how
long and how to delete them.

## On Firefox

Firefox keeps its own record of what an add-on may send, and the extension follows it. Your CV
and the advert are sent for an analysis or a letter only once you have allowed it in the
browser's prompt, which appears when you accept an account connection, or when you click
"Allow sending" in the extension. Usage statistics are not sent on Firefox. You can withdraw
your permission in Firefox's add-on settings.

## What the extension does not do

- It does not collect browsing history, and it does not run on pages outside the listed job
  sites unless you click its icon there or turned on automatic filling for that site.
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

*Mise à jour : 2 octobre 2026.*

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
  « Analyser cette offre » envoie votre CV et l'annonce au serveur d'Epimoni pour les comparer ;
  la lettre de motivation, le CV adapté à une offre et l'import d'un CV existant fonctionnent de
  la même façon.
- L'extension n'envoie jamais un formulaire à votre place, ne lit ni mot de passe ni données de
  paiement, et ne vend ni ne partage vos données.

## Ce qui est enregistré sur votre ordinateur

Dans le stockage de l'extension (`chrome.storage.local`), jamais synchronisé vers d'autres
appareils :

- les CV saisis, importés ou récupérés depuis epimoni30.com, et celui qui est actif ;
- les suggestions que vous avez écartées, pour ne pas les reproposer ;
- la liste des candidatures remplies par l'extension, et de celles que vous ajoutez à la main
  (l'adresse de la page, l'intitulé du poste et l'entreprise quand la page les affiche ou que
  vous les saisissez, les dates, le statut et vos notes), que vous pouvez exporter ou supprimer
  depuis la page « Mes candidatures » de l'extension ;
- les sites sur lesquels vous avez activé le remplissage automatique ;
- si vous avez connecté un compte Epimoni : votre nom, l'identifiant du compte et le jeton de
  connexion qui permet à l'extension d'agir pour ce compte. Le site peut seulement proposer la
  connexion ; l'extension vous la fait d'abord confirmer sur sa propre page, en affichant
  l'adresse e-mail du compte ;

Si vous joignez un PDF à un CV, il est conservé dans la base de données propre à l'extension,
dans votre navigateur (IndexedDB), lui aussi jamais synchronisé, et supprimé avec ce CV. Sinon,
l'extension crée un PDF à partir du CV, sur votre ordinateur, quand un formulaire en demande
un ; ce fichier n'est pas conservé.

Un cache de courte durée (résultats d'analyse, quota restant) est conservé en stockage de
session, vidé à la fermeture du navigateur. Désinstaller l'extension supprime l'ensemble. Vous
pouvez aussi supprimer un CV, ou tout, depuis la page CV de l'extension.

## Ce qui est lu sur les pages visitées

Sur les sites d'emploi indiqués dans la fiche Chrome Web Store, sur les sites où vous avez activé
le remplissage automatique, et sur toute autre page uniquement quand vous cliquez sur l'icône, l'extension lit les champs et libellés du
formulaire, pour savoir quoi mettre où, et le texte de l'annonce, pour proposer une analyse.
Cette lecture se fait dans votre navigateur. Rien n'est envoyé sans demande d'analyse.

Si vous activez le bouton « Remplir avec Epimoni » sur tous les sites, votre navigateur vous
demande l'accès à tous les sites. Sur chaque page, un petit script vérifie alors seulement s'il
y a un formulaire de candidature, pour afficher le bouton ; il ne lit rien d'autre, n'envoie
rien et ne remplit rien avant votre clic. Vous pouvez le désactiver depuis la page Sites de
l'extension.

Le remplissage automatique est désactivé partout tant que vous ne l'activez pas pour un site,
depuis le menu de l'extension sur ce site. Hors des sites d'emploi indiqués, votre navigateur
vous demande alors d'autoriser l'extension sur ce seul site, et le désactiver lui retire cet
accès.

Quand vous remplissez un formulaire qui demande un CV, l'extension dépose le PDF de votre CV
dans le champ (celui que vous avez joint, ou celui créé à partir de votre CV), comme si vous
l'aviez choisi vous-même. La page peut
alors le lire, et il parvient à l'employeur quand vous envoyez le formulaire. Les autres pièces
(lettre de motivation, photo, « autres documents ») restent vides.

## Ce qui est envoyé, et quand

Toutes les requêtes vont au serveur d'Epimoni (un point d'accès AWS dans l'UE, région de
Francfort).

| Quand | Quoi | Pourquoi |
|---|---|---|
| Vous cliquez « Analyser cette offre » | votre CV actif, le texte de l'annonce, un jeton de connexion ou de session | comparer les deux et afficher un score |
| Vous cliquez « Rédiger ma lettre avec l'IA » | votre CV actif, le texte de l'annonce, la limite de caractères du formulaire, un jeton de connexion ou de session | rédiger une lettre de motivation, qui vous est montrée et n'entre dans le formulaire que si vous cliquez pour l'insérer |
| Vous cliquez « Adapter mon CV avec l'IA » | votre CV, le texte de l'annonce, un jeton de connexion | proposer des modifications de votre CV pour ce poste, que vous relisez ; seules celles que vous gardez forment un nouveau CV, et l'original n'est pas modifié |
| Vous cliquez « Créer le CV avec l'IA » sur la page CV de l'extension | le texte de votre CV, lu dans votre PDF sur votre ordinateur ou collé, après que vous l'avez vu ; un jeton de connexion | le ranger dans les rubriques d'un CV, recopié tel quel. Rien n'est conservé sur le serveur |
| Vous ouvrez le menu de l'extension en étant connecté | votre jeton de connexion | afficher le quota restant |
| Si vous êtes connecté ou avez lancé une analyse : quand un site d'emploi pris en charge affiche un formulaire de candidature, après un remplissage, et quand vous quittez cette page | le nom du site ; le nombre de champs du formulaire, et combien ont été remplis, acceptés ou écartés ; les *types* de champs remplis (par exemple « e-mail », « téléphone ») | repérer les sites où le remplissage échoue |

La lecture d'un PDF à importer, l'enregistrement d'une lettre en PDF et le tableau des
candidatures se font sur votre ordinateur et n'envoient rien.

Ces statistiques ne contiennent jamais ce que vous avez saisi, ce qui a été rempli, les libellés
ni le contenu des pages. Une installation qui n'a jamais lancé d'analyse ni été connectée à un
compte n'envoie rien.

Pour produire une analyse, le serveur d'Epimoni transmet le CV et l'annonce à un fournisseur de
modèles d'IA (OpenAI), en qualité de sous-traitant. Ils ne servent pas à entraîner de modèles.
Les analyses faites avec un compte connecté sont conservées dans ce compte, comme sur le site ;
voir la politique du site pour leur durée et leur suppression.

## Sur Firefox

Firefox tient son propre registre de ce qu'une extension peut envoyer, et l'extension s'y
conforme. Votre CV et l'annonce ne sont envoyés pour une analyse ou une lettre qu'après votre
accord dans la fenêtre du navigateur, qui apparaît quand vous acceptez la connexion d'un compte,
ou quand vous cliquez sur « Autoriser l'envoi » dans l'extension. Les statistiques
d'utilisation ne sont pas envoyées sur Firefox. Vous pouvez retirer votre accord dans les
réglages des modules de Firefox.

## Ce que l'extension ne fait pas

- Elle ne collecte pas l'historique de navigation et ne s'exécute pas hors des sites d'emploi
  indiqués, sauf si vous cliquez sur son icône ou avez activé le remplissage automatique sur ce
  site.
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
