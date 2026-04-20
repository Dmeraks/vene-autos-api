/**
 * Iconos de marca para comprobantes y consulta OT.
 *
 * - **Preferencia**: SVG multicolor donde hay URL curada en Wikimedia Commons (logos “reales”).
 * - **Fallback**: Simple Icons CDN (silueta monocromática teñida con hex de marca).
 *   https://github.com/simple-icons/simple-icons — uso sujeto a marca registrada del titular.
 */

const CDN_BASE = 'https://cdn.simpleicons.org';

/** Primera palabra normalizada → slug Simple Icons conocido */
const NORMALIZED_TO_SLUG: Record<string, string> = {
  acura: 'acura',
  alfa: 'alfaromeo',
  alfaromeo: 'alfaromeo',
  audi: 'audi',
  bentley: 'bentley',
  bmw: 'bmw',
  bugatti: 'bugatti',
  buick: 'buick',
  cadillac: 'cadillac',
  chevrolet: 'chevrolet',
  chevy: 'chevrolet',
  chrysler: 'chrysler',
  citroen: 'citroën',
  cupra: 'cupra',
  dacia: 'dacia',
  daihatsu: 'daihatsu',
  dodge: 'dodge',
  fiat: 'fiat',
  ferrari: 'ferrari',
  ford: 'ford',
  genesis: 'genesis',
  gmc: 'gmc',
  honda: 'honda',
  hyundai: 'hyundai',
  infiniti: 'infiniti',
  isuzu: 'isuzu',
  jaguar: 'jaguar',
  jeep: 'jeep',
  kia: 'kia',
  lada: 'lada',
  lamborghini: 'lamborghini',
  landrover: 'landrover',
  land: 'landrover',
  range: 'landrover',
  lexus: 'lexus',
  lincoln: 'lincoln',
  man: 'man',
  maserati: 'maserati',
  mazda: 'mazda',
  mercedes: 'mercedes',
  mercedesbenz: 'mercedes',
  mini: 'mini',
  mitsubishi: 'mitsubishi',
  nissan: 'nissan',
  opel: 'opel',
  peugeot: 'peugeot',
  porsche: 'porsche',
  ram: 'ram',
  renault: 'renault',
  seat: 'seat',
  skoda: 'skoda',
  smart: 'smart',
  subaru: 'subaru',
  suzuki: 'suzuki',
  tata: 'tata',
  tesla: 'tesla',
  toyota: 'toyota',
  volkswagen: 'volkswagen',
  vw: 'volkswagen',
  volvo: 'volvo',
}

/**
 * SVG multicolor por slug (clave = valor devuelto por {@link resolveVehicleBrandIconSlug}).
 * Rutas públicas verificadas en Commons; si falta una marca → Simple Icons monocromo.
 */
const SLUG_FULLCOLOR_COMMONS_SVG: Record<string, string> = {
  audi: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Audi_logo.svg',
  bmw: 'https://upload.wikimedia.org/wikipedia/commons/4/44/BMW.svg',
  chevrolet: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Chevrolet_bowtie_2023.svg',
  'citroën': 'https://upload.wikimedia.org/wikipedia/commons/d/dd/Citroen_2022.svg',
  ferrari: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Ferrari_wordmark.svg',
  fiat: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Fiat_logo.svg',
  ford: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Ford-Logo-Vector.svg',
  honda: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Honda_Logo.svg',
  hyundai: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Hyundai_Motor_Company_logo.svg',
  jaguar: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Jaguar_wordmark_2021.svg',
  jeep: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Jeep_logo.svg',
  kia: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/KIA_logo3.svg',
  lexus: 'https://upload.wikimedia.org/wikipedia/commons/7/75/Lexus.svg',
  mazda: 'https://upload.wikimedia.org/wikipedia/commons/4/43/Mazda_logo_2024_%28vertical%29.svg',
  mercedes: 'https://upload.wikimedia.org/wikipedia/commons/4/48/Mercedes-Benz_logo.svg',
  mitsubishi: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Mitsubishi_logo.svg',
  nissan: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Nissan_logo.svg',
  peugeot: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Peugeot_logo.svg',
  porsche: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Porsche_wordmark.svg',
  renault: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Renault_2021.svg',
  subaru: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Subaru_logo.svg',
  suzuki: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Suzuki_logo.svg',
  tesla: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Tesla_T_symbol.svg',
  toyota: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Toyota.svg',
  volkswagen: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Volkswagen_logo_2019.svg',
  volvo: 'https://upload.wikimedia.org/wikipedia/commons/5/54/Volvo_logo.svg',
}

