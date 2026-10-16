// SPDX-License-Identifier: Apache-2.0
// Where a work authorisation answer holds.
//
// The answer is free text the person typed once ("Oui, ressortissant UE", "EU citizen",
// "Sim, cidadão brasileiro"), and the questions name a country: "Are you legally authorised to
// work in France?" is answered by it, "…in the United States?" is not. Filling "Oui" there tells
// an employer something false, in an application that can't be taken back. So before the
// answer goes into a question that names a country, `workRightCovers` checks that the answer
// covers that country.
//
// Words are matched whole, on normalised text (lowercase, no accents), the same form the
// language packs use. Each country lists its names and the adjectives a person would use for
// their nationality, in the five interface languages, separated by `|`.
//
// The limit, stated plainly: a country this table doesn't list is not recognised in a question
// either, so such a question reads as naming no country and is answered. The table holds the
// EU and EEA, Switzerland, and the countries people using those five languages most often
// apply to. Adding a country is one line.

/** `[code, free movement with the EU (EU, EEA, Switzerland), names and adjectives]`. */
export const COUNTRIES = [
  [
    'FR',
    true,
    'france|francais|francaise|french|frances|francesa|franca|francia|francja|francji|francuski|francuska',
  ],
  ['BE', true, 'belgique|belge|belgium|belgian|belgica|belga|belgia|belgii'],
  ['LU', true, 'luxembourg|luxembourgeois|luxembourgeoise|luxemburgo|luksemburg'],
  [
    'DE',
    true,
    'allemagne|allemand|allemande|germany|german|alemania|aleman|alemana|alemanha|alema|niemcy|niemiec',
  ],
  ['AT', true, 'autriche|autrichien|autrichienne|austria|austrian|austriaco|austriaca|austriak'],
  [
    'NL',
    true,
    'paises bajos|pays bas|neerlandais|neerlandaise|netherlands|dutch|holland|holanda|holandes|holandesa|holandia',
  ],
  ['IT', true, 'italie|italien|italienne|italy|italian|italia|italiano|italiana|wlochy|wloch'],
  ['ES', true, 'espagne|espagnol|espagnole|spain|spanish|espana|espanol|espanola|espanha|hiszpania|hiszpan'],
  ['PT', true, 'portugal|portugais|portugaise|portuguese|portugues|portuguesa|portugalia'],
  ['IE', true, 'irlande|irlandais|irlandaise|ireland|irish|irlanda|irlandes|irlandesa|irlandia'],
  [
    'PL',
    true,
    'pologne|polonais|polonaise|poland|polish|polonia|polaco|polaca|polones|polonesa|polska|polski|polak|polka',
  ],
  ['CZ', true, 'tchequie|tcheque|czechia|czech|chequia|checo|checa|tchequia|czechy'],
  ['SK', true, 'slovaquie|slovaque|slovakia|slovak|eslovaquia|eslovaco|slowacja'],
  ['HU', true, 'hongrie|hongrois|hongroise|hungary|hungarian|hungria|hungaro|hungara|wegry'],
  ['RO', true, 'roumanie|roumain|roumaine|romania|romanian|rumania|rumano|rumana|romenia|romeno|rumunia'],
  ['BG', true, 'bulgarie|bulgare|bulgaria|bulgarian|bulgaro|bulgara'],
  ['GR', true, 'grece|grec|grecque|greece|greek|grecia|griego|griega|grego|grega|grecja'],
  ['CY', true, 'chypre|chypriote|cyprus|cypriot|chipre|cipriota|cypr'],
  ['MT', true, 'malte|maltais|maltaise|malta|maltese|maltes'],
  ['SI', true, 'slovenie|slovene|slovenia|slovenian|eslovenia|esloveno|slowenia'],
  ['HR', true, 'croatie|croate|croatia|croatian|croacia|croata|chorwacja'],
  ['DK', true, 'danemark|danois|danoise|denmark|danish|dinamarca|danes|danesa|dinamarques|dania'],
  ['SE', true, 'suede|suedois|suedoise|sweden|swedish|suecia|sueco|sueca|szwecja'],
  ['FI', true, 'finlande|finlandais|finlandaise|finland|finnish|finlandia|finlandes|finlandesa'],
  ['EE', true, 'estonie|estonien|estonienne|estonia|estonian|estonio'],
  ['LV', true, 'lettonie|letton|lettone|latvia|latvian|letonia|leton|letona|lotwa'],
  ['LT', true, 'lituanie|lituanien|lituanienne|lithuania|lithuanian|lituania|lituano|lituana|litwa'],
  ['NO', true, 'norvege|norvegien|norvegienne|norway|norwegian|noruega|noruego|norwegia'],
  ['IS', true, 'islande|islandais|islandaise|iceland|icelandic|islandia|islandes|islandesa'],
  ['LI', true, 'liechtenstein'],
  ['CH', true, 'suisse|switzerland|swiss|suiza|suizo|suica|szwajcaria'],
  [
    'GB',
    false,
    'wielka brytania|united kingdom|royaume uni|u k|britannique|angleterre|britain|british|england|uk|reino unido|britanico|inglaterra',
  ],
  [
    'US',
    false,
    'stany zjednoczone|estados unidos|united states|etats unis|the us|u s a|u s|us citizen|us national|us passport|us citizenship|green card|americain|americaine|usa|american|estadounidense|americano|americana',
  ],
  ['CA', false, 'canada|canadien|canadienne|canadian|canadiense|canadense|kanada'],
  ['AU', false, 'australie|australien|australienne|australia|australian|australiano|australiana'],
  ['NZ', false, 'nouvelle zelande|nueva zelanda|nova zelandia|new zealand'],
  [
    'BR',
    false,
    'bresil|bresilien|bresilienne|brazil|brazilian|brasil|brasileno|brasilena|brasileiro|brasileira|brazylia',
  ],
  ['MX', false, 'mexique|mexicain|mexicaine|mexico|mexican|mexicano|mexicana|meksyk'],
  ['AR', false, 'argentine|argentin|argentina|argentinian|argentino|argentyna'],
  ['CL', false, 'chili|chilien|chilienne|chile|chilean|chileno|chilena'],
  ['CO', false, 'colombie|colombien|colombienne|colombia|colombian|colombiano|colombiana|kolumbia'],
  ['PE', false, 'perou|peruvien|peruvienne|peru|peruvian|peruano|peruana'],
  ['MA', false, 'maroc|marocain|marocaine|morocco|moroccan|marruecos|marroqui|marrocos|marroquino'],
  ['TN', false, 'tunisie|tunisien|tunisienne|tunisia|tunisian|tunez|tunecino'],
  ['DZ', false, 'algerie|algerien|algerienne|algeria|algerian|argelia|argelino'],
  ['SN', false, 'senegal|senegalais|senegalaise|senegalese'],
  ['CI', false, 'cote d ivoire|ivory coast|ivoirien|ivoirienne'],
  ['SG', false, 'singapour|singapore|singapur|singapura'],
  ['JP', false, 'japon|japonais|japonaise|japan|japanese|japones|japonesa|japao|japonia'],
  ['CN', false, 'chine|chinois|chinoise|china|chinese|chino|chinesa|chiny'],
  ['IN', false, 'inde|indien|indienne|india|indian|indio|indiano|indie'],
  ['AE', false, 'united arab emirates|emirats arabes unis|uae|dubai|emiratos'],
  ['IL', false, 'israel|israelien|israelienne|israeli'],
  ['TR', false, 'turquie|turc|turque|turkey|turkish|turquia|turco|turca|turcja'],
  ['UA', false, 'ukraine|ukrainien|ukrainienne|ukrainian|ucrania|ucraniano|ukraina'],
  ['ZA', false, 'afrique du sud|south african|africa do sul|south africa|sudafrica'],
].map(([code, eu, words]) => ({ code, eu, words: words.split('|') }));

