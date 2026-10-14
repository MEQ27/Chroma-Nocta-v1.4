/**
 * TYPE-ESCAPE RATCHET CHECK (Suite #12)
 *
 * Scans src/ files via TypeScript Compiler API (AST) for type-safety escapes:
 * - any: SyntaxKind.AnyKeyword
 * - asCast: AsExpression (excluding 'const') and TypeAssertionExpression (<T>x in .ts)
 * - asConst: AsExpression whose type is 'const' TypeReference
 * - nonNull: NonNullExpression (x!)
 * - tsDirective: ts-ignore, ts-nocheck, ts-expect-error compiler directives
 *
 * Note: 'as any' counts once in asCast AND once in any.
 * 'satisfies', 'unknown', and type predicates ('x is T') are NOT escapes.
 */

import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type EscapeCategory = 'any' | 'asCast' | 'asConst' | 'nonNull' | 'tsDirective';

export interface EscapeHit {
  readonly category: EscapeCategory;
  readonly line: number;
  readonly text: string;
}

export const CATEGORIES: readonly EscapeCategory[] = [
  'any',
  'asCast',
  'asConst',
  'nonNull',
  'tsDirective',
];

export const ZERO_LOCK: readonly string[] = [
  'src/lib/siteTime.ts',
  'src/lib/nightWindow.ts',
  'src/lib/windowClusters.ts',
  'src/components/tabs/NightCalendarTab.tsx',
  'src/lib/calendarNames.ts',
  'src/lib/clusterBuffer.ts',
  'src/lib/errors.ts',
  'src/lib/deviceStorage.ts',
  'src/lib/weatherService.ts',
  'src/lib/ephemeris.ts',
  'src/lib/theme.ts',
  'src/lib/imageStorage.ts',
  'src/App.tsx',
  'src/components/NeedsTimeZone.tsx',
  'src/components/SettingsModal.tsx',
  'src/components/tabs/RouteTab.tsx',
  'src/lib/navigationBridge.ts',
  'src/main.tsx',
  'src/components/LocationModal.tsx',
  'src/components/tabs/FieldWeatherTab.tsx',
  'src/components/tabs/SkyVizorTab.tsx',
  'src/lib/selfCheck.ts',
  'src/lib/useWakeLock.ts',
  'src/lib/splinePath.ts',
  'src/components/AltitudeCurve.tsx',
  'src/lib/nightScore.ts',
  'src/components/tabs/TargetOpsTab.tsx',
  'src/lib/targetOpsEngine.ts',
  'src/lib/starAlignmentEngine.ts',
];

export type Baseline = Readonly<Record<string, Readonly<Partial<Record<EscapeCategory, number>>>>>;

export interface FileScanResult {
  readonly file: string;
  readonly hits: readonly EscapeHit[];
  readonly counts: Record<EscapeCategory, number>;
}

export interface RatchetFinding {
  readonly file: string;
  readonly category: EscapeCategory;
  readonly kind: 'over' | 'stale';
  readonly actual: number;
  readonly expected: number;
  readonly hits: readonly EscapeHit[];
}

export function compareToBaseline(
  scan: readonly FileScanResult[],
  baseline: Baseline
): readonly RatchetFinding[] {
  const allTrackedFiles: string[] = [];
  for (const res of scan) {
    if (!allTrackedFiles.includes(res.file)) {
      allTrackedFiles.push(res.file);
    }
  }
  for (const baseFile of Object.keys(baseline)) {
    if (!allTrackedFiles.includes(baseFile)) {
      allTrackedFiles.push(baseFile);
    }
  }
  allTrackedFiles.sort();

  const findings: RatchetFinding[] = [];

  for (const trackFile of allTrackedFiles) {
    const baseEntry = baseline[trackFile];
    let fileResult: FileScanResult | null = null;
    for (const res of scan) {
      if (res.file === trackFile) {
        fileResult = res;
        break;
      }
    }

    for (const cat of CATEGORIES) {
      const actualCount = fileResult !== null ? fileResult.counts[cat] : 0;
      const expectedCount =
        baseEntry !== null && baseEntry !== undefined && baseEntry[cat] !== undefined
          ? baseEntry[cat]
          : 0;

      if (actualCount > expectedCount) {
        const matchingHits: EscapeHit[] = [];
        if (fileResult !== null) {
          for (const h of fileResult.hits) {
            if (h.category === cat) {
              matchingHits.push(h);
            }
          }
        }
        findings.push({
          file: trackFile,
          category: cat,
          kind: 'over',
          actual: actualCount,
          expected: expectedCount,
          hits: matchingHits,
        });
      } else if (actualCount < expectedCount) {
        findings.push({
          file: trackFile,
          category: cat,
          kind: 'stale',
          actual: actualCount,
          expected: expectedCount,
          hits: [],
        });
      }
    }
  }

  return findings;
}

