// SPDX-License-Identifier: Apache-2.0
// Italian. Phrases are lowercase and unaccented (labels are normalised before matching)
// except `dates.ongoing`, which is matched against the raw, lowercased date text.
//
// Bare "Nome" is the first name on an Italian form and the whole name on a Brazilian one
// (`pt.js`), so the two packs contest it and it is offered, never written. "Nome e cognome" and
// "Cognome" are not in doubt and fill. Because `given_name` now holds "nome", it also carries
// the Portuguese pack's vetoes for that word ("nome social", "nome da empresa").
//
// Packs are merged, so every `not` here applies to every language. Words that are ordinary in
// another language are kept out of the vetoes and of `any`: no bare "via" for the street
// ("Applied via LinkedIn"), no "al" for an end date (Spanish), no articles in `captionFiller`.
//
// Italian forms also ask for things no other pack meets: a certified e-mail address (PEC), a
// codice fiscale, a birthplace. None of them is in a CV, and the vetoes below keep the
// candidate's own email and city out of them.
//
// The shape of a pack is documented in `_template.js`; every key must exist in
// `src/schema/fields.js`, which the build checks.

export default {
  lang: 'it',
  thirdParty: [
    'emergenza',
    'selezionatore',
    'selezionatrice',
    'referente',
    'figlio',
    'figli',
    'coniuge',
    'padre',
    'madre',
    'genitore',
    'amico',
    'collega',
    'tutore',
  ],
  // Articles are left out: the Polish "i" is "and", and stripping it would break a heading
  // such as "Kursy i szkolenia".
  captionFiller: ['tuo', 'tua', 'tuoi', 'tue', 'facoltativo', 'opzionale', 'obbligatorio'],
  dates: {
    months: {
      gen: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      mag: 5,
      giu: 6,
      lug: 7,
      ago: 8,
      set: 9,
      ott: 10,
      nov: 11,
      dic: 12,
    },
    ongoing: ['in corso', 'attuale', 'oggi', 'ad oggi'],
  },
  sections: {
    work: {
      any: [
        'esperienza',
        'esperienze',
        'esperienza professionale',
        'esperienze professionali',
        'esperienza lavorativa',
        'esperienze lavorative',
      ],
    },
    volunteer: {
      any: ['volontariato', 'esperienze di volontariato'],
    },
    education: {
      any: ['istruzione', 'formazione', 'istruzione e formazione', 'titoli di studio', 'percorso di studi'],
    },
    certificates: {
      any: ['certificazioni', 'certificati'],
    },
    awards: {
      any: ['premi', 'riconoscimenti', 'premi e riconoscimenti'],
    },
    publications: {
      any: ['pubblicazioni'],
    },
    skills: {
      any: ['competenze', 'competenze tecniche'],
    },
    languages: {
      any: ['lingue', 'lingue straniere', 'conoscenze linguistiche', 'competenze linguistiche'],
    },
    interests: {
      any: ['interessi', 'hobby'],
    },
    references: {
      any: ['referenze'],
    },
    projects: {
      any: ['progetti'],
    },
  },
  // On a page that says it is in Italian, bare "nome" is the first name (Portuguese reads it
  // as the whole name; see `ties` in src/content/resolve.js).
  ties: { nome: 'given_name' },
  keys: {
    given_name: {
      any: ['nome', 'nome proprio'],
      not: [
        'nome e cognome',
        'cognome e nome',
        'nome completo',
        'azienda',
        'societa',
        'utente',
        'nome file',
        'nome del file',
        'scuola',
        'universita',
        'istituto',
        'ente',
        'corso',
        'progetto',
        'certificazione',
        'referenza',
        // Bare "nome" is a Portuguese word too, so the Portuguese pack's vetoes for its own
        // "nome" apply here as well: "nome social", "nome da empresa" are not a first name.
        'nome social',
        'nome fantasia',
        'empresa',
        'usuario',
        'arquivo',
        'cargo',
        'vaga',
        'escola',
        'universidade',
        'faculdade',
        'instituicao',
        'curso',
        'projeto',
        'referencia',
        'contato',
        'anos',
      ],
    },
    family_name: {
      any: ['cognome'],
      not: ['nome e cognome', 'cognome e nome', 'nome completo', 'nascita'],
    },
    full_name: {
      any: ['nome e cognome', 'cognome e nome', 'nome completo'],
      not: [
        'azienda',
        'societa',
        'utente',
        'nome file',
        'nome del file',
        'scuola',
        'universita',
        'istituto',
        'ente',
        'corso',
        'progetto',
        'referenza',
        'contatto',
      ],
    },
    email: {
      any: ['e mail', 'email', 'indirizzo email', 'indirizzo e mail', 'posta elettronica'],
      // PEC is a certified address the candidate may not have, and never the one on a CV.
      not: ['conferma', 'ripeti', 'ripetere', 'pec', 'certificata', 'azienda'],
    },
    email_confirm: {
      any: ['conferma email', 'conferma e mail', 'conferma indirizzo email', 'ripeti email', 'ripeti e mail'],
      not: ['pec'],
    },
    phone: {
      any: ['telefono', 'cellulare', 'numero di telefono', 'recapito telefonico', 'numero di cellulare'],
      not: ['azienda', 'emergenza', 'fisso aziendale'],
    },
    street: {
      // Not a bare "via" ("Applied via LinkedIn") nor "residenza", which "Città di residenza"
      // and "Paese di residenza" also hold.
      any: ['indirizzo', 'via e numero civico', 'indirizzo di residenza'],
      not: ['email', 'e mail', 'pec', 'web', 'url', 'sito', 'linkedin', 'ip', 'domicilio fiscale'],
    },
    postal_code: {
      any: ['cap', 'c a p', 'codice postale', 'codice di avviamento postale'],
      // In French a CAP is a diploma: "Spécialité du CAP", "Intitulé du CAP ou BEP".
      not: [
        'bep',
        'bac',
        'diplome',
        'specialite',
        'intitule',
        'titulaire',
        'niveau',
        'formation',
        'certificat',
        'metier',
        'option',
        'obtenu',
        'du cap',
        'de cap',
      ],
    },
    city: {
      any: ['citta', 'comune', 'citta di residenza', 'comune di residenza', 'localita'],
      not: ['nascita', 'azienda', 'scuola', 'universita', 'sede'],
    },
    country: {
      any: ['paese', 'nazione', 'paese di residenza', 'stato di residenza'],
      not: ['nascita', 'nazionalita', 'cittadinanza'],
    },
    linkedin_url: {
      any: ['linkedin', 'profilo linkedin', 'url linkedin'],
      not: [],
    },
    github_url: {
      any: ['github', 'gitlab'],
      not: [],
    },
    portfolio_url: {
      any: ['portfolio', 'sito personale', 'sito web personale', 'il tuo sito'],
      not: ['azienda', 'linkedin', 'github'],
    },
    current_title: {
      any: ['posizione attuale', 'ruolo attuale', 'qualifica attuale', 'mansione attuale'],
      not: ['desiderata', 'desiderato', 'ricercata', 'ricercato'],
    },
    current_employer: {
      any: ['azienda attuale', 'datore di lavoro attuale', 'attuale datore di lavoro', 'societa attuale'],
      not: ['desiderata', 'desiderato'],
    },
    summary: {
      any: ['parlaci di te', 'raccontaci di te', 'presentati', 'profilo professionale', 'chi sei'],
      not: ['lettera', 'azienda', 'linkedin', 'github', 'url', 'sito'],
    },
    cover_letter: {
      any: [
        'lettera di presentazione',
        'lettera motivazionale',
        'lettera di motivazione',
        'perche vuoi lavorare',
        'perche questa posizione',
        'perche questa azienda',
      ],
      not: ['file', 'allegato', 'allega', 'carica', 'caricare', 'curriculum', 'cv'],
    },
    years_experience: {
      any: [
        'anni di esperienza',
        'quanti anni di esperienza',
        'anni di esperienza totali',
        'esperienza totale',
      ],
      // "Anni di esperienza in vendita" asks about one domain, not the career total.
      not: ['esperienza in', 'nel', 'nella', 'con', 'come', 'nell'],
    },
    salary_expectation: {
      any: [
        'ral desiderata',
        'retribuzione desiderata',
        'aspettative economiche',
        'aspettativa salariale',
        'stipendio desiderato',
      ],
      not: ['attuale', 'offerta', 'offerto'],
    },
    notice_period: {
      any: ['preavviso', 'periodo di preavviso'],
      not: [],
    },
    availability_date: {
      any: ['disponibilita', 'data di disponibilita', 'disponibile dal', 'disponibilita a iniziare'],
      not: ['trasferte', 'trasferimento', 'orario', 'turni', 'viaggiare'],
    },
    work_authorization: {
      // Positive questions only. One asking whether the person needs a visa or sponsorship is
      // the opposite question, and the stored answer would pick its "yes".
      any: [
        'autorizzazione al lavoro',
        'permesso di lavoro',
        'autorizzato a lavorare',
        'autorizzata a lavorare',
        'diritto di lavorare',
      ],
      not: ['sponsorizzazione', 'sponsor', 'visto', 'necessiti', 'necessita', 'hai bisogno', 'avrai bisogno'],
    },
    education_degree: {
      any: ['titolo di studio', 'livello di istruzione', 'grado di istruzione'],
      not: ['scuola', 'universita', 'istituto', 'anno', 'voto'],
    },
    education_institution: {
      any: ['universita', 'ateneo', 'istituto', 'istituto di formazione'],
      not: [],
    },
    skills: {
      any: ['competenze', 'le tue competenze'],
      not: ['richieste', 'richiesta', 'obbligatorie'],
    },
    languages: {
      any: ['lingue', 'lingue parlate', 'lingue conosciute'],
      not: ['programmazione'],
    },
    language_level: {
      any: [
        'livello di inglese',
        'livello di francese',
        'livello di spagnolo',
        'livello di tedesco',
        'livello di italiano',
        'conoscenza della lingua inglese',
      ],
      not: ['lingue'],
    },
    speaks_language: {
      any: ['parli', 'parla fluentemente', 'conosci la lingua'],
      not: ['lingue'],
    },
    // A file input only. The letter, a photo, a transcript or "altri documenti" each rule it out.
    cv_file: {
      any: [
        'cv',
        'curriculum',
        'curriculum vitae',
        'carica il cv',
        'allega il cv',
        'carica il tuo cv',
        'allega curriculum',
      ],
      not: [
        'lettera',
        'foto',
        'certificato',
        'diploma',
        'altro',
        'altri',
        'aggiuntivi',
        'aggiuntivo',
        'portfolio',
        'documento di identita',
      ],
    },
    'work.position': {
      any: ['ruolo', 'posizione', 'qualifica', 'mansione', 'titolo della posizione'],
      not: ['data', 'inizio', 'fine', 'luogo', 'citta', 'descrizione', 'desiderata', 'azienda'],
    },
    'work.company': {
      any: ['azienda', 'nome azienda', 'nome dell azienda', 'datore di lavoro', 'societa'],
      not: [
        'data',
        'inizio',
        'fine',
        'luogo',
        'citta',
        'descrizione',
        'settore',
        'dimensione',
        'indirizzo',
        'telefono',
        'sito',
      ],
    },
    'work.location': {
      any: ['luogo', 'sede', 'citta', 'localita'],
      not: ['nascita', 'data'],
    },
    'work.start': {
      any: ['data di inizio', 'inizio', 'data inizio'],
      not: ['fine', 'termine'],
    },
    'work.end': {
      any: ['data di fine', 'fine', 'data fine', 'data di termine'],
      not: ['inizio'],
    },
    'work.description': {
      any: ['descrizione', 'attivita svolte', 'mansioni', 'responsabilita', 'principali attivita'],
      not: [],
    },
    'volunteer.position': {
      any: ['ruolo', 'mansione'],
      not: ['data', 'inizio', 'fine', 'luogo', 'citta', 'descrizione'],
    },
    'volunteer.organization': {
      any: ['organizzazione', 'associazione', 'ente'],
      not: ['data', 'inizio', 'fine', 'luogo', 'citta', 'descrizione'],
    },
    'volunteer.start': {
      any: ['data di inizio', 'inizio'],
      not: ['fine'],
    },
    'volunteer.end': {
      any: ['data di fine', 'fine'],
      not: ['inizio'],
    },
    'volunteer.description': {
      any: ['descrizione', 'attivita svolte'],
      not: [],
    },
    // "Corso di laurea" is the programme ("Economia aziendale"), the field of study; the
    // degree is the title ("Laurea magistrale").
    'education.degree': {
      any: ['titolo', 'titolo di studio', 'titolo conseguito', 'livello'],
      not: [
        'data',
        'inizio',
        'fine',
        'luogo',
        'citta',
        'descrizione',
        'istituto',
        'universita',
        'scuola',
        'anno',
        'voto',
        'corso',
      ],
    },
    'education.field': {
      any: ['corso di laurea', 'corso di studi', 'indirizzo di studio', 'disciplina', 'facolta'],
      not: ['data', 'inizio', 'fine', 'livello', 'titolo'],
    },
    'education.institution': {
      any: ['istituto', 'universita', 'ateneo', 'scuola', 'nome dell istituto'],
      not: ['data', 'inizio', 'fine', 'citta', 'indirizzo'],
    },
    'education.start': {
      any: ['data di inizio', 'inizio', 'anno di inizio'],
      not: ['fine', 'conseguimento'],
    },
    'education.end': {
      any: ['data di fine', 'fine', 'data di conseguimento', 'anno di conseguimento'],
      not: ['inizio'],
    },
    'education.score': {
      any: ['voto', 'voto di laurea', 'votazione'],
      not: [],
    },
    'education.details': {
      any: ['descrizione', 'dettagli', 'tesi'],
      not: [],
    },
    'certificates.name': {
      any: ['certificazione', 'certificato', 'nome della certificazione'],
      not: ['data', 'rilasciato', 'rilasciata', 'ente', 'link', 'url'],
    },
    'certificates.issuer': {
      any: ['ente certificatore', 'rilasciato da', 'rilasciata da', 'ente'],
      not: ['data'],
    },
    'certificates.date': {
      any: ['data', 'data di rilascio', 'data di conseguimento', 'anno'],
      not: ['scadenza', 'validita'],
    },
    'certificates.url': {
      any: ['link', 'url'],
      not: [],
    },
    'awards.title': {
      any: ['premio', 'riconoscimento'],
      not: ['data', 'conferito', 'assegnato'],
    },
    'awards.awarder': {
      any: ['conferito da', 'assegnato da'],
      not: [],
    },
    'awards.date': {
      any: ['data', 'anno'],
      not: [],
    },
    'awards.description': {
      any: ['descrizione'],
      not: [],
    },
    'publications.name': {
      any: ['titolo'],
      not: ['data', 'editore', 'rivista'],
    },
    'publications.publisher': {
      any: ['editore', 'rivista', 'pubblicato su'],
      not: [],
    },
    'publications.date': {
      any: ['data', 'data di pubblicazione', 'anno'],
      not: [],
    },
    'publications.url': {
      any: ['link', 'url'],
      not: [],
    },
    'publications.description': {
      any: ['abstract', 'descrizione'],
      not: [],
    },
    'skills.name': {
      any: ['competenza'],
      not: ['livello'],
    },
    'skills.level': {
      any: ['livello'],
      not: [],
    },
    'skills.keywords': {
      any: ['parole chiave', 'strumenti'],
      not: [],
    },
    'languages.language': {
      any: ['lingua'],
      not: ['livello', 'conoscenza'],
    },
    'languages.fluency': {
      any: ['livello', 'livello di conoscenza', 'conoscenza'],
      not: [],
    },
    'interests.name': {
      any: ['interesse'],
      not: [],
    },
    'interests.keywords': {
      any: ['dettagli', 'parole chiave'],
      not: [],
    },
    'references.name': {
      any: ['nome e cognome', 'nome del referente'],
      not: ['azienda'],
    },
    'references.reference': {
      any: ['referenza'],
      not: [],
    },
    'projects.name': {
      any: ['progetto', 'nome del progetto'],
      not: ['data', 'inizio', 'fine', 'luogo', 'citta', 'descrizione'],
    },
    'projects.description': {
      any: ['descrizione', 'dettagli'],
      not: [],
    },
    'projects.start': {
      any: ['data di inizio', 'inizio'],
      not: ['fine'],
    },
    'projects.end': {
      any: ['data di fine', 'fine'],
      not: ['inizio'],
    },
    'projects.url': {
      any: ['link', 'url'],
      not: [],
    },
  },
};
