// SPDX-License-Identifier: Apache-2.0
// English. Phrases are lowercase: labels are normalised before matching.
//
// `attr` tokens (in `sections`) are the words a form's own `name`/`id` puts next to a row
// index, `experiences[1][company]`. They are language-neutral in practice, so they live here
// once rather than in every pack. `okt` in `dates.months` is the Dutch/German spelling seen
// in imported résumés; it moves to those packs when they exist.
//
// The shape of a pack is documented in `_template.js`; every key must exist in
// `src/schema/fields.js`, which the build checks.

export default {
  lang: 'en',
  thirdParty: [
    'emergency',
    'recruiter',
    'referrer',
    'referral',
    'spouse',
    'child',
    'children',
    'friend',
    'colleague',
    'guardian',
    'witness',
    'next of kin',
  ],
  captionFiller: ['your', 'my', 'optional', 'required'],
  dates: {
    months: {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
      okt: 10,
    },
    ongoing: ['present', 'current', 'now'],
  },
  sections: {
    work: {
      any: [
        'experience',
        'experiences',
        'work experience',
        'professional experience',
        'employment',
        'employment history',
        'work history',
        'previous employment',
        'career history',
        'jobs',
      ],
      attr: [
        'experience',
        'experiences',
        'workexperience',
        'workexperiences',
        'work',
        'employment',
        'employments',
        'job',
        'jobs',
        'emploi',
        'emplois',
        'exp',
        'experiencia',
        'experiencias',
      ],
    },
    volunteer: {
      any: ['volunteering', 'volunteer experience', 'volunteer work', 'community involvement'],
      attr: ['volunteer', 'volunteering', 'benevolat'],
    },
    education: {
      any: [
        'education',
        'education history',
        'academic background',
        'academic history',
        'studies',
        'qualifications',
        'schooling',
      ],
      attr: [
        'education',
        'educations',
        'edu',
        'school',
        'schools',
        'formation',
        'formations',
        'diplome',
        'diplomes',
        'degree',
        'degrees',
        'study',
        'studies',
        'etudes',
        'estudios',
        'educacion',
      ],
    },
    certificates: {
      any: [
        'certification',
        'certifications',
        'certificates',
        'licenses and certifications',
        'licences and certifications',
      ],
      attr: ['certificate', 'certificates', 'certification', 'certifications', 'cert', 'certs'],
    },
    awards: {
      any: ['awards', 'honors', 'honours', 'awards and honors', 'awards and honours'],
      attr: ['award', 'awards'],
    },
    publications: {
      any: ['publications'],
      attr: ['publication', 'publications'],
    },
    skills: {
      any: ['skills'],
      attr: ['skill', 'skills', 'competence', 'competences'],
    },
    languages: {
      any: ['languages', 'language skills'],
      attr: ['language', 'languages', 'langue', 'langues', 'lang', 'idioma', 'idiomas'],
    },
    interests: {
      any: ['interests', 'hobbies', 'hobbies and interests'],
      attr: ['interest', 'interests', 'hobby', 'hobbies'],
    },
    references: {
      any: ['references', 'referees', 'professional references'],
      attr: ['reference', 'references', 'referee', 'referees'],
    },
    projects: {
      any: ['projects', 'personal projects'],
      attr: ['project', 'projects', 'projet', 'projets', 'proyecto', 'proyectos'],
    },
  },
  keys: {
    given_name: {
      any: ['first name', 'given name', 'forename', 'firstname'],
      not: [],
    },
    family_name: {
      any: ['last name', 'family name', 'surname', 'lastname'],
      not: ['company', 'employer', 'school', 'university', 'file'],
    },
    full_name: {
      any: ['full name', 'your name', 'name'],
      not: [
        'first',
        'last',
        'given',
        'family',
        'middle',
        'company',
        'employer',
        'organisation',
        'organization',
        'school',
        'university',
        'file',
        'user',
        'domain',
        'job',
        'role',
        'title',
        'reference',
        'emergency',
      ],
    },
    email: {
      any: ['email', 'e mail', 'email address', 'mail address'],
      not: ['confirm', 'verify', 'repeat', 're enter', 'employer', 'referrer', 'recruiter'],
    },
    email_confirm: {
      any: [
        'confirm email',
        'confirm your email',
        'verify email',
        'repeat email',
        're enter email',
        'email again',
      ],
      not: [],
    },
    phone: {
      any: ['phone', 'telephone', 'phone number', 'mobile', 'cell', 'cellphone', 'mobile number'],
      not: ['emergency', 'company', 'employer'],
    },
    street: {
      any: ['address', 'street address', 'street', 'address line', 'home address'],
      not: ['email', 'e mail', 'mail', 'ip', 'url', 'web', 'site', 'linkedin'],
    },
    postal_code: {
      any: ['postal code', 'postcode', 'zip', 'zip code'],
      not: [],
    },
    city: {
      any: ['city', 'town', 'locality', 'city of residence'],
      not: ['birth', 'company', 'school', 'university'],
    },
    country: {
      any: ['country'],
      not: ['birth', 'citizenship', 'nationality'],
    },
    linkedin_url: {
      any: ['linkedin', 'linkedin profile', 'linkedin url'],
      not: [],
    },
    github_url: {
      any: ['github', 'gitlab'],
      not: [],
    },
    portfolio_url: {
      any: ['portfolio', 'website', 'personal website', 'your site', 'web site', 'personal site'],
      not: ['company', 'linkedin', 'github', 'job'],
    },
    current_title: {
      any: [
        'current title',
        'current job title',
        'current role',
        'current position',
        'your job title',
        'present title',
      ],
      not: ['desired', 'applying', 'wanted', 'target', 'vacancy'],
    },
    current_employer: {
      any: [
        'current employer',
        'current company',
        'your employer',
        'present employer',
        'most recent employer',
      ],
      not: ['desired', 'target'],
    },
    summary: {
      any: [
        'about you',
        'about yourself',
        'profile',
        'bio',
        'professional summary',
        'tell us about yourself',
        'introduce yourself',
      ],
      not: ['letter', 'company', 'role', 'job', 'linkedin', 'github', 'url', 'site', 'sitio'],
    },
    cover_letter: {
      any: [
        'cover letter',
        'motivation',
        'why this role',
        'why this company',
        'why do you want',
        'message to the hiring team',
        'additional information',
      ],
      not: ['file', 'attach', 'upload', 'resume', 'cv'],
    },
    years_experience: {
      any: ['years of experience', 'years experience', 'how many years', 'total experience'],
      not: [],
    },
    salary_expectation: {
      any: [
        'salary expectation',
        'expected salary',
        'desired salary',
        'compensation expectation',
        'expected compensation',
      ],
      not: ['current', 'offered', 'range for this role'],
    },
    notice_period: {
      any: ['notice period', 'notice'],
      not: [],
    },
    availability_date: {
      any: ['availability', 'available from', 'start date', 'earliest start'],
      not: [],
    },
    work_authorization: {
      any: [
        'work authorization',
        'work authorisation',
        'right to work',
        'work permit',
        'visa',
        'legally authorized',
        'sponsorship',
        'authorized to work',
        'authorised to work',
        'eligible to work',
        'right to work in',
      ],
      not: [],
    },
    education_degree: {
      any: ['degree', 'highest degree', 'education level', 'qualification', 'field of study'],
      not: ['school', 'university', 'institution', 'year'],
    },
    education_institution: {
      any: ['school', 'university', 'institution', 'college', 'school name'],
      not: [],
    },
    skills: {
      any: ['skills', 'your skills', 'key skills'],
      not: ['required', 'must have'],
    },
    languages: {
      any: ['languages', 'languages spoken', 'language level'],
      not: ['programming'],
    },
    // A file input only. "Resume" here is the CV; the French summary sense cannot reach a
    // file picker, because the `file` shape admits no other key.
    cv_file: {
      any: [
        'resume',
        'cv',
        'curriculum vitae',
        'resume cv',
        'upload resume',
        'upload your resume',
        'attach resume',
        'attach your resume',
      ],
      not: [
        'cover',
        'letter',
        'transcript',
        'portfolio',
        'photo',
        'diploma',
        'certificate',
        'other',
        'additional',
        'supporting',
        'reference',
        'references',
      ],
    },
    'work.position': {
      any: ['job title', 'title', 'position', 'position title', 'role', 'job'],
      not: [
        'date',
        'start',
        'end',
        'location',
        'city',
        'description',
        'desired',
        'target',
        'company',
        'employer',
      ],
    },
    'work.company': {
      any: ['company', 'company name', 'employer', 'employer name', 'organisation', 'organization'],
      not: [
        'date',
        'start',
        'end',
        'location',
        'city',
        'description',
        'industry',
        'size',
        'website',
        'address',
        'phone',
        'sector',
      ],
    },
    'work.location': {
      any: ['location', 'city', 'work location'],
      not: ['birth', 'date'],
    },
    'work.start': {
      any: ['start date', 'start', 'from', 'date from', 'start month', 'start year'],
      not: ['end', 'description'],
    },
    'work.end': {
      any: ['end date', 'end', 'to', 'date to', 'end month', 'end year', 'until'],
      not: ['start', 'description', 'responsibilities'],
    },
    'work.description': {
      any: [
        'description',
        'role description',
        'job description',
        'responsibilities',
        'duties',
        'achievements',
        'key achievements',
      ],
      not: [],
    },
    'work.url': {
      any: ['company website'],
      not: [],
    },
    'volunteer.position': {
      any: ['role', 'position', 'title'],
      not: ['date', 'start', 'end', 'location', 'city', 'description', 'organization', 'organisation'],
    },
    'volunteer.organization': {
      any: ['organization', 'organisation', 'organization name', 'organisation name', 'charity'],
      not: ['date', 'start', 'end', 'location', 'city', 'description'],
    },
    'volunteer.start': {
      any: ['start date', 'start', 'from'],
      not: ['end'],
    },
    'volunteer.end': {
      any: ['end date', 'end', 'to'],
      not: ['start'],
    },
    'volunteer.description': {
      any: ['description', 'responsibilities'],
      not: [],
    },
    'education.degree': {
      any: ['degree', 'degree type', 'qualification', 'qualification type', 'diploma', 'level of education'],
      not: [
        'date',
        'start',
        'end',
        'location',
        'city',
        'description',
        'school',
        'university',
        'institution',
        'year',
        'field',
        'major',
        'grade',
      ],
    },
    'education.field': {
      any: [
        'field of study',
        'area of study',
        'major',
        'discipline',
        'subject',
        'specialization',
        'specialisation',
      ],
      not: ['date', 'start', 'end'],
    },
    'education.institution': {
      any: [
        'school',
        'school name',
        'university',
        'institution',
        'institution name',
        'college',
        'school or university',
      ],
      not: ['date', 'start', 'end', 'city', 'address'],
    },
    'education.start': {
      any: ['start date', 'start', 'from', 'start year'],
      not: ['end', 'graduation'],
    },
    'education.end': {
      any: [
        'end date',
        'end',
        'to',
        'end year',
        'graduation date',
        'graduation year',
        'year of graduation',
        'expected graduation',
      ],
      not: ['start'],
    },
    'education.score': {
      any: ['grade', 'gpa', 'overall result', 'result', 'classification'],
      not: [],
    },
    'education.details': {
      any: ['description', 'details', 'courses', 'coursework', 'activities'],
      not: [],
    },
    'certificates.name': {
      any: ['certification', 'certification name', 'certificate', 'license', 'licence', 'title', 'name'],
      not: ['date', 'issuing', 'issuer', 'issued', 'url', 'link', 'organization', 'organisation'],
    },
    'certificates.issuer': {
      any: [
        'issuing organization',
        'issuing organisation',
        'issuer',
        'issued by',
        'authority',
        'organization',
        'organisation',
      ],
      not: ['date'],
    },
    'certificates.date': {
      any: ['date', 'issue date', 'date issued', 'date obtained', 'year'],
      not: ['expiration', 'expiry'],
    },
    'certificates.url': {
      any: ['url', 'link', 'credential url'],
      not: [],
    },
    'awards.title': {
      any: ['award', 'award title', 'title', 'name', 'honor', 'honour'],
      not: ['date', 'awarded by', 'issuer', 'organization', 'organisation'],
    },
    'awards.awarder': {
      any: ['awarder', 'awarded by', 'issuer', 'organization', 'organisation'],
      not: [],
    },
    'awards.date': {
      any: ['date', 'year'],
      not: [],
    },
    'awards.description': {
      any: ['description'],
      not: [],
    },
    'publications.name': {
      any: ['title', 'publication title', 'name'],
      not: ['date', 'publisher', 'journal'],
    },
    'publications.publisher': {
      any: ['publisher', 'journal', 'published in', 'published by'],
      not: [],
    },
    'publications.date': {
      any: ['date', 'publication date', 'release date', 'year'],
      not: [],
    },
    'publications.url': {
      any: ['url', 'link', 'doi'],
      not: [],
    },
    'publications.description': {
      any: ['summary', 'abstract', 'description'],
      not: [],
    },
    'skills.name': {
      any: ['skill', 'skill name'],
      not: ['level', 'proficiency'],
    },
    'skills.level': {
      any: ['level', 'skill level', 'proficiency'],
      not: [],
    },
    'skills.keywords': {
      any: ['keywords', 'tools', 'technologies'],
      not: [],
    },
    'languages.language': {
      any: ['language'],
      not: ['level', 'proficiency', 'fluency'],
    },
    'languages.fluency': {
      any: ['level', 'language level', 'proficiency', 'fluency'],
      not: [],
    },
    'interests.name': {
      any: ['interest', 'hobby'],
      not: [],
    },
    'interests.keywords': {
      any: ['keywords', 'details'],
      not: [],
    },
    'references.name': {
      any: ['full name', 'referee name', 'reference name', 'name of referee'],
      not: ['company', 'employer'],
    },
    'references.reference': {
      any: ['recommendation', 'testimonial'],
      not: [],
    },
    'projects.name': {
      any: ['project', 'project name', 'title'],
      not: ['date', 'start', 'end', 'location', 'city', 'description'],
    },
    'projects.description': {
      any: ['description', 'summary', 'details'],
      not: [],
    },
    'projects.start': {
      any: ['start date', 'start'],
      not: ['end'],
    },
    'projects.end': {
      any: ['end date', 'end'],
      not: ['start'],
    },
    'projects.url': {
      any: ['url', 'link', 'project url'],
      not: [],
    },
  },
};