export function makeFileScan(
  file: string,
  hits: readonly EscapeHit[],
  counts?: Partial<Record<EscapeCategory, number>>
): FileScanResult {
  return {
    file,
    hits,
    counts: {
      any: counts?.any !== undefined ? counts.any : 0,
      asCast: counts?.asCast !== undefined ? counts.asCast : 0,
      asConst: counts?.asConst !== undefined ? counts.asConst : 0,
      nonNull: counts?.nonNull !== undefined ? counts.nonNull : 0,
      tsDirective: counts?.tsDirective !== undefined ? counts.tsDirective : 0,
    },
  };
}

export const BASELINE: Baseline = {};

function isConstTypeReference(typeNode: ts.TypeNode): boolean {
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName;
    if (ts.isIdentifier(typeName)) {
      return typeName.text === 'const';
    }
  }
  return false;
}

export function scanTypeEscapes(fileName: string, source: string): readonly EscapeHit[] {
  const isTsx = fileName.endsWith('.tsx');
  const scriptKind = isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);

  const hits: EscapeHit[] = [];

  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const text = node.getText(sourceFile).trim().replace(/\s+/g, ' ');
      hits.push({ category: 'any', line, text });
    }

    if (ts.isAsExpression(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const text = node.getText(sourceFile).trim().replace(/\s+/g, ' ');
      if (isConstTypeReference(node.type)) {
        hits.push({ category: 'asConst', line, text });
      } else {
        hits.push({ category: 'asCast', line, text });
      }
    } else if (!isTsx && ts.isTypeAssertionExpression(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const text = node.getText(sourceFile).trim().replace(/\s+/g, ' ');
      hits.push({ category: 'asCast', line, text });
    }

    if (ts.isNonNullExpression(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const text = node.getText(sourceFile).trim().replace(/\s+/g, ' ');
      hits.push({ category: 'nonNull', line, text });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const DIRECTIVE_REGEX = /\/\/\s*@ts-(?:ignore|nocheck|expect-error)|\/\*[\s\S]*?@ts-(?:ignore|nocheck|expect-error)/;
  const seenCommentPos = new Set<number>();
  function scanComments(node: ts.Node): void {
    ts.forEachLeadingCommentRange(source, node.pos, (pos, end) => {
      if (!seenCommentPos.has(pos)) {
        seenCommentPos.add(pos);
        const text = source.slice(pos, end);
        if (DIRECTIVE_REGEX.test(text)) {
          const line = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
          hits.push({ category: 'tsDirective', line, text: text.trim().replace(/\s+/g, ' ') });
        }
      }
    });
    ts.forEachTrailingCommentRange(source, node.pos, (pos, end) => {
      if (!seenCommentPos.has(pos)) {
        seenCommentPos.add(pos);
        const text = source.slice(pos, end);
        if (DIRECTIVE_REGEX.test(text)) {
          const line = sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
          hits.push({ category: 'tsDirective', line, text: text.trim().replace(/\s+/g, ' ') });
        }
      }
    });
    ts.forEachChild(node, scanComments);
  }
  scanComments(sourceFile);

  return hits;
}

function collectSourceFiles(dir: string, fileList: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        collectSourceFiles(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      const name = entry.name;
      if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts')) {
        fileList.push(fullPath);
      }
    }
  }
}

if (process.argv[1]?.endsWith('type-escape-check.ts')) {
  const args = process.argv.slice(2);
  const printBaselineMode = args.includes('--print-baseline');

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '..');
  const srcDir = path.resolve(projectRoot, 'src');

  const allSrcFiles: string[] = [];
  collectSourceFiles(srcDir, allSrcFiles);

const relativeFiles: string[] = [];
for (const f of allSrcFiles) {
  const rel = path.relative(projectRoot, f).split(path.sep).join('/');
  relativeFiles.push(rel);
}
relativeFiles.sort();

const scanResults: FileScanResult[] = [];
const grandTotals: Record<EscapeCategory, number> = {
  any: 0,
  asCast: 0,
  asConst: 0,
  nonNull: 0,
  tsDirective: 0,
};

for (const rel of relativeFiles) {
  const fullPath = path.resolve(projectRoot, rel);
  const content = fs.readFileSync(fullPath, 'utf8');
  const fileHits = scanTypeEscapes(rel, content);

  const fileCounts: Record<EscapeCategory, number> = {
    any: 0,
    asCast: 0,
    asConst: 0,
    nonNull: 0,
    tsDirective: 0,
  };

  for (const h of fileHits) {
    fileCounts[h.category] += 1;
    grandTotals[h.category] += 1;
  }

  scanResults.push({
    file: rel,
    hits: fileHits,
    counts: fileCounts,
  });
}

if (printBaselineMode) {
  console.log('export const BASELINE: Readonly<Record<string, Readonly<Partial<Record<EscapeCategory, number>>>>> = {');
  for (const res of scanResults) {
    const entries: string[] = [];
    for (const cat of CATEGORIES) {
      const n = res.counts[cat];
      if (n > 0) {
        entries.push(`${cat}: ${n}`);
      }
    }
    if (entries.length > 0) {
      console.log(`  '${res.file}': { ${entries.join(', ')} },`);
    }
  }
  console.log('};');
  process.exit(0);
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  CHROMA NOCTA — TİP KAÇIŞI VE GÜVENLİK AUDIT KONTROLÜ (Suite #12)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function assert(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  🟢 [GEÇTİ] ${description}`);
    passCount += 1;
  } else {
    console.error(`  ❌ [BAŞARISIZ] ${description} ${detail ? `(${detail})` : ''}`);
    failCount += 1;
  }
}

console.log('─── TARAYICI ÖZ TESTLERİ (S1–S14) ───');

function countCategory(hits: readonly EscapeHit[], category: EscapeCategory): number {
  let count = 0;
  for (const h of hits) {
    if (h.category === category) {
      count += 1;
    }
  }
  return count;
}

// S1: const a: any = 1; -> any=1
{
  const hits = scanTypeEscapes('test.ts', 'const a: any = 1;');
  assert('S1: const a: any = 1; -> any=1', countCategory(hits, 'any') === 1);
}

// S2: const b = x as Foo; -> asCast=1, asConst=0
{
  const hits = scanTypeEscapes('test.ts', 'const b = x as Foo;');
  assert(
    'S2: const b = x as Foo; -> asCast=1, asConst=0',
    countCategory(hits, 'asCast') === 1 && countCategory(hits, 'asConst') === 0
  );
}

// S3: const c = [1, 2] as const; -> asConst=1, asCast=0
{
  const hits = scanTypeEscapes('test.ts', 'const c = [1, 2] as const;');
  assert(
    'S3: const c = [1, 2] as const; -> asConst=1, asCast=0',
    countCategory(hits, 'asConst') === 1 && countCategory(hits, 'asCast') === 0
  );
}

// S4: const d = <Foo>x; as a .ts file -> asCast=1
{
  const hits = scanTypeEscapes('test.ts', 'const d = <Foo>x;');
  assert('S4: const d = <Foo>x; (.ts dosyası) -> asCast=1', countCategory(hits, 'asCast') === 1);
}

// S5: import { A as B } from 'm'; export { B as C }; import * as ns from 'm'; -> all categories 0
{
  const hits = scanTypeEscapes(
    'test.ts',
    "import { A as B } from 'm'; export { B as C }; import * as ns from 'm';"
  );
  assert('S5: import/export as sözdizimleri -> tüm kategoriler 0', hits.length === 0);
}

// S6: // as any\nconst s = "x as any: any"; const t = `as Foo ${1}`; -> all categories 0
{
  const hits = scanTypeEscapes(
    'test.ts',
    '// as any\nconst s = "x as any: any"; const t = `as Foo ${1}`;'
  );
  assert('S6: Yorum ve dize içerisindeki sahte anahtar kelimeler -> tüm kategoriler 0', hits.length === 0);
}

// S7: a .tsx file with JSX text <p>treated as any reference</p> -> all categories 0
{
  const hits = scanTypeEscapes('test.tsx', 'const el = <p>treated as any reference</p>;');
  assert('S7: JSX metni (.tsx dosyası) -> tüm kategoriler 0', hits.length === 0);
}

// S8: type R = Record<string, any>; type L = any[]; interface I { [key: string]: any } -> any=3
{
  const hits = scanTypeEscapes(
    'test.ts',
    'type R = Record<string, any>; type L = any[]; interface I { [key: string]: any }'
  );
  assert('S8: Tiplerde any kullanımı -> any=3', countCategory(hits, 'any') === 3);
}

// S9: try {} catch (e: any) {} -> any=1
{
  const hits = scanTypeEscapes('test.ts', 'try {} catch (e: any) {}');
  assert('S9: catch (e: any) -> any=1', countCategory(hits, 'any') === 1);
}

// S10: const e = y!; const f = z!.w; const g = h![0]; -> nonNull=3; and let q!: number; -> nonNull=0
{
  const hits = scanTypeEscapes(
    'test.ts',
    'const e = y!; const f = z!.w; const g = h![0]; let q!: number;'
  );
  assert(
    'S10: Non-null ifadeleri (!) -> nonNull=3 ve definite assignment let q!: number -> nonNull=0',
    countCategory(hits, 'nonNull') === 3
  );
}

// S11: ts-ignore, ts-nocheck, ts-expect-error -> tsDirective=3
{
  const hits = scanTypeEscapes(
    'test.ts',
    '// @ts-ignore\nconst u = 1;\n/* @ts-nocheck */\n// @ts-expect-error x'
  );
  assert('S11: TypeScript direktif yorumları -> tsDirective=3', countCategory(hits, 'tsDirective') === 3);
}

// S12: const v = w as unknown as Foo; -> asCast=2
{
  const hits = scanTypeEscapes('test.ts', 'const v = w as unknown as Foo;');
  assert('S12: İkili dönüşüm (w as unknown as Foo) -> asCast=2', countCategory(hits, 'asCast') === 2);
}

// S13: line numbers: a hit on the 3rd line reports line 3
{
  const hits = scanTypeEscapes('test.ts', 'const x = 1;\nconst y = 2;\nconst z: any = 3;');
  assert('S13: Satır numarası doğrulaması (3. satırdaki hit line 3 verir)', hits.length > 0 && hits[0].line === 3);
}

// S14: scripts/type-escape-check.ts and scripts/core-boundary-check.ts have zero hits in all categories
{
  const checkScripts = [
    path.resolve(projectRoot, 'scripts/type-escape-check.ts'),
    path.resolve(projectRoot, 'scripts/core-boundary-check.ts'),
  ];
  let totalSelfHits = 0;
  let selfScanned = 0;
  for (const full of checkScripts) {
    if (fs.existsSync(full)) {
      const src = fs.readFileSync(full, 'utf8');
      totalSelfHits += scanTypeEscapes(full, src).length;
      selfScanned += 1;
    }
  }
  assert(
    'S14: scripts/type-escape-check.ts ve scripts/core-boundary-check.ts içinde sıfır tip kaçışı (öz denetim)',
    totalSelfHits === 0 && selfScanned > 0,
    `hits=${totalSelfHits}`
  );
}

// S15: equal scan/baseline -> no findings
{
  let passed = false;
  try {
    const scan: FileScanResult[] = [makeFileScan('a.ts', [], { any: 1 })];
    const base: Baseline = { 'a.ts': { any: 1 } };
    const findings = compareToBaseline(scan, base);
    passed = findings.length === 0;
  } catch {}
  assert('S15: Eşit tarama ve baseline -> bulgu yok', passed);
}

// S16: count above baseline -> one 'over' finding with correct actual/expected and the hit lines carried
{
  let passed = false;
  try {
    const hit: EscapeHit = { category: 'any', line: 12, text: 'let x: any' };
    const scan: FileScanResult[] = [makeFileScan('a.ts', [hit], { any: 2 })];
    const base: Baseline = { 'a.ts': { any: 1 } };
    const findings = compareToBaseline(scan, base);
    passed =
      findings.length === 1 &&
      findings[0].file === 'a.ts' &&
      findings[0].category === 'any' &&
      findings[0].kind === 'over' &&
      findings[0].actual === 2 &&
      findings[0].expected === 1 &&
      findings[0].hits.length === 1 &&
      findings[0].hits[0].line === 12;
  } catch {}
  assert('S16: Baseline üstü sayaç -> doğru gerçek/beklenen değerleri ve satır bilgisiyle over bulgusu', passed);
}

// S17: count below baseline -> one 'stale' finding with correct actual/expected
{
  let passed = false;
  try {
    const scan: FileScanResult[] = [makeFileScan('a.ts', [], { any: 0 })];
    const base: Baseline = { 'a.ts': { any: 2 } };
    const findings = compareToBaseline(scan, base);
    passed =
      findings.length === 1 &&
      findings[0].file === 'a.ts' &&
      findings[0].category === 'any' &&
      findings[0].kind === 'stale' &&
      findings[0].actual === 0 &&
      findings[0].expected === 2;
  } catch {}
  assert('S17: Baseline altı sayaç -> doğru gerçek/beklenen değerleriyle stale bulgusu', passed);
}

// S18: file in scan but absent from baseline, with hits -> 'over' with expected 0
{
  let passed = false;
  try {
    const hit: EscapeHit = { category: 'asCast', line: 5, text: 'x as Y' };
    const scan: FileScanResult[] = [makeFileScan('new.ts', [hit], { asCast: 1 })];
    const base: Baseline = {};
    const findings = compareToBaseline(scan, base);
    passed =
      findings.length === 1 &&
      findings[0].file === 'new.ts' &&
      findings[0].category === 'asCast' &&
      findings[0].kind === 'over' &&
      findings[0].actual === 1 &&
      findings[0].expected === 0;
  } catch {}
  assert('S18: Taramada var baseline içinde yok (ihlalli) -> beklenen 0 ile over bulgusu', passed);
}

// S19: file in baseline but absent from scan -> 'stale' with actual 0
{
  let passed = false;
  try {
    const scan: FileScanResult[] = [];
    const base: Baseline = { 'old.ts': { nonNull: 3 } };
    const findings = compareToBaseline(scan, base);
    passed =
      findings.length === 1 &&
      findings[0].file === 'old.ts' &&
      findings[0].category === 'nonNull' &&
      findings[0].kind === 'stale' &&
      findings[0].actual === 0 &&
      findings[0].expected === 3;
  } catch {}
  assert('S19: Baseline içinde var taramada yok -> gerçek 0 ile stale bulgusu', passed);
}

// S20: two categories in one file, one over and one equal -> exactly one finding for the right category
{
  let passed = false;
  try {
    const hit: EscapeHit = { category: 'any', line: 10, text: 'any' };
    const scan: FileScanResult[] = [makeFileScan('mix.ts', [hit], { any: 2, asConst: 1 })];
    const base: Baseline = { 'mix.ts': { any: 1, asConst: 1 } };
    const findings = compareToBaseline(scan, base);
    passed =
      findings.length === 1 &&
      findings[0].file === 'mix.ts' &&
      findings[0].category === 'any' &&
      findings[0].kind === 'over';
  } catch {}
  assert('S20: Aynı dosyada biri fazla biri eşit iki kategori -> tam olarak ilgili kategori için tek bulgu', passed);
}

console.log('\n─── KATEGORİ BAZINDA TOPLAM (src/) ───');
console.log(`  any: ${grandTotals.any}`);
console.log(`  asCast: ${grandTotals.asCast}`);
console.log(`  asConst: ${grandTotals.asConst}`);
console.log(`  nonNull: ${grandTotals.nonNull}`);
console.log(`  tsDirective: ${grandTotals.tsDirective}`);
const totalEscapes =
  grandTotals.any +
  grandTotals.asCast +
  grandTotals.asConst +
  grandTotals.nonNull +
  grandTotals.tsDirective;
console.log(`  TOPLAM: ${totalEscapes}`);

console.log('\n─── DOSYA BAZINDA TİP KAÇIŞI TABLOSU (src/) ───');
for (const res of scanResults) {
  const sum =
    res.counts.any +
    res.counts.asCast +
    res.counts.asConst +
    res.counts.nonNull +
    res.counts.tsDirective;
  if (sum > 0) {
    console.log(
      `  ${res.file.padEnd(42)} | any:${String(res.counts.any).padStart(2)} | asCast:${String(res.counts.asCast).padStart(2)} | asConst:${String(res.counts.asConst).padStart(2)} | nonNull:${String(res.counts.nonNull).padStart(2)} | tsDirective:${String(res.counts.tsDirective).padStart(2)} | TOPLAM: ${sum}`
    );
  }
}

console.log('\n─── ZERO_LOCK KONTROLÜ (SIFIR KAÇIŞ ZORUNLU DOSYALAR) ───');
for (const zeroFile of ZERO_LOCK) {
  let fileHits: readonly EscapeHit[] = [];
  for (const res of scanResults) {
    if (res.file === zeroFile) {
      fileHits = res.hits;
      break;
    }
  }

  if (fileHits.length === 0) {
    assert(`ZERO_LOCK: ${zeroFile} tam olarak sıfır kaçış içerir`, true);
  } else {
    const hitDetails: string[] = [];
    for (const h of fileHits) {
      hitDetails.push(`${zeroFile}:${h.line} [${h.category}] "${h.text}"`);
    }
    assert(
      `ZERO_LOCK: ${zeroFile} sıfır kaçış içermelidir`,
      false,
      `Bulunan ihlaller:\n    ${hitDetails.join('\n    ')}`
    );
  }
}

console.log('\n─── RATCHET KONTROLÜ (BASELINE KARŞILAŞTIRMASI) ───');

// Collect all tracked files present in either scan or baseline
const allTrackedFiles: string[] = [];
for (const res of scanResults) {
  if (!allTrackedFiles.includes(res.file)) {
    allTrackedFiles.push(res.file);
  }
}
for (const baseFile of Object.keys(BASELINE)) {
  if (!allTrackedFiles.includes(baseFile)) {
    allTrackedFiles.push(baseFile);
  }
}
allTrackedFiles.sort();
const cellCount = allTrackedFiles.length * CATEGORIES.length;

const findings = compareToBaseline(scanResults, BASELINE);

if (findings.length === 0) {
  assert(
    `Ratchet: ${cellCount} hücre (dosya x kategori) baseline ile birebir eşleşti`,
    true
  );
} else {
  for (const f of findings) {
    if (f.kind === 'over') {
      const offendingHits: string[] = [];
      for (const h of f.hits) {
        offendingHits.push(`${f.file}:${h.line} ${f.category} "${h.text}"`);
      }
      assert(
        `Ratchet ihlali: ${f.file} [${f.category}]`,
        false,
        `${f.actual} > ${f.expected}\n    ${offendingHits.join('\n    ')}`
      );
    } else {
      assert(
        `Ratchet bayat baseline: ${f.file} [${f.category}]`,
        false,
        `stale baseline: lower ${f.file} ${f.category} from ${f.expected} to ${f.actual}`
      );
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(`  SONUÇ: ${passCount} geçti, ${failCount} başarısız.`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exitCode = 1;
}
}

