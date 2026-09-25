// SPDX-License-Identifier: Apache-2.0
// HTML `autocomplete` token → canonical key. HTML autocomplete tokens are specified, not guessed, so a match here is decisive and language-independent. https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill
// A `null` is a token we recognise and refuse to fill.

export default {
  'given-name': 'given_name',
  'additional-name': null,
  'family-name': 'family_name',
  name: 'full_name',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'street-address': 'street',
  'address-line1': 'street',
  'address-level2': 'city',
  'address-level1': null,
  'postal-code': 'postal_code',
  country: 'country',
  'country-name': 'country',
  organization: 'current_employer',
  'organization-title': 'current_title',
  url: 'portfolio_url',
  bday: null,
  sex: null,
  'cc-name': null,
  'cc-number': null,
  'cc-exp': null,
  'cc-csc': null,
  'new-password': null,
  'current-password': null,
  'one-time-code': null,
};
