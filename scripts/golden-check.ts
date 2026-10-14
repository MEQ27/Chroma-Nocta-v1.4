/**
 * Komut satırı çalıştırıcı. Kullanım (proje kökünde):  npx tsx scripts/golden-check.ts
 * Sonuç kodu 1 ise KORUMA grubunda bozulma var demektir.
 */
import { runSelfCheck, formatReport } from '../src/lib/selfCheck';

declare const process: { exit(code: number): never };

const report = runSelfCheck();
console.log(formatReport(report));
process.exit(report.koruma.fail > 0 ? 1 : 0);
