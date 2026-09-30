// SPDX-License-Identifier: Apache-2.0
// Brazilian Portuguese. Phrases are lowercase and unaccented (labels are normalised before
// matching) except `dates.ongoing`, which is matched against the raw, lowercased date text.
//
// Close enough to Spanish that many phrases repeat es.js on purpose (`empresa`, `idiomas`,
// `cargo`): a phrase listed twice for the same key is harmless. Brazilian forms add a few
// things Spanish ones do not ask the same way: `cep` for the postal code, `data de admissao`
// and `data de saida` for job dates, and `nome da mae` / `nome social`, which are never the
// candidate's CV name and are ruled out below.
//
// The shape of a pack is documented in `_template.js`; every key must exist in
// `src/schema/fields.js`, which the build checks.

export default {
  lang: 'pt',
  thirdParty: [
    'emergencia',
    'recrutador',
    'filho',
    'filhos',
    'conjuge',
    'pai',
    'mae',
    'amigo',
    'colega',
    'responsavel',
  ],
  captionFiller: ['seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'opcional', 'obrigatorio'],
  dates: {
    months: {
      jan: 1,
      fev: 2,
      mar: 3,
      abr: 4,
      mai: 5,
      jun: 6,
      jul: 7,
      ago: 8,
      set: 9,
      out: 10,
      nov: 11,
      dez: 12,
    },
    ongoing: ['atual', 'o momento'],
  },
  sections: {
    work: {
      any: [
        'experiencia',
        'experiencias',
        'experiencia profissional',
        'experiencias profissionais',
        'historico profissional',
      ],
    },
    volunteer: {
      any: ['voluntariado', 'trabalho voluntario'],
    },
    education: {
      any: ['formacao', 'formacao academica', 'educacao', 'escolaridade'],
    },
    certificates: {
      any: ['certificacoes', 'certificados'],
    },
    awards: {
      any: ['premios', 'premiacoes', 'reconhecimentos'],
    },
    publications: {
      any: ['publicacoes'],
    },
    skills: {
      any: ['habilidades', 'competencias'],
    },
    languages: {
      any: ['idiomas'],
    },
    interests: {
      any: ['interesses'],
    },
    references: {
      any: ['referencias'],
    },
    projects: {
      any: ['projetos'],
    },
  },
  keys: {
    given_name: {
      any: ['primeiro nome', 'nome proprio'],
      not: [],
    },
    family_name: {
      any: ['sobrenome', 'ultimo nome'],
      not: ['empresa', 'escola', 'universidade', 'faculdade'],
    },
    full_name: {
      any: ['nome completo', 'nome', 'seu nome'],
      // "primeiro nome" is a first name: without these, bare "nome" contests it and it is
      // only suggested.
      not: [
        'primeiro',
        'proprio',
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
        'referencia',
        'contato',
        'mae',
        'pai',
        'social',
        'fantasia',
        'anos',
      ],
    },
    email: {
      any: ['e mail', 'email', 'endereco de e mail', 'correio eletronico'],
      not: ['confirme', 'confirmar', 'confirmacao', 'repita', 'repetir', 'empresa', 'recrutador'],
    },
    email_confirm: {
      any: [
        'confirme seu e mail',
        'confirme o e mail',
        'confirmar e mail',
        'confirmacao de e mail',
        'repita seu e mail',
        'confirmar email',
      ],
      not: [],
    },
    phone: {
      any: ['telefone', 'celular', 'telefone celular', 'numero de telefone', 'whatsapp'],
      not: ['empresa', 'emergencia', 'recado'],
    },
    street: {
      any: ['endereco', 'logradouro', 'rua', 'endereco residencial'],
      not: ['e mail', 'email', 'eletronico', 'web', 'url', 'site', 'linkedin', 'ip'],
    },
    postal_code: {
      any: ['cep', 'codigo postal'],
      not: [],
    },
    city: {
      any: ['cidade', 'municipio', 'localidade'],
      not: ['nascimento', 'natal', 'empresa', 'escola', 'universidade', 'faculdade'],
    },
    country: {
      any: ['pais', 'pais de residencia'],
      not: ['nascimento', 'nacionalidade'],
    },
    linkedin_url: {
      any: ['linkedin', 'perfil do linkedin', 'url do linkedin'],
      not: [],
    },
    github_url: {
      any: ['github', 'gitlab'],
      not: [],
    },
    portfolio_url: {
      any: ['portfolio', 'portifolio', 'site pessoal', 'pagina pessoal', 'seu site'],
      not: ['empresa', 'linkedin', 'github', 'vaga'],
    },
    current_title: {
      any: ['cargo atual', 'funcao atual', 'ocupacao atual', 'seu cargo atual'],
      not: ['desejado', 'pretendido', 'vaga'],
    },
    current_employer: {
      any: ['empresa atual', 'empregador atual', 'ultima empresa', 'sua empresa'],
      not: ['desejada', 'pretendida'],
    },
    summary: {
      any: [
        'sobre voce',
        'fale sobre voce',
        'fale um pouco sobre voce',
        'resumo profissional',
        'perfil',
        'biografia',
      ],
      not: ['carta', 'empresa', 'vaga', 'cargo', 'linkedin', 'github', 'url', 'site'],
    },
    cover_letter: {
      any: [
        'carta de apresentacao',
        'motivacao',
        'por que esta vaga',
        'por que esta empresa',
        'por que voce quer trabalhar',
        'mensagem ao recrutador',
      ],
      not: ['arquivo', 'anexo', 'anexar', 'anexe', 'enviar', 'curriculo', 'cv'],
    },
    years_experience: {
      any: ['anos de experiencia', 'quantos anos de experiencia', 'tempo de experiencia'],
      not: [],
    },
    salary_expectation: {
      any: ['pretensao salarial', 'expectativa salarial', 'salario pretendido', 'remuneracao pretendida'],
      not: ['atual', 'oferecido', 'faixa da vaga'],
    },
    notice_period: {
      any: ['aviso previo'],
      not: [],
    },
    availability_date: {
      any: [
        'disponibilidade',
        'data de disponibilidade',
        'disponivel a partir de',
        'disponibilidade para inicio',
      ],
      not: ['viagem', 'viagens', 'mudanca', 'horario'],
    },
    work_authorization: {
      any: ['autorizacao de trabalho', 'permissao de trabalho', 'visto de trabalho', 'visto'],
      not: [],
    },
    education_degree: {
      any: ['escolaridade', 'grau de escolaridade', 'nivel de escolaridade', 'formacao'],
      not: ['escola', 'universidade', 'faculdade', 'instituicao', 'ano'],
    },
    education_institution: {
      any: ['universidade', 'faculdade', 'escola', 'instituicao de ensino', 'instituicao'],
      not: [],
    },
    skills: {
      any: ['competencias', 'habilidades', 'suas habilidades'],
      not: ['requerida', 'requeridas', 'obrigatoria', 'obrigatorias'],
    },
    languages: {
      any: ['idiomas', 'idiomas falados', 'nivel de idioma'],
      not: ['programacao'],
    },
    // A file input only. The letter, a photo, a transcript or "outros documentos" each rule it out.
    cv_file: {
      any: [
        'cv',
        'curriculo',
        'seu curriculo',
        'anexe seu curriculo',
        'anexar curriculo',
        'envie seu curriculo',
        'enviar curriculo',
      ],
      not: [
        'carta',
        'apresentacao',
        'foto',
        'historico',
        'certificado',
        'diploma',
        'outro',
        'outros',
        'adicional',
        'adicionais',
        'portfolio',
      ],
    },
    'work.position': {
      any: ['cargo', 'funcao', 'titulo do cargo'],
      not: ['data', 'inicio', 'termino', 'fim', 'local', 'cidade', 'descricao', 'desejado', 'empresa'],
    },
    'work.company': {
      any: ['empresa', 'nome da empresa', 'empregador', 'organizacao'],
      not: [
        'data',
        'inicio',
        'termino',
        'fim',
        'local',
        'cidade',
        'descricao',
        'setor',
        'porte',
        'endereco',
        'telefone',
        'site',
      ],
    },
    'work.location': {
      any: ['local', 'localizacao', 'cidade'],
      not: ['nascimento', 'data'],
    },
    'work.start': {
      any: ['data de inicio', 'inicio', 'data de admissao', 'admissao', 'data de entrada'],
      not: ['termino', 'fim', 'saida'],
    },
    'work.end': {
      any: ['data de termino', 'termino', 'fim', 'data de saida', 'saida', 'data de desligamento'],
      not: ['inicio', 'admissao', 'entrada'],
    },
    'work.description': {
      any: [
        'descricao',
        'atividades',
        'principais atividades',
        'atribuicoes',
        'responsabilidades',
        'realizacoes',
      ],
      not: [],
    },
    'volunteer.position': {
      any: ['cargo', 'funcao'],
      not: ['data', 'inicio', 'termino', 'fim', 'local', 'cidade', 'descricao'],
    },
    'volunteer.organization': {
      any: ['organizacao', 'entidade', 'instituicao', 'associacao', 'ong'],
      not: ['data', 'inicio', 'termino', 'fim', 'local', 'cidade', 'descricao'],
    },
    'volunteer.start': {
      any: ['data de inicio', 'inicio'],
      not: ['termino', 'fim'],
    },
    'volunteer.end': {
      any: ['data de termino', 'termino', 'fim'],
      not: ['inicio'],
    },
    'volunteer.description': {
      any: ['descricao', 'atividades'],
      not: [],
    },
    // In a Brazilian form "curso" is the programme ("Administração"), so it is the field of
    // study; the degree is the level ("Bacharelado", "Tecnólogo").
    'education.degree': {
      any: ['grau', 'nivel', 'titulo', 'grau de escolaridade', 'nivel de formacao', 'tipo de curso'],
      not: [
        'data',
        'inicio',
        'termino',
        'fim',
        'local',
        'cidade',
        'descricao',
        'instituicao',
        'universidade',
        'faculdade',
        'escola',
        'ano',
        'area',
        'nota',
      ],
    },
    'education.field': {
      any: ['curso', 'area de estudo', 'area de formacao'],
      not: ['data', 'inicio', 'termino', 'fim', 'tipo', 'nivel'],
    },
    'education.institution': {
      any: ['instituicao', 'instituicao de ensino', 'universidade', 'faculdade', 'escola'],
      not: ['data', 'inicio', 'termino', 'fim', 'cidade', 'endereco'],
    },
    'education.start': {
      any: ['data de inicio', 'inicio', 'ano de inicio'],
      not: ['termino', 'fim', 'conclusao'],
    },
    'education.end': {
      any: ['data de termino', 'termino', 'fim', 'conclusao', 'data de conclusao', 'ano de conclusao'],
      not: ['inicio'],
    },
    'education.score': {
      any: ['nota', 'media', 'coeficiente de rendimento'],
      not: [],
    },
    'education.details': {
      any: ['descricao', 'detalhes', 'disciplinas'],
      not: [],
    },
    'certificates.name': {
      any: ['certificacao', 'certificado', 'nome'],
      not: ['data', 'emissor', 'emissora', 'instituicao', 'emitido', 'link', 'url'],
    },
    'certificates.issuer': {
      any: ['instituicao emissora', 'emissor', 'emitido por', 'orgao emissor', 'instituicao'],
      not: ['data'],
    },
    'certificates.date': {
      any: ['data', 'data de emissao', 'data de obtencao', 'ano'],
      not: ['validade', 'expiracao', 'vencimento'],
    },
    'certificates.url': {
      any: ['link', 'url'],
      not: [],
    },
    'awards.title': {
      any: ['premio', 'titulo', 'nome'],
      not: ['data', 'concedido', 'instituicao'],
    },
    'awards.awarder': {
      any: ['concedido por', 'instituicao'],
      not: [],
    },
    'awards.date': {
      any: ['data', 'ano'],
      not: [],
    },
    'awards.description': {
      any: ['descricao'],
      not: [],
    },
    'publications.name': {
      any: ['titulo', 'nome'],
      not: ['data', 'editora', 'revista', 'periodico'],
    },
    'publications.publisher': {
      any: ['editora', 'revista', 'periodico', 'publicado em'],
      not: [],
    },
    'publications.date': {
      any: ['data', 'data de publicacao', 'ano'],
      not: [],
    },
    'publications.url': {
      any: ['link', 'url'],
      not: [],
    },
    'publications.description': {
      any: ['resumo', 'descricao'],
      not: [],
    },
    'skills.name': {
      any: ['habilidade', 'competencia'],
      not: ['nivel', 'dominio'],
    },
    'skills.level': {
      any: ['nivel', 'dominio'],
      not: [],
    },
    'skills.keywords': {
      any: ['palavras chave', 'ferramentas'],
      not: [],
    },
    'languages.language': {
      any: ['idioma', 'lingua'],
      not: ['nivel', 'dominio', 'fluencia', 'proficiencia'],
    },
    'languages.fluency': {
      any: ['nivel', 'nivel de idioma', 'fluencia', 'proficiencia', 'dominio'],
      not: [],
    },
    'interests.name': {
      any: ['interesse'],
      not: [],
    },
    'interests.keywords': {
      any: ['detalhes', 'palavras chave'],
      not: [],
    },
    'references.name': {
      any: ['nome completo', 'nome da referencia'],
      not: ['empresa'],
    },
    'references.reference': {
      any: ['referencia', 'recomendacao'],
      not: [],
    },
    'projects.name': {
      any: ['projeto', 'nome do projeto', 'titulo'],
      not: ['data', 'inicio', 'termino', 'fim', 'local', 'cidade', 'descricao'],
    },
    'projects.description': {
      any: ['descricao', 'detalhes'],
      not: [],
    },
    'projects.start': {
      any: ['data de inicio', 'inicio'],
      not: ['termino', 'fim'],
    },
    'projects.end': {
      any: ['data de termino', 'termino', 'fim'],
      not: ['inicio'],
    },
    'projects.url': {
      any: ['link', 'url'],
      not: [],
    },
  },
};
