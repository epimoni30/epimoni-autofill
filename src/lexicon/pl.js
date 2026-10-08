// SPDX-License-Identifier: Apache-2.0
// Polish. Phrases are lowercase and unaccented (labels are normalised before matching, and
// `ł`, which Unicode does not decompose, becomes `l` there) except `dates`, which are matched
// against the raw, lowercased date text as well as the normalised option labels.
//
// Polish forms say "Imię i nazwisko" for the full name, so bare `imie` and `nazwisko` must
// yield to it, and older forms still ask for "imię ojca" / "imię matki" (the parents'
// names), which are never the candidate's and are ruled out through `thirdParty`. Date
// labels are often a bare "Od" / "Do": `do` is also English ("Do you…") and Portuguese, so
// only the longer phrasings are listed here.
//
// The shape of a pack is documented in `_template.js`; every key must exist in
// `src/schema/fields.js`, which the build checks.

export default {
  lang: 'pl',
  thirdParty: [
    'awaryjny',
    'awaryjnego',
    'naglych',
    'rekrutera',
    'rekruterki',
    'dziecka',
    'dzieci',
    'malzonka',
    'malzonki',
    'ojca',
    'matki',
    'polecajacej',
    'polecajacego',
    'opiekuna',
  ],
  captionFiller: ['twoje', 'twoja', 'twoj', 'moje', 'moja', 'moj', 'opcjonalnie', 'wymagane', 'nr'],
  dates: {
    // The standard abbreviations, which are also the prefixes of both the nominative
    // ("październik") and genitive ("października") forms. `paź` is for the raw date text,
    // `paz` for an option label once normalised.
    months: {
      sty: 1,
      lut: 2,
      mar: 3,
      kwi: 4,
      maj: 5,
      cze: 6,
      lip: 7,
      sie: 8,
      wrz: 9,
      paz: 10,
      paź: 10,
      lis: 11,
      gru: 12,
    },
    ongoing: ['obecnie', 'obecnej', 'nadal', 'aktualnie', 'do teraz'],
  },
  sections: {
    work: {
      any: [
        'doswiadczenie',
        'doswiadczenie zawodowe',
        'przebieg kariery',
        'przebieg pracy zawodowej',
        'historia zatrudnienia',
      ],
    },
    volunteer: {
      any: ['wolontariat'],
    },
    education: {
      any: ['wyksztalcenie', 'edukacja'],
    },
    certificates: {
      any: ['certyfikaty', 'certyfikaty i szkolenia', 'kursy i szkolenia', 'szkolenia'],
    },
    awards: {
      any: ['nagrody', 'wyroznienia', 'nagrody i wyroznienia'],
    },
    publications: {
      any: ['publikacje'],
    },
    skills: {
      any: ['umiejetnosci', 'kompetencje'],
    },
    languages: {
      any: ['jezyki', 'jezyki obce', 'znajomosc jezykow'],
    },
    interests: {
      any: ['zainteresowania'],
    },
    references: {
      any: ['referencje'],
    },
    projects: {
      any: ['projekty'],
    },
  },
  keys: {
    given_name: {
      any: ['imie', 'twoje imie'],
      // "Imię i nazwisko" is the full name, and "drugie imię" a middle name.
      not: ['nazwisko', 'drugie'],
    },
    family_name: {
      any: ['nazwisko', 'twoje nazwisko'],
      not: ['imie', 'imiona', 'rodowe', 'panienskie', 'firmy', 'uczelni', 'szkoly'],
    },
    full_name: {
      any: ['imie i nazwisko', 'imiona i nazwisko', 'twoje imie i nazwisko'],
      not: ['firmy', 'uzytkownika', 'pliku', 'osoby kontaktowej', 'rodowe'],
    },
    email: {
      any: ['e mail', 'email', 'adres e mail', 'adres email', 'poczta elektroniczna'],
      not: ['potwierdz', 'potwierdzenie', 'powtorz', 'firmy'],
    },
    email_confirm: {
      any: [
        'potwierdz e mail',
        'potwierdz email',
        'potwierdz adres e mail',
        'powtorz e mail',
        'powtorz adres e mail',
        'potwierdzenie adresu e mail',
      ],
      not: [],
    },
    phone: {
      any: ['telefon', 'numer telefonu', 'nr telefonu', 'telefon komorkowy', 'telefon kontaktowy'],
      not: ['firmy', 'sluzbowy', 'stacjonarny'],
    },
    street: {
      any: ['adres', 'ulica', 'ulica i numer', 'adres zamieszkania'],
      not: ['e mail', 'email', 'www', 'strony', 'url', 'linkedin', 'ip', 'firmy', 'korespondencyjny'],
    },
    postal_code: {
      any: ['kod pocztowy'],
      not: [],
    },
    city: {
      any: ['miasto', 'miejscowosc', 'miejsce zamieszkania'],
      not: ['urodzenia', 'pracy', 'firmy', 'uczelni', 'szkoly'],
    },
    country: {
      any: ['kraj', 'kraj zamieszkania'],
      not: ['urodzenia', 'obywatelstwo'],
    },
    linkedin_url: {
      any: ['linkedin', 'profil linkedin', 'link do profilu linkedin'],
      not: [],
    },
    github_url: {
      any: ['github', 'gitlab'],
      not: [],
    },
    portfolio_url: {
      any: ['portfolio', 'strona internetowa', 'strona www', 'twoja strona', 'strona osobista'],
      not: ['firmy', 'linkedin', 'github', 'oferty'],
    },
    current_title: {
      any: ['obecne stanowisko', 'aktualne stanowisko', 'obecna pozycja'],
      not: ['docelowe', 'oczekiwane', 'pozadane'],
    },
    current_employer: {
      any: ['obecny pracodawca', 'aktualny pracodawca', 'obecna firma', 'ostatni pracodawca'],
      not: [],
    },
    summary: {
      any: ['o mnie', 'o sobie', 'napisz cos o sobie', 'podsumowanie zawodowe', 'profil zawodowy'],
      not: ['list', 'firmy', 'oferty', 'linkedin', 'github', 'url', 'www'],
    },
    cover_letter: {
      any: [
        'list motywacyjny',
        'motywacja',
        'dlaczego chcesz u nas pracowac',
        'dlaczego ta oferta',
        'wiadomosc do rekrutera',
      ],
      not: ['plik', 'zalacz', 'zalacznik', 'dodaj plik', 'przeslij', 'cv', 'zyciorys'],
    },
    years_experience: {
      any: ['lata doswiadczenia', 'liczba lat doswiadczenia', 'ile lat doswiadczenia', 'staz pracy'],
      not: [],
    },
    salary_expectation: {
      any: [
        'oczekiwania finansowe',
        'oczekiwania placowe',
        'oczekiwane wynagrodzenie',
        'oczekiwania wynagrodzenia',
        'oczekiwania dotyczace wynagrodzenia',
      ],
      not: ['obecne', 'aktualne', 'widelki'],
    },
    notice_period: {
      any: ['okres wypowiedzenia'],
      not: [],
    },
    availability_date: {
      any: [
        'dostepnosc',
        'termin rozpoczecia pracy',
        'data rozpoczecia pracy',
        'od kiedy mozesz zaczac',
        'gotowosc do podjecia pracy',
      ],
      not: ['podrozy', 'delegacji', 'przeprowadzki', 'godziny'],
    },
    work_authorization: {
      any: ['pozwolenie na prace', 'zezwolenie na prace', 'prawo do pracy'],
      not: [],
    },
    education_degree: {
      any: ['wyksztalcenie', 'poziom wyksztalcenia', 'tytul zawodowy', 'stopien naukowy'],
      not: ['uczelnia', 'szkola', 'kierunek', 'rok'],
    },
    education_institution: {
      any: ['uczelnia', 'szkola', 'nazwa uczelni', 'nazwa szkoly', 'szkola wyzsza'],
      not: [],
    },
    skills: {
      any: ['umiejetnosci', 'kompetencje', 'twoje umiejetnosci'],
      not: ['wymagane'],
    },
    languages: {
      any: ['jezyki', 'jezyki obce', 'znajomosc jezykow'],
      not: ['programowania'],
    },
    // A file input only. The letter, a photo, a diploma or "inne dokumenty" each rule it out.
    cv_file: {
      any: ['cv', 'zyciorys', 'twoje cv', 'zalacz cv', 'dodaj cv', 'przeslij cv', 'wgraj cv'],
      not: [
        'list',
        'motywacyjny',
        'zdjecie',
        'dyplom',
        'swiadectwo',
        'certyfikat',
        'inne',
        'dodatkowe',
        'portfolio',
      ],
    },
    'work.position': {
      any: ['stanowisko', 'nazwa stanowiska'],
      not: ['data', 'miejsce', 'miasto', 'opis', 'oczekiwane', 'firma', 'firmy'],
    },
    'work.company': {
      any: ['firma', 'nazwa firmy', 'pracodawca', 'nazwa pracodawcy'],
      not: ['data', 'miejsce', 'miasto', 'opis', 'branza', 'adres', 'telefon', 'strona'],
    },
    'work.location': {
      any: ['miejsce', 'lokalizacja', 'miasto', 'miejscowosc'],
      not: ['urodzenia', 'data'],
    },
    'work.start': {
      any: ['data rozpoczecia', 'rozpoczecie', 'data od', 'okres od', 'od kiedy', 'poczatek'],
      not: ['zakonczenia', 'zakonczenie', 'koniec'],
    },
    'work.end': {
      any: ['data zakonczenia', 'zakonczenie', 'data do', 'okres do', 'do kiedy', 'koniec'],
      not: ['rozpoczecia', 'rozpoczecie', 'poczatek'],
    },
    'work.description': {
      any: ['opis', 'opis stanowiska', 'obowiazki', 'zakres obowiazkow', 'osiagniecia'],
      not: [],
    },
    'volunteer.position': {
      any: ['funkcja', 'rola', 'stanowisko'],
      not: ['data', 'miejsce', 'miasto', 'opis'],
    },
    'volunteer.organization': {
      any: ['organizacja', 'nazwa organizacji', 'fundacja', 'stowarzyszenie'],
      not: ['data', 'miejsce', 'miasto', 'opis'],
    },
    'volunteer.start': {
      any: ['data rozpoczecia', 'rozpoczecie', 'data od'],
      not: ['zakonczenia', 'zakonczenie'],
    },
    'volunteer.end': {
      any: ['data zakonczenia', 'zakonczenie', 'data do'],
      not: ['rozpoczecia', 'rozpoczecie'],
    },
    'volunteer.description': {
      any: ['opis', 'zakres dzialan'],
      not: [],
    },
    // "Kierunek" is the field of study ("Zarządzanie"); the degree is the level ("licencjat",
    // "magister", "inżynier").
    'education.degree': {
      any: ['stopien', 'tytul', 'tytul zawodowy', 'poziom wyksztalcenia', 'uzyskany tytul'],
      not: ['data', 'miejsce', 'miasto', 'opis', 'uczelnia', 'uczelni', 'szkola', 'rok', 'kierunek', 'ocena'],
    },
    'education.field': {
      any: ['kierunek', 'kierunek studiow', 'specjalizacja', 'specjalnosc'],
      not: ['data', 'poziom'],
    },
    'education.institution': {
      any: ['uczelnia', 'nazwa uczelni', 'szkola', 'nazwa szkoly', 'szkola wyzsza'],
      not: ['data', 'miasto', 'adres'],
    },
    'education.start': {
      any: ['data rozpoczecia', 'rozpoczecie', 'rok rozpoczecia', 'data od'],
      not: ['zakonczenia', 'zakonczenie', 'ukonczenia'],
    },
    'education.end': {
      any: ['data zakonczenia', 'zakonczenie', 'data ukonczenia', 'rok ukonczenia', 'ukonczenie', 'data do'],
      not: ['rozpoczecia', 'rozpoczecie'],
    },
    'education.score': {
      any: ['ocena', 'ocena koncowa', 'srednia', 'srednia ocen'],
      not: [],
    },
    'education.details': {
      any: ['opis', 'szczegoly', 'przedmioty'],
      not: [],
    },
    'certificates.name': {
      any: ['certyfikat', 'nazwa certyfikatu', 'szkolenie', 'nazwa szkolenia', 'nazwa'],
      not: ['data', 'wystawca', 'wydany', 'wydal', 'organizator', 'link', 'url'],
    },
    'certificates.issuer': {
      any: ['wystawca', 'wydany przez', 'organizator', 'instytucja'],
      not: ['data'],
    },
    'certificates.date': {
      any: ['data', 'data wydania', 'data uzyskania', 'rok'],
      not: ['waznosci', 'wygasniecia'],
    },
    'certificates.url': {
      any: ['link', 'url'],
      not: [],
    },
    'awards.title': {
      any: ['nagroda', 'wyroznienie', 'tytul', 'nazwa'],
      not: ['data', 'przyznana', 'przyznane', 'instytucja'],
    },
    'awards.awarder': {
      any: ['przyznana przez', 'przyznane przez', 'instytucja'],
      not: [],
    },
    'awards.date': {
      any: ['data', 'rok'],
      not: [],
    },
    'awards.description': {
      any: ['opis'],
      not: [],
    },
    'publications.name': {
      any: ['tytul', 'nazwa'],
      not: ['data', 'wydawca', 'czasopismo'],
    },
    'publications.publisher': {
      any: ['wydawca', 'czasopismo', 'opublikowano w'],
      not: [],
    },
    'publications.date': {
      any: ['data', 'data publikacji', 'rok'],
      not: [],
    },
    'publications.url': {
      any: ['link', 'url'],
      not: [],
    },
    'publications.description': {
      any: ['streszczenie', 'opis'],
      not: [],
    },
    'skills.name': {
      any: ['umiejetnosc', 'kompetencja'],
      not: ['poziom', 'stopien'],
    },
    'skills.level': {
      any: ['poziom', 'stopien zaawansowania'],
      not: [],
    },
    'skills.keywords': {
      any: ['slowa kluczowe', 'narzedzia'],
      not: [],
    },
    'languages.language': {
      any: ['jezyk'],
      not: ['poziom', 'stopien', 'znajomosci'],
    },
    'languages.fluency': {
      any: ['poziom', 'poziom znajomosci', 'stopien znajomosci', 'stopien zaawansowania'],
      not: [],
    },
    'interests.name': {
      any: ['zainteresowanie', 'hobby'],
      not: [],
    },
    'interests.keywords': {
      any: ['szczegoly', 'slowa kluczowe'],
      not: [],
    },
    'references.name': {
      any: ['imie i nazwisko', 'osoba polecajaca'],
      not: ['firma', 'firmy'],
    },
    'references.reference': {
      any: ['referencja', 'referencje', 'rekomendacja', 'opinia'],
      not: [],
    },
    'projects.name': {
      any: ['projekt', 'nazwa projektu', 'tytul'],
      not: ['data', 'miejsce', 'miasto', 'opis'],
    },
    'projects.description': {
      any: ['opis', 'szczegoly'],
      not: [],
    },
    'projects.start': {
      any: ['data rozpoczecia', 'rozpoczecie', 'data od'],
      not: ['zakonczenia', 'zakonczenie'],
    },
    'projects.end': {
      any: ['data zakonczenia', 'zakonczenie', 'data do'],
      not: ['rozpoczecia', 'rozpoczecie'],
    },
    'projects.url': {
      any: ['link', 'url'],
      not: [],
    },
  },
};
