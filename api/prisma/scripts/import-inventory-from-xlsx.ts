/**
 * Importa inventario desde Excel: borra ítems existentes y crea filas nuevas.
 * El **SKU** se toma de la columna del archivo (ej. VEN-SEN-01). Se normaliza el sufijo numérico a ≥2 dígitos (…-01).
 * Máx. 80 caracteres.
 *
 * Formato 6 columnas: Proveedor/Provedor | Categoría/Categoria | Producto |
 * Detalle | Cantidad/Empaque | SKU.
 *
 * Formato legacy 5 columnas: Proveedor/Categoría | Producto | Detalle | Cantidad | SKU.
 *
 *   cd api && npx prisma generate && npm run prisma:import-inventory-xlsx
 *
 * Opcional: `XLSX_PATH=ruta\al\archivo.xlsx`
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { normalizeInventorySkuNumeracion } from '../../src/modules/inventory/inventory.constants';

const MAX_NAME = 200;
const MAX_LABEL = 200;
const MAX_SKU = 80;

function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v)
    .trim()
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ');
}

function detectSixColumnLayout(headerRow: unknown[]): boolean {
  const cells = (headerRow || []).map(cellStr);
  const joined = cells.map(normHeader).join(' ');
  if (cells.filter((c) => c.length > 0).length < 6) {
    return false;
  }
  const hasProv = /proveedor|provedor|supplier/.test(joined);
  const hasCat = /categor/.test(joined);
  const hasProd = /producto/.test(joined);
  return hasProv && hasCat && hasProd;
}

function unitSlugFromContext(packCell: string, product: string, detail: string, category: string, supplier: string): string {
  const pack = (packCell || '').toLowerCase();
  if (pack.includes('juego')) return 'set';
  if (pack.includes('cuarto')) return 'gallon';
  if (pack.includes('galón') || pack.includes('galon')) return 'gallon';
  if (pack.includes('litro')) return 'liter';
  if (pack.includes('par')) return 'pair';
  if (pack.includes('caja')) return 'box';
  if (pack.includes('metro')) return 'meter';
  if (pack.includes('kg') || pack.includes('kilo')) return 'kg';

  const blob = `${product} ${detail} ${category} ${supplier}`.toLowerCase();
  if (blob.includes('galón') || blob.includes('galon')) return 'gallon';
  if (blob.includes('litro')) return 'liter';
  if (blob.includes('aceite') && (blob.includes('caneca') || blob.includes('garraf'))) return 'gallon';

  return 'unit';
}

function buildName(product: string, detail: string): string {
  const p = (product || '').trim();
  const d = (detail || '').trim();
  let base = p;
  if (d && d !== '-' && d !== '—') {
    base = `${p} — ${d}`;
  }
  if (base.length > MAX_NAME) {
    base = `${base.slice(0, MAX_NAME - 3)}...`;
  }
  return base;
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3)}...`;
}

async function wipeInventoryCatalog(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.deleteMany({});
    await tx.purchaseReceiptLine.deleteMany({});
    await tx.purchaseReceipt.deleteMany({});
    await tx.workOrderLine.updateMany({
      where: { inventoryItemId: { not: null } },
      data: { inventoryItemId: null },
    });
    await tx.inventoryItem.deleteMany({});
  });
}

async function main() {
  const defaultPath = path.join(
    __dirname,
    '..',
    'data',
    'Inventario_VENE_AUTOS_con_SKU_actualizado.xlsx',
  );
  const filePath = process.env.XLSX_PATH?.trim() || defaultPath;
  if (!fs.existsSync(filePath)) {
    // eslint-disable-next-line no-console
    console.error('No existe el archivo:', filePath);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const units = await prisma.measurementUnit.findMany({ select: { id: true, slug: true } });
  const unitBySlug = new Map(units.map((u) => [u.slug, u.id]));
  const defaultUnitId = unitBySlug.get('unit');
  if (!defaultUnitId) {
    // eslint-disable-next-line no-console
    console.error('Falta measurement_unit slug "unit". Ejecutá prisma:seed.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (rows.length < 2) {
    // eslint-disable-next-line no-console
    console.error('El Excel no tiene filas de datos.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const headerRow = rows[0] || [];
  const six = detectSixColumnLayout(headerRow);

  // eslint-disable-next-line no-console
  console.log(`Layout detectado: ${six ? '6 columnas (proveedor + categoría)' : '5 columnas (legacy)'}`);

  await wipeInventoryCatalog(prisma);

  let created = 0;
  let skipped = 0;
  const seenSku = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let supplier: string;
    let category: string;
    let product: string;
    let detail: string;
    let packCell: string;
    let skuRaw: string;

    if (six) {
      supplier = cellStr(row[0]);
      category = cellStr(row[1]);
      product = cellStr(row[2]);
      detail = cellStr(row[3]);
      packCell = cellStr(row[4]);
      skuRaw = cellStr(row[5]);
    } else {
      const combined = cellStr(row[0]);
      supplier = combined;
      category = combined;
      product = cellStr(row[1]);
      detail = cellStr(row[2]);
      packCell = cellStr(row[3]);
      skuRaw = cellStr(row[4]);
    }

    let sku = normalizeInventorySkuNumeracion(skuRaw);
    if (!sku) {
      skipped++;
      continue;
    }
    if (sku.length > MAX_SKU) {
      sku = sku.slice(0, MAX_SKU);
    }
    if (seenSku.has(sku)) {
      // eslint-disable-next-line no-console
      console.warn(`Fila ${i + 1}: SKU duplicado en el Excel "${sku}", se omite.`);
      skipped++;
      continue;
    }
    seenSku.add(sku);

    const name = buildName(product, detail);
    if (!name) {
      seenSku.delete(sku);
      skipped++;
      continue;
    }

    const slug = unitSlugFromContext(packCell, product, detail, category, supplier);
    const measurementUnitId = unitBySlug.get(slug) ?? defaultUnitId;

    await prisma.inventoryItem.create({
      data: {
        sku,
        supplier: clip(supplier, MAX_LABEL),
        category: clip(category, MAX_LABEL),
        name,
        measurementUnitId,
        quantityOnHand: 0,
        trackStock: true,
        isActive: true,
      },
    });
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Import inventario OK. Ítems creados: ${created}, omitidos (sin SKU, sin nombre o SKU repetido): ${skipped}.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
