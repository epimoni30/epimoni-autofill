// SPDX-License-Identifier: Apache-2.0
// Spanish. Phrases are lowercase and unaccented (labels are normalised before matching)
// except `dates.ongoing`, which is matched against the raw, lowercased date text.
//
// The shape of a pack is documented in `_template.js`; every key must exist in
// `src/schema/fields.js`, which the build checks.

export default {
  lang: 'es',
  thirdParty: [
    'emergencia',
    'reclutador',
    'hijo',
    'hijos',
    'conyuge',
    'padre',
    'madre',
    'amigo',
    'companero',
    'tutor',
  ],
  captionFiller: ['tus', 'tu', 'sus', 'su', 'mis', 'opcional', 'obligatorio'],
  dates: {
    months: {
      ene: 1,
      feb: 2,
      mar: 3,
      abr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      ago: 8,
      sep: 9,
      set: 9,
      oct: 10,
      nov: 11,
      dic: 12,
    },
    ongoing: ['hoy', 'actualidad'],
  },
  sections: {
    work: {
      any: [
        'experiencia',
        'experiencia laboral',
        'experiencia profesional',
        'historial laboral',
        'trayectoria profesional',
        'empleos',
      ],
    },
    volunteer: {
      any: ['voluntariado'],
    },
    education: {
      any: ['formacion', 'formacion academica', 'educacion', 'estudios', 'titulaciones'],
    },
    certificates: {
      any: ['certificaciones', 'certificados'],
    },
    awards: {
      any: ['premios', 'reconocimientos'],
    },
    publications: {
      any: ['publicaciones'],
    },
    skills: {
      any: ['habilidades', 'competencias'],
    },
    languages: {
      any: ['idiomas'],
    },
    interests: {
      any: ['intereses', 'aficiones'],
    },
    references: {
      any: ['referencias'],
    },
    projects: {
      any: ['proyectos'],
    },
  },
  keys: {
    given_name: {
      any: ['nombre de pila', 'nombre propio', 'primer nombre'],
      not: [],
    },
    family_name: {
      any: ['apellidos', 'apellido', 'primer apellido'],
      not: ['empresa', 'escuela', 'universidad'],
    },
    full_name: {
      any: ['nombre completo', 'nombre y apellidos', 'nombre'],
      not: [
        'empresa',
        'compania',
        'usuario',
        'archivo',
        'puesto',
        'escuela',
        'universidad',
        'anos',
        'ano',
        'numero',
        'cantidad',
        'hijos',
        'referencia',
        'annees',
        'annee',
        'ans',
        'experience',
        'enfants',
        'personas',
        'dias',
      ],
    },
    email: {
      any: ['correo', 'correo electronico', 'email', 'e mail', 'direccion de correo'],
      not: ['confirm', 'verific', 'repet', 'empresa', 'reclutador'],
    },
    email_confirm: {
      any: [
        'confirmar correo',
        'confirma tu correo',
        'repetir correo',
        'verificar correo',
        'confirmar email',
      ],
      not: [],
    },
    phone: {
      any: ['telefono', 'movil', 'celular', 'numero de telefono', 'tel'],
      not: ['empresa', 'emergencia'],
    },
    street: {
      any: ['direccion', 'calle', 'domicilio', 'direccion postal'],
      not: ['correo', 'email', 'e mail', 'electronico', 'web', 'url', 'sitio', 'linkedin', 'ip'],
    },
    postal_code: {
      any: ['codigo postal', 'cp'],
      not: [],
    },
    city: {
      any: ['ciudad', 'localidad', 'poblacion', 'municipio'],
      not: ['nacimiento', 'empresa', 'escuela', 'universidad'],
    },
    country: {
      any: ['pais', 'pais de residencia'],
      not: ['nacimiento', 'nacionalidad'],
    },
    linkedin_url: {
      any: ['linkedin', 'perfil de linkedin'],
      not: [],
    },
    github_url: {
      any: ['github', 'gitlab'],
      not: [],
    },
    portfolio_url: {
      any: ['portafolio', 'portfolio', 'sitio web', 'pagina web', 'web personal', 'tu web'],
      not: ['empresa', 'linkedin', 'github', 'oferta'],
    },
    current_title: {
      any: ['puesto actual', 'cargo actual', 'posicion actual', 'tu puesto actual', 'ocupacion actual'],
      not: ['deseado', 'buscado', 'solicita', 'vacante'],
    },
    current_employer: {
      any: ['empresa actual', 'empleador actual', 'tu empresa', 'ultima empresa'],
      not: ['deseada', 'objetivo'],
    },
    summary: {
      any: ['sobre ti', 'acerca de ti', 'perfil', 'biografia', 'resumen profesional', 'hablanos de ti'],
      not: ['carta', 'empresa', 'oferta', 'puesto', 'linkedin', 'github', 'url', 'site', 'sitio'],
    },
    cover_letter: {
      any: [
        'carta de presentacion',
        'carta de motivacion',
        'motivacion',
        'por que este puesto',
        'por que esta empresa',
        'mensaje al reclutador',
      ],
      not: ['archivo', 'adjunt', 'subir', 'curriculum', 'cv'],
    },
    years_experience: {
      any: ['anos de experiencia', 'cuantos anos de experiencia', 'experiencia en anos', 'antiguedad'],
      not: [],
    },
    salary_expectation: {
      any: [
        'expectativa salarial',
        'salario deseado',
        'pretension salarial',
        'remuneracion deseada',
        'expectativas economicas',
      ],
      not: ['actual', 'ofrecido', 'rango de la oferta'],
    },
    notice_period: {
      any: ['periodo de preaviso', 'preaviso'],
      not: [],
    },
    availability_date: {
      any: ['disponibilidad', 'fecha de incorporacion', 'disponible a partir de'],
      not: [],
    },
    work_authorization: {
      any: [
        'permiso de trabajo',
        'autorizacion de trabajo',
        'derecho a trabajar',
        'visado',
        'visa',
        'autorizacion para trabajar',
        'permiso para trabajar',
        'derecho a trabajar en',
      ],
      not: [],
    },
    education_degree: {
      any: ['titulacion', 'titulo', 'nivel de estudios', 'formacion', 'estudios'],
      not: ['escuela', 'universidad', 'centro', 'ano'],
    },
    education_institution: {
      any: ['universidad', 'escuela', 'centro de estudios', 'institucion'],
      not: [],
    },
    skills: {
      any: ['competencias', 'habilidades', 'tus competencias'],
      not: ['requerida', 'obligatoria'],
    },
    languages: {
      any: ['idiomas', 'idiomas hablados', 'nivel de idioma'],
      not: ['programacion'],
    },
    'work.position': {
      any: ['puesto', 'titulo del puesto', 'cargo', 'funcion'],
      not: ['fecha', 'inicio', 'fin', 'ubicacion', 'ciudad', 'descripcion', 'deseado', 'empresa'],
    },
    'work.company': {
      any: ['empresa', 'nombre de la empresa', 'empleador', 'compania', 'organizacion'],
      not: [
        'fecha',
        'inicio',
        'fin',
        'ubicacion',
        'ciudad',
        'descripcion',
        'sector',
        'tamano',
        'direccion',
        'telefono',
        'web',
      ],
    },
    'work.location': {
      any: ['ubicacion', 'ciudad', 'localidad'],
      not: ['nacimiento', 'fecha'],
    },
    'work.start': {
      any: ['fecha de inicio', 'inicio', 'desde'],
      not: ['fin'],
    },
    'work.end': {
      any: ['fecha de fin', 'fecha de finalizacion', 'fin', 'hasta'],
      not: ['inicio'],
    },
    'work.description': {
      any: ['descripcion', 'funciones', 'responsabilidades', 'tareas', 'logros'],
      not: [],
    },
    'volunteer.position': {
      any: ['puesto', 'cargo', 'funcion'],
      not: ['fecha', 'inicio', 'fin', 'ubicacion', 'ciudad', 'descripcion'],
    },
    'volunteer.organization': {
      any: ['organizacion', 'entidad', 'asociacion'],
      not: ['fecha', 'inicio', 'fin', 'ubicacion', 'ciudad', 'descripcion'],
    },
    'volunteer.start': {
      any: ['fecha de inicio', 'inicio', 'desde'],
      not: ['fin'],
    },
    'volunteer.end': {
      any: ['fecha de fin', 'fin', 'hasta'],
      not: ['inicio'],
    },
    'volunteer.description': {
      any: ['descripcion', 'funciones'],
      not: [],
    },
    'education.degree': {
      any: ['titulo', 'titulacion', 'grado', 'nivel de estudios'],
      not: [
        'fecha',
        'inicio',
        'fin',
        'ubicacion',
        'ciudad',
        'descripcion',
        'centro',
        'universidad',
        'escuela',
        'ano',
        'especialidad',
        'nota',
      ],
    },
    'education.field': {
      any: ['especialidad', 'area de estudio', 'campo de estudio', 'disciplina'],
      not: ['fecha', 'inicio', 'fin'],
    },
    'education.institution': {
      any: ['centro', 'centro de estudios', 'centro educativo', 'universidad', 'escuela', 'institucion'],
      not: ['fecha', 'inicio', 'fin', 'ciudad', 'direccion'],
    },
    'education.start': {
      any: ['fecha de inicio', 'inicio', 'desde'],
      not: ['fin'],
    },
    'education.end': {
      any: ['fecha de fin', 'fin', 'hasta', 'ano de finalizacion', 'fecha de graduacion'],
      not: ['inicio'],
    },
    'education.score': {
      any: ['nota', 'nota media', 'calificacion'],
      not: [],
    },
    'education.details': {
      any: ['descripcion', 'detalles', 'asignaturas'],
      not: [],
    },
    'certificates.name': {
      any: ['certificacion', 'certificado', 'nombre'],
      not: ['fecha', 'emisor', 'entidad', 'expedido', 'enlace', 'url'],
    },
    'certificates.issuer': {
      any: ['entidad emisora', 'emisor', 'expedido por', 'organismo'],
      not: ['fecha'],
    },
    'certificates.date': {
      any: ['fecha', 'fecha de obtencion', 'ano'],
      not: ['caducidad', 'expiracion'],
    },
    'certificates.url': {
      any: ['enlace', 'url'],
      not: [],
    },
    'awards.title': {
      any: ['premio', 'titulo', 'nombre'],
      not: ['fecha', 'otorgado', 'entidad'],
    },
    'awards.awarder': {
      any: ['otorgado por', 'entidad'],
      not: [],
    },
    'awards.date': {
      any: ['fecha', 'ano'],
      not: [],
    },
    'awards.description': {
      any: ['descripcion'],
      not: [],
    },
    'publications.name': {
      any: ['titulo', 'nombre'],
      not: ['fecha', 'editorial', 'revista'],
    },
    'publications.publisher': {
      any: ['editorial', 'revista', 'publicado en'],
      not: [],
    },
    'publications.date': {
      any: ['fecha', 'fecha de publicacion', 'ano'],
      not: [],
    },
    'publications.url': {
      any: ['enlace', 'url'],
      not: [],
    },
    'publications.description': {
      any: ['resumen', 'descripcion'],
      not: [],
    },
    'skills.name': {
      any: ['habilidad', 'competencia'],
      not: ['nivel', 'dominio'],
    },
    'skills.level': {
      any: ['nivel', 'dominio'],
      not: [],
    },
    'skills.keywords': {
      any: ['palabras clave', 'herramientas'],
      not: [],
    },
    'languages.language': {
      any: ['idioma', 'lengua'],
      not: ['nivel', 'dominio'],
    },
    'languages.fluency': {
      any: ['nivel', 'nivel de idioma', 'dominio'],
      not: [],
    },
    'interests.name': {
      any: ['interes', 'aficion'],
      not: [],
    },
    'interests.keywords': {
      any: ['detalles', 'palabras clave'],
      not: [],
    },
    'references.name': {
      any: ['nombre completo', 'nombre y apellidos', 'nombre del referente'],
      not: ['empresa'],
    },
    'references.reference': {
      any: ['referencia', 'recomendacion'],
      not: [],
    },
    'projects.name': {
      any: ['proyecto', 'nombre del proyecto', 'titulo'],
      not: ['fecha', 'inicio', 'fin', 'ubicacion', 'ciudad', 'descripcion'],
    },
    'projects.description': {
      any: ['descripcion', 'detalles'],
      not: [],
    },
    'projects.start': {
      any: ['fecha de inicio', 'inicio'],
      not: ['fin'],
    },
    'projects.end': {
      any: ['fecha de fin', 'fin'],
      not: ['inicio'],
    },
    'projects.url': {
      any: ['enlace', 'url'],
      not: [],
    },
  },
};