/** Words that make an answer hold across the EU/EEA. A bare "eu" is Portuguese for "I". */
const EU_WORDS = [
  'ue',
  'union europeenne',
  'european union',
  'union europea',
  'uniao europeia',
  'unia europejska',
  'unii europejskiej',
  'eee',
  'eea',
  'espace economique europeen',
  'european economic area',
  'europeen',
  'europeenne',
  'european',
  'europeo',
  'europea',
  'europeu',
  'europeia',
  'eu citizen',
  'eu national',
  'eu nationality',
  'eu passport',
];

/** A question about a place it does not name: the answer can't be checked against it. */
const UNNAMED_PLACE = [
  'country listed',
  'the country of this',
  'this country',
  'the location of this role',
  'where this role',
  'where the role',
  'this location',
  'location listed',
  'pays du poste',
  'pays de l offre',
  'ce pays',
  'pais del puesto',
  'pais de la oferta',
  'pais da vaga',
  'kraju oferty',
];

const has = (text, phrase) => ` ${text} `.includes(` ${phrase} `);

/** The countries a normalised text names. */
export function countriesIn(text) {
  return COUNTRIES.filter((c) => c.words.some((w) => has(text, w)));
}

/**
 * Whether `answer` (the person's stored work authorisation, any case) covers what `question`
 * (normalised label text) asks. `residence` is the profile's country, used only when the answer
 * names no place at all ("Oui", "Yes"): then it is taken to mean where the person lives.
 */
export function workRightCovers(question, answer, residence = '') {
  const q = String(question || '');
  if (UNNAMED_PLACE.some((p) => has(q, p))) return false;
  const asked = countriesIn(q);
  // "…to work in the European Union?" names a region, not a country.
  const askedEu = EU_WORDS.some((w) => has(q, w));
  if (!asked.length && !askedEu) return true;
  const a = normaliseLoose(answer);
  let covered = countriesIn(a);
  let euToo = EU_WORDS.some((w) => has(a, w)) || covered.some((c) => c.eu);
  if (!covered.length && !euToo) {
    covered = countriesIn(normaliseLoose(residence));
    if (!covered.length) return false;
    euToo = covered.some((c) => c.eu);
  }
  if (askedEu && !euToo) return false;
  return asked.every((c) => covered.includes(c) || (c.eu && euToo));
}

/** The packs' normal form, kept local so this module has no imports. */
function normaliseLoose(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