/** Path permitido para logos multicolor (solo estos se inyectan desde Commons). */
const ALLOWED_FULLCOLOR_COMMONS_PATHS = new Set(
  Object.values(SLUG_FULLCOLOR_COMMONS_SVG).map((href) => {
    try {
      return new URL(href).pathname;
    } catch {
      return '';
    }
  }).filter(Boolean),
)

/** Color por slug (hex sin #) fallback Simple Icons */
const SLUG_HEX: Record<string, string> = {
  acura: '000000',
  alfaromeo: '981E32',
  audi: 'BB0A30',
  bentley: '333333',
  bmw: '0066B1',
  bugatti: '000000',
  buick: 'CC0033',
  cadillac: '000000',
  chevrolet: 'CD9834',
  chrysler: '203368',
  'citroën': 'DA291C',
  cupra: '000000',
  dacia: '003D79',
  daihatsu: 'E60012',
  dodge: 'EF3827',
  ferrari: 'E32119',
  fiat: '981E32',
  ford: '003478',
  genesis: '121417',
  gmc: 'CC0033',
  honda: 'E40521',
  hyundai: '002C5F',
  infiniti: '000000',
  isuzu: '000000',
  jaguar: '000000',
  jeep: '000000',
  kia: '05141F',
  lada: 'ED7800',
  lamborghini: 'DDB320',
  landrover: '004023',
  lexus: '000000',
  lincoln: '20396E',
  man: '000000',
  maserati: '000000',
  mazda: 'C8102E',
  mercedes: '242424',
  mini: '000000',
  mitsubishi: 'E60012',
  nissan: 'C3002F',
  opel: '000000',
  peugeot: '002355',
  porsche: 'B12B26',
  ram: '880D00',
  renault: 'FFCC33',
  seat: 'DB0029',
  skoda: '4BA82E',
  smart: '000000',
  subaru: '013C74',
  suzuki: 'E30613',
  tata: '486AAF',
  tesla: 'CC0000',
  toyota: 'EB0A1E',
  volkswagen: '151F5D',
  volvo: '003057',
}

function normalizeBrandKey(raw: string): string {
  const first = raw.trim().split(/\s+/)[0] ?? '';
  return first
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resuelve slug Simple Icons desde texto libre de marca (ej. «MAZDA 3», «Mercedes-Benz»).
 */
export function resolveVehicleBrandIconSlug(brandRaw: string | null | undefined): string | null {
  if (!brandRaw?.trim()) return null;
  const key = normalizeBrandKey(brandRaw);
  if (!key) return null;
  return NORMALIZED_TO_SLUG[key] ?? null;
}

/**
 * URL de logo para `<img>`: Commons multicolor si existe; si no, Simple Icons monocromo teñido.
 */
export function vehicleBrandLogoUrl(brandRaw: string | null | undefined): string | null {
  const slug = resolveVehicleBrandIconSlug(brandRaw);
  if (!slug) return null;
  const commons = SLUG_FULLCOLOR_COMMONS_SVG[slug];
  if (commons) return commons;
  const hex = SLUG_HEX[slug] ?? '242424';
  return `${CDN_BASE}/${encodeURIComponent(slug)}/${hex}`;
}

export function isTrustedVehicleBrandIconUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.origin === 'https://cdn.simpleicons.org') return true;
    return u.origin === 'https://upload.wikimedia.org' && ALLOWED_FULLCOLOR_COMMONS_PATHS.has(u.pathname);
  } catch {
    return false;
  }
}
