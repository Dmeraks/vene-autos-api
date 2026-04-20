/**
 * Iconos de marca vía Simple Icons CDN (SVG, color configurable).
 * https://github.com/simple-icons/simple-icons — uso de logo sujeto a marca registrada del titular.
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

/** Color por slug (hex sin #) para “logo a color” reconocible en impresión */
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
 * URL PNG/SVG servida por Simple Icons CDN (liviana; sin dependencias en el servidor).
 */
export function vehicleBrandLogoUrl(brandRaw: string | null | undefined): string | null {
  const slug = resolveVehicleBrandIconSlug(brandRaw);
  if (!slug) return null;
  const hex = SLUG_HEX[slug] ?? '242424';
  return `${CDN_BASE}/${encodeURIComponent(slug)}/${hex}`;
}

export function isTrustedVehicleBrandIconUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === 'https://cdn.simpleicons.org';
  } catch {
    return false;
  }
}
