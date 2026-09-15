// Kobler Untappd-landnavn (engelsk, fra landvelgeren) til verdensdel for hurtigfilteret under «Land».
(function (root) {
  const CONTINENTS = ['europe', 'northAmerica', 'southAmerica', 'asia', 'africa', 'oceania'];

  const fold = s => String(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim();

  // Russland, Tyrkia og Kaukasus regnes til Europa; Midtøsten og Sentral-Asia til Asia.
  // Mellom-Amerika og Karibia regnes til Nord-Amerika.
  const NAMES = {
    europe: [
      'Albania', 'Andorra', 'Armenia', 'Austria', 'Azerbaijan', 'Belarus', 'Belgium', 'Bosnia and Herzegovina',
      'Bosnia & Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Czechia', 'Denmark', 'England',
      'Estonia', 'Faroe Islands', 'Finland', 'France', 'Georgia', 'Germany', 'Gibraltar', 'Greece', 'Guernsey',
      'Hungary', 'Iceland', 'Ireland', 'Isle of Man', 'Italy', 'Jersey', 'Kosovo', 'Latvia', 'Liechtenstein',
      'Lithuania', 'Luxembourg', 'Macedonia', 'North Macedonia', 'Malta', 'Moldova', 'Monaco', 'Montenegro',
      'Netherlands', 'The Netherlands', 'Northern Ireland', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia',
      'Russian Federation', 'San Marino', 'Scotland', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Svalbard and Jan Mayen',
      'Sweden', 'Switzerland', 'Turkey', 'Türkiye', 'Ukraine', 'United Kingdom', 'Vatican City', 'Wales', 'Åland Islands',
    ],
    northAmerica: [
      'Anguilla', 'Antigua and Barbuda', 'Aruba', 'Bahamas', 'The Bahamas', 'Barbados', 'Belize', 'Bermuda', 'Bonaire',
      'British Virgin Islands', 'Canada', 'Cayman Islands', 'Costa Rica', 'Cuba', 'Curaçao', 'Dominica',
      'Dominican Republic', 'El Salvador', 'Greenland', 'Grenada', 'Guadeloupe', 'Guatemala', 'Haiti', 'Honduras',
      'Jamaica', 'Martinique', 'Mexico', 'Montserrat', 'Nicaragua', 'Panama', 'Puerto Rico', 'Saint Barthélemy',
      'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin', 'Saint Pierre and Miquelon',
      'Saint Vincent and the Grenadines', 'Sint Maarten', 'Trinidad and Tobago', 'Turks and Caicos Islands',
      'United States', 'United States of America', 'USA', 'U.S. Virgin Islands', 'US Virgin Islands',
    ],
    southAmerica: [
      'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Falkland Islands', 'French Guiana', 'Guyana',
      'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela',
    ],
    asia: [
      'Afghanistan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Hong Kong', 'India', 'Indonesia',
      'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Macau',
      'Macao', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Burma', 'Nepal', 'North Korea', 'Oman', 'Pakistan',
      'Palestine', 'Palestinian Territories', 'Palestinian Territory', 'Philippines', 'Qatar', 'Saudi Arabia',
      'Singapore', 'South Korea', 'Korea', 'Republic of Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand',
      'Timor-Leste', 'East Timor', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam', 'Viet Nam', 'Yemen',
    ],
    africa: [
      'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde', 'Cabo Verde',
      'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Republic of the Congo', 'Democratic Republic of the Congo',
      'DR Congo', "Côte d'Ivoire", 'Ivory Coast', 'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini',
      'Swaziland', 'Ethiopia', 'Gabon', 'Gambia', 'The Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho',
      'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Mayotte', 'Morocco', 'Mozambique',
      'Namibia', 'Niger', 'Nigeria', 'Réunion', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles',
      'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda',
      'Zambia', 'Zimbabwe',
    ],
    oceania: [
      'American Samoa', 'Australia', 'Cook Islands', 'Fiji', 'French Polynesia', 'Guam', 'Kiribati', 'Marshall Islands',
      'Micronesia', 'Nauru', 'New Caledonia', 'New Zealand', 'Niue', 'Northern Mariana Islands', 'Palau',
      'Papua New Guinea', 'Samoa', 'Solomon Islands', 'Tonga', 'Tuvalu', 'Vanuatu', 'Wallis and Futuna',
    ],
  };

  const byName = new Map();
  for (const [continent, names] of Object.entries(NAMES)) for (const name of names) byName.set(fold(name), continent);

  // Untappd kan gi flere navn i ett, f.eks. «China / People's Republic of China».
  const continentOf = name => [name ?? '', ...String(name ?? '').split('/')]
    .map(part => byName.get(fold(part))).find(Boolean) ?? 'other';

  const api = { CONTINENTS, NAMES, continentOf };
  root.DFU = root.DFU || {};
  root.DFU.continents = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
