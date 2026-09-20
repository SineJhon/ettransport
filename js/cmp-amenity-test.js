const fs = require('fs');
const src = fs.readFileSync('c:/xampp/htdocs/ettransport/js/search.js', 'utf8');

// Extract the REAL normalizeAmenities + tripAmenities from the file.
const a = src.indexOf('function normalizeAmenities(arr)');
const b = src.indexOf('/* Resolve the amenity list for one trip');
const c = src.indexOf('function tripAmenities(companyName, src)');
const d = src.indexOf('var DEPART_LABELS');

const normalizeSrc = src.slice(a, b);
const tripSrc = src.slice(c, d);

// companyMetaFor used by tripAmenities — stub with controllable meta.
let META = null;
const fn = new Function(
  'function companyMetaFor(name) {\n' +
  '  if (META && META.name === name) { return META; }\n' +
  '  return null;\n' +
  '}\n' +
  normalizeSrc + '\n' +
  tripSrc + '\n' +
  'return { normalizeAmenities: normalizeAmenities || null, tripAmenities: tripAmenities || null };'
);

const { normalizeAmenities, tripAmenities } = fn();

const checks = [];
function ck(name, ok) { checks.push([name, ok]); }

// 1. Trip has its own amenities -> kept as-is.
ck('own amenities kept',
  JSON.stringify(tripAmenities('Selam Bus', ['AC', 'Wi-Fi'])) === JSON.stringify(['AC', 'Wi-Fi']));

// 2. Empty array + known company catalog -> catalog amenities used.
META = { name: 'Selam Bus', amenities: ['Air Conditioning', 'Snacks', 'Charging'] };
ck('empty -> catalog amenities',
  JSON.stringify(tripAmenities('Selam Bus', [])) === JSON.stringify(['Air Conditioning', 'Snacks', 'Charging']));

// 3. Empty array + unknown company -> standard default fallback.
META = null;
ck('empty + unknown -> default',
  JSON.stringify(tripAmenities('Mystery Coaches', [])) === JSON.stringify(['Air Conditioning', 'Luggage']));

// 4. null/undefined from API -> standard default.
ck('null amenities -> default',
  JSON.stringify(tripAmenities('Mystery Coaches', null)) === JSON.stringify(['Air Conditioning', 'Luggage']));

// 5. normalizeAmenities trims + filters empties.
ck('normalize trims strings',
  JSON.stringify(normalizeAmenities(['  AC  ', 'Wi-Fi', null, ''])) === JSON.stringify(['AC', 'Wi-Fi']));

let pass = 0;
for (const [n, ok] of checks) { console.log((ok ? 'PASS' : 'FAIL') + ' :: ' + n); if (ok) pass++; }
console.log('RESULT: ' + pass + '/' + checks.length);
if (pass < checks.length) process.exit(1);