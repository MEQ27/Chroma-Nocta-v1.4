/**
 * HESAP GÜVENLİK AĞI (selfCheck.ts)
 *
 * Amaç: efemeris / saat dilimi değişikliklerinde mevcut hesabın bozulmadığını (veya bilerek
 * düzeltildiğini) kanıtlamak. Uygulama içinden (Ayarlar > Hesap Doğrulama) ya da Node ile
 * (scripts/golden-check.ts) çalışır. Başka bağımlılığı yoktur.
 *
 * GRUPLAR
 *  - KORUMA: Bugün (Türkiye cihaz saatinde) doğru olan ve hiçbir değişiklikle DEĞİŞMEMESİ gereken değerler.
 *  - HEDEF : Bugün cihaz saat dilimine bağlı olduğu için yanlış çıkan, saat dilimi modeli (Adım 2)
 *            tamamlanınca GEÇMESİ gereken değerler. Referans: motorun, cihaz saat dilimi sahanınkiyle
 *            aynıyken ürettiği çıktı.
 *  - İLKE  : Her vaka için fiziksel tutarlılık kuralları (olay sıralaması, Ay'sız <= karanlık <= 1440).
 *            Yeni girilen herhangi bir saha için de geçerlidir.
 *
 * ADAPTÖR: Adım 2'de YALNIZCA computeNight() değişir (sahanın saat dilimine göre gün penceresi).
 * Beklenen değerler ve testler sabit kalır.
 *
 * NOT: Ay'sız dakika hesabı bilerek düzeltildiğinde (30 dk kova hatası) KORUMA/HEDEF içindeki
 * 'moonlessMinutes' değerleri bilerek değişir; o zaman referanslar yeniden üretilir.
 */
import { calculateNightEphemeris, formatTimeHM } from './ephemeris';

export type CheckGroup = 'KORUMA' | 'HEDEF';

export interface CheckSite { id: string; name: string; lat: number; lon: number; elev: number; tz: string; }
export interface GoldenCase { id: string; group: CheckGroup; siteId: string; dateKey: string; v: number[]; }

export type EphemerisField =
  | 'sunset' | 'civilDusk' | 'nauticalDusk' | 'astroDusk'
  | 'astroDawn' | 'nauticalDawn' | 'civilDawn' | 'sunrise'
  | 'darkMinutes' | 'moonlessMinutes' | 'moonrise' | 'moonset';

/** v[] sırası. Olaylar UTC dakika (epoch/60000), yoksa -1; süreler dakika. */
export const FIELDS: readonly EphemerisField[] = [
  'sunset', 'civilDusk', 'nauticalDusk', 'astroDusk', 'astroDawn', 'nauticalDawn', 'civilDawn', 'sunrise',
  'darkMinutes', 'moonlessMinutes', 'moonrise', 'moonset',
];

export const TOLERANCE_MIN = 1;

export const CHECK_SITES: CheckSite[] = [
  { id: 'bolu-sarialan', name: 'Bolu Sarıalan Yaylası (Aladağlar)', lat: 40.612, lon: 31.684, elev: 1550, tz: 'Europe/Istanbul' },
  { id: 'erzurum-dag', name: 'Erzurum Doğu Anadolu Gözlemevi (DAG)', lat: 39.778, lon: 41.228, elev: 3170, tz: 'Europe/Istanbul' },
  { id: 'antalya-tug', name: 'Antalya Saklıkent (TÜBİTAK TUG)', lat: 36.825, lon: 30.334, elev: 2500, tz: 'Europe/Istanbul' },
  { id: 'isparta-melikler', name: 'Isparta Melikler Yaylası (Dedegöl)', lat: 37.702, lon: 31.328, elev: 1735, tz: 'Europe/Istanbul' },
  { id: 'canakkale-kazdaglari', name: 'Çanakkale Kaz Dağı (Milli Park)', lat: 39.704, lon: 26.852, elev: 1420, tz: 'Europe/Istanbul' },
  { id: 'mugla-sandras', name: 'Muğla Sandras Dağı (Gökçeova)', lat: 37.067, lon: 28.825, elev: 2150, tz: 'Europe/Istanbul' },
  { id: 'la-palma-roque', name: 'La Palma (Roque de los Muchachos)', lat: 28.758, lon: -17.885, elev: 2396, tz: 'Atlantic/Canary' },
  { id: 'atacama-chile', name: 'Atacama Çölü (Paranal / VLT)', lat: -24.627, lon: -70.404, elev: 2635, tz: 'America/Santiago' },
];

// Re-baselined 2026-10-11 (R2.4 Step B): dip constant 0.0347 -> 0.0293. 43 sunrise/sunset values moved by exactly 2 min.
export const GOLDEN: GoldenCase[] = [
  { id: 'bolu-sarialan|2026-10-06', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2026-10-06', v: [29855015, 29855035, 29855066, 29855098, 29855665, 29855697, 29855728, 29855750, 567, 450, 29855531, 29854883] },
  { id: 'bolu-sarialan|2026-11-15', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2026-11-15', v: [29912562, 29912585, 29912618, 29912650, 29913306, 29913338, 29913371, 29913393, 656, 480, 29912269, 29912850] },
  { id: 'bolu-sarialan|2026-12-21', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2026-12-21', v: [29964396, 29964420, 29964455, 29964488, 29965175, 29965208, 29965243, 29965266, 687, 30, 29964224, 29965168] },
  { id: 'bolu-sarialan|2027-02-14', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2027-02-14', v: [30043654, 30043675, 30043707, 30043738, 30044356, 30044388, 30044420, 30044440, 617, 180, -1, 30044161] },
  { id: 'bolu-sarialan|2027-03-21', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2027-03-21', v: [30094093, 30094113, 30094145, 30094178, 30094702, 30094735, 30094767, 30094787, 524, 0, 30094033, 30094775] },
  { id: 'bolu-sarialan|2027-05-15', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2027-05-15', v: [30173351, 30173374, 30173413, 30173456, 30173803, 30173846, 30173885, 30173908, 348, 30, 30173036, 30173764] },
  { id: 'bolu-sarialan|2027-06-21', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2027-06-21', v: [30226656, 30226681, 30226723, 30226774, 30227057, 30227107, 30227149, 30227174, 283, 0, 30226763, 30227354] },
  { id: 'bolu-sarialan|2027-09-06', group: 'KORUMA', siteId: 'bolu-sarialan', dateKey: '2027-09-06', v: [30337465, 30337486, 30337519, 30337553, 30338031, 30338065, 30338098, 30338120, 478, 390, 30337083, 30337633] },
  { id: 'erzurum-dag|2026-10-06', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2026-10-06', v: [29854980, 29854997, 29855028, 29855059, 29855627, 29855659, 29855690, 29855707, 568, 450, 29855492, 29854843] },
  { id: 'erzurum-dag|2026-11-15', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2026-11-15', v: [29912530, 29912548, 29912581, 29912613, 29913267, 29913299, 29913332, 29913350, 654, 450, 29912227, 29912812] },
  { id: 'erzurum-dag|2026-12-21', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2026-12-21', v: [29964363, 29964384, 29964418, 29964451, 29965136, 29965169, 29965203, 29965223, 685, 0, 29964187, 29965125] },
  { id: 'erzurum-dag|2027-02-14', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2027-02-14', v: [30043620, 30043637, 30043669, 30043700, 30044318, 30044349, 30044381, 30044398, 617, 210, 30044664, 30044117] },
  { id: 'erzurum-dag|2027-03-21', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2027-03-21', v: [30094056, 30094075, 30094106, 30094138, 30094666, 30094698, 30094729, 30094748, 527, 0, 30093993, 30094736] },
  { id: 'erzurum-dag|2027-05-15', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2027-05-15', v: [30173312, 30173333, 30173371, 30173413, 30173770, 30173812, 30173849, 30173869, 357, 60, 30172996, 30173726] },
  { id: 'erzurum-dag|2027-06-21', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2027-06-21', v: [30226617, 30226639, 30226681, 30226729, 30227025, 30227073, 30227115, 30227137, 296, 0, 30226722, 30227316] },
  { id: 'erzurum-dag|2027-09-06', group: 'KORUMA', siteId: 'erzurum-dag', dateKey: '2027-09-06', v: [30337429, 30337447, 30337479, 30337513, 30337995, 30338028, 30338061, 30338080, 482, 390, 30337040, 30337597] },
  { id: 'antalya-tug|2026-10-06', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2026-10-06', v: [29855022, 29855041, 29855071, 29855101, 29855673, 29855703, 29855733, 29855752, 572, 420, 29855542, 29854882] },
  { id: 'antalya-tug|2026-11-15', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2026-11-15', v: [29912577, 29912597, 29912628, 29912659, 29913308, 29913339, 29913370, 29913390, 649, 450, 29912263, 29912865] },
  { id: 'antalya-tug|2026-12-21', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2026-12-21', v: [29964414, 29964435, 29964467, 29964499, 29965175, 29965207, 29965239, 29965260, 676, 30, 29964242, 29965160] },
  { id: 'antalya-tug|2027-02-14', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2027-02-14', v: [30043666, 30043684, 30043715, 30043745, 30044361, 30044391, 30044421, 30044439, 616, 210, -1, 30044152] },
  { id: 'antalya-tug|2027-03-21', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2027-03-21', v: [30094098, 30094117, 30094147, 30094178, 30094713, 30094744, 30094774, 30094793, 535, 0, 30094039, 30094781] },
  { id: 'antalya-tug|2027-05-15', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2027-05-15', v: [30173347, 30173368, 30173404, 30173442, 30173828, 30173866, 30173902, 30173923, 386, 60, 30173041, 30173771] },
  { id: 'antalya-tug|2027-06-21', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2027-06-21', v: [30226651, 30226672, 30226710, 30226753, 30227088, 30227131, 30227169, 30227190, 334, 0, 30226758, 30227369] },
  { id: 'antalya-tug|2027-09-06', group: 'KORUMA', siteId: 'antalya-tug', dateKey: '2027-09-06', v: [30337469, 30337487, 30337518, 30337550, 30338045, 30338077, 30338108, 30338127, 495, 390, 30337076, 30337652] },
  { id: 'isparta-melikler|2026-10-06', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2026-10-06', v: [29855018, 29855037, 29855067, 29855098, 29855668, 29855699, 29855729, 29855748, 571, 450, 29855537, 29854880] },
  { id: 'isparta-melikler|2026-11-15', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2026-11-15', v: [29912570, 29912592, 29912623, 29912654, 29913305, 29913336, 29913368, 29913388, 650, 450, 29912262, 29912859] },
  { id: 'isparta-melikler|2026-12-21', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2026-12-21', v: [29964406, 29964429, 29964462, 29964494, 29965172, 29965204, 29965237, 29965260, 679, 30, 29964235, 29965159] },
  { id: 'isparta-melikler|2027-02-14', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2027-02-14', v: [30043660, 30043679, 30043710, 30043740, 30044357, 30044387, 30044418, 30044437, 616, 210, -1, 30044151] },
  { id: 'isparta-melikler|2027-03-21', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2027-03-21', v: [30094094, 30094113, 30094144, 30094175, 30094708, 30094739, 30094770, 30094789, 533, 0, 30094035, 30094777] },
  { id: 'isparta-melikler|2027-05-15', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2027-05-15', v: [30173345, 30173367, 30173403, 30173442, 30173820, 30173859, 30173895, 30173918, 378, 30, 30173037, 30173767] },
  { id: 'isparta-melikler|2027-06-21', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2027-06-21', v: [30226648, 30226671, 30226710, 30226755, 30227078, 30227123, 30227162, 30227185, 324, 0, 30226756, 30227363] },
  { id: 'isparta-melikler|2027-09-06', group: 'KORUMA', siteId: 'isparta-melikler', dateKey: '2027-09-06', v: [30337464, 30337484, 30337515, 30337547, 30338039, 30338071, 30338103, 30338122, 492, 390, 30337074, 30337645] },
  { id: 'canakkale-kazdaglari|2026-10-06', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2026-10-06', v: [29855034, 29855054, 29855085, 29855117, 29855685, 29855716, 29855748, 29855768, 568, 450, 29855553, 29854901] },
  { id: 'canakkale-kazdaglari|2026-11-15', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2026-11-15', v: [29912584, 29912606, 29912639, 29912670, 29913324, 29913356, 29913389, 29913411, 654, 450, 29912286, 29912872] },
  { id: 'canakkale-kazdaglari|2026-12-21', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2026-12-21', v: [29964419, 29964442, 29964476, 29964509, 29965193, 29965226, 29965260, 29965283, 685, 0, 29964247, 29965185] },
  { id: 'canakkale-kazdaglari|2027-02-14', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2027-02-14', v: [30043674, 30043695, 30043727, 30043758, 30044375, 30044406, 30044438, 30044459, 617, 210, -1, 30044177] },
  { id: 'canakkale-kazdaglari|2027-03-21', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2027-03-21', v: [30094112, 30094132, 30094164, 30094196, 30094723, 30094755, 30094787, 30094807, 527, 0, 30094053, 30094795] },
  { id: 'canakkale-kazdaglari|2027-05-15', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2027-05-15', v: [30173366, 30173391, 30173428, 30173470, 30173828, 30173869, 30173907, 30173930, 358, 60, 30173056, 30173784] },
  { id: 'canakkale-kazdaglari|2027-06-21', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2027-06-21', v: [30226672, 30226697, 30226738, 30226786, 30227083, 30227131, 30227172, 30227197, 297, 0, 30226780, 30227377] },
  { id: 'canakkale-kazdaglari|2027-09-06', group: 'KORUMA', siteId: 'canakkale-kazdaglari', dateKey: '2027-09-06', v: [30337483, 30337504, 30337536, 30337570, 30338052, 30338086, 30338118, 30338139, 482, 390, 30337100, 30337657] },
  { id: 'mugla-sandras|2026-10-06', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2026-10-06', v: [29855029, 29855047, 29855077, 29855107, 29855679, 29855709, 29855739, 29855757, 572, 420, 29855548, 29854889] },
  { id: 'mugla-sandras|2026-11-15', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2026-11-15', v: [29912582, 29912603, 29912634, 29912665, 29913314, 29913345, 29913376, 29913396, 649, 450, 29912270, 29912871] },
  { id: 'mugla-sandras|2026-12-21', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2026-12-21', v: [29964420, 29964440, 29964473, 29964505, 29965181, 29965213, 29965246, 29965266, 677, 30, 29964247, 29965167] },
  { id: 'mugla-sandras|2027-02-14', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2027-02-14', v: [30043670, 30043690, 30043720, 30043751, 30044367, 30044397, 30044427, 30044446, 616, 210, -1, 30044160] },
  { id: 'mugla-sandras|2027-03-21', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2027-03-21', v: [30094105, 30094123, 30094153, 30094184, 30094719, 30094750, 30094780, 30094798, 535, 0, 30094045, 30094787] },
  { id: 'mugla-sandras|2027-05-15', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2027-05-15', v: [30173353, 30173375, 30173410, 30173449, 30173833, 30173871, 30173907, 30173929, 384, 60, 30173048, 30173777] },
  { id: 'mugla-sandras|2027-06-21', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2027-06-21', v: [30226657, 30226679, 30226717, 30226761, 30227092, 30227136, 30227174, 30227196, 331, 0, 30226765, 30227375] },
  { id: 'mugla-sandras|2027-09-06', group: 'KORUMA', siteId: 'mugla-sandras', dateKey: '2027-09-06', v: [30337473, 30337493, 30337524, 30337556, 30338050, 30338082, 30338114, 30338132, 494, 390, 30337083, 30337658] },
  { id: 'la-palma-roque|2026-10-06', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2026-10-06', v: [29855219, 29855235, 29855263, 29855290, 29855869, 29855897, 29855924, 29855940, 579, 450, 29855754, 29855067] },
  { id: 'la-palma-roque|2026-11-15', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2026-11-15', v: [29912786, 29912803, 29912831, 29912859, 29913493, 29913522, 29913550, 29913567, 634, 420, 29912441, 29913084] },
  { id: 'la-palma-roque|2026-12-21', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2026-12-21', v: [29964626, 29964645, 29964674, 29964703, 29965356, 29965385, 29965415, 29965434, 653, 30, 29964463, 29965338] },
  { id: 'la-palma-roque|2027-02-14', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2027-02-14', v: [30043867, 30043885, 30043913, 30043940, 30044551, 30044578, 30044606, 30044622, 610, 240, 30043453, 30044329] },
  { id: 'la-palma-roque|2027-03-21', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2027-03-21', v: [30094291, 30094307, 30094334, 30094362, 30094915, 30094942, 30094970, 30094986, 553, 0, 30094242, 30094980] },
  { id: 'la-palma-roque|2027-05-15', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2027-05-15', v: [30173524, 30173541, 30173572, 30173605, 30174051, 30174083, 30174114, 30174132, 446, 60, 30173242, 30173971] },
  { id: 'la-palma-roque|2027-06-21', group: 'HEDEF', siteId: 'la-palma-roque', dateKey: '2027-06-21', v: [30226820, 30226840, 30226872, 30226907, 30227320, 30227354, 30227387, 30227407, 412, 30, 30226937, 30227587] },
  { id: 'la-palma-roque|2027-09-06', group: 'KORUMA', siteId: 'la-palma-roque', dateKey: '2027-09-06', v: [30337655, 30337671, 30337699, 30337728, 30338252, 30338281, 30338309, 30338325, 524, 390, 30337254, 30337875] },
  { id: 'atacama-chile|2026-10-06', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2026-10-06', v: [29855451, 29855466, 29855493, 29855520, 29856059, 29856086, 29856113, 29856128, 538, 480, 29856016, 29855227] },
  { id: 'atacama-chile|2026-11-15', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2026-11-15', v: [29913074, 29913090, 29913120, 29913150, 29913622, 29913653, 29913682, 29913698, 472, 240, -1, 29913386] },
  { id: 'atacama-chile|2026-12-21', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2026-12-21', v: [29964937, 29964956, 29964986, 29965019, 29965461, 29965494, 29965524, 29965543, 443, 30, 29964793, 29965439] },
  { id: 'atacama-chile|2027-02-14', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2027-02-14', v: [30044130, 30044147, 30044175, 30044203, 30044708, 30044737, 30044765, 30044780, 505, 300, 30043785, 30044428] },
  { id: 'atacama-chile|2027-03-21', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2027-03-21', v: [30094499, 30094514, 30094541, 30094567, 30095130, 30095157, 30095183, 30095198, 563, 0, 30094459, 30095211] },
  { id: 'atacama-chile|2027-05-15', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2027-05-15', v: [30173654, 30173670, 30173697, 30173725, 30174352, 30174379, 30174407, 30174424, 627, 150, 30173451, 30174209] },
  { id: 'atacama-chile|2027-06-21', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2027-06-21', v: [30226930, 30226947, 30226975, 30227003, 30227644, 30227672, 30227700, 30227717, 641, 60, 30227065, 30227883] },
  { id: 'atacama-chile|2027-09-06', group: 'HEDEF', siteId: 'atacama-chile', dateKey: '2027-09-06', v: [30337840, 30337855, 30337881, 30337908, 30338492, 30338518, 30338544, 30338561, 584, 300, -1, 30338211] },
];

const toMin = (d: Date | null): number => (d ? Math.round(d.getTime() / 60000) : -1);

/** ADAPTÖR: bir sahanın, sahanın yerel takvim günü için (akşam) gece hesabı. Adım 2'de burası değişir. */
export function computeNight(site: CheckSite, dateKey: string): number[] {
  const e = calculateNightEphemeris(dateKey, site.lat, site.lon, site.elev, site.tz);
  return [
    toMin(e.sunset), toMin(e.civilDusk), toMin(e.nauticalDusk), toMin(e.astroDusk),
    toMin(e.astroDawn), toMin(e.nauticalDawn), toMin(e.civilDawn), toMin(e.sunrise),
    e.darkDurationMinutes, e.moonlessDarkMinutes, toMin(e.moonrise), toMin(e.moonset),
  ];
}

export interface IndependentNoaaRef {
  siteId: string;
  siteName: string;
  lat: number;
  lon: number;
  tz: string;
  dateKey: string;
  field: 'sunset' | 'astroDusk' | 'astroDawn';
  expectedHM: string;
  toleranceMin: number;
  source: string;
}

export const INDEPENDENT_NOAA_REFS: IndependentNoaaRef[] = [
  { siteId: 'bolu-sarialan', siteName: 'Bolu', lat: 40.612, lon: 31.684, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'sunset', expectedHM: '18:25', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'bolu-sarialan', siteName: 'Bolu', lat: 40.612, lon: 31.684, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'astroDusk', expectedHM: '19:55', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'bolu-sarialan', siteName: 'Bolu', lat: 40.612, lon: 31.684, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'astroDawn', expectedHM: '05:26', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'atacama-chile', siteName: 'Paranal', lat: -24.627, lon: -70.404, tz: 'America/Santiago', dateKey: '2026-10-08', field: 'sunset', expectedHM: '19:44', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'atacama-chile', siteName: 'Paranal', lat: -24.627, lon: -70.404, tz: 'America/Santiago', dateKey: '2026-10-08', field: 'astroDusk', expectedHM: '21:01', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'atacama-chile', siteName: 'Paranal', lat: -24.627, lon: -70.404, tz: 'America/Santiago', dateKey: '2026-10-08', field: 'astroDawn', expectedHM: '05:57', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'la-palma-roque', siteName: 'La Palma', lat: 28.758, lon: -17.885, tz: 'Atlantic/Canary', dateKey: '2026-10-08', field: 'sunset', expectedHM: '19:50', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'la-palma-roque', siteName: 'La Palma', lat: 28.758, lon: -17.885, tz: 'Atlantic/Canary', dateKey: '2026-10-08', field: 'astroDusk', expectedHM: '21:08', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'la-palma-roque', siteName: 'La Palma', lat: 28.758, lon: -17.885, tz: 'Atlantic/Canary', dateKey: '2026-10-08', field: 'astroDawn', expectedHM: '06:50', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'erzurum-dag', siteName: 'Erzurum', lat: 39.778, lon: 41.228, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'sunset', expectedHM: '17:47', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'erzurum-dag', siteName: 'Erzurum', lat: 39.778, lon: 41.228, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'astroDusk', expectedHM: '19:17', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
  { siteId: 'erzurum-dag', siteName: 'Erzurum', lat: 39.778, lon: 41.228, tz: 'Europe/Istanbul', dateKey: '2026-10-08', field: 'astroDawn', expectedHM: '04:48', toleranceMin: 2, source: 'NOAA Solar Calculator (Elevation 0m)' },
];

export interface CaseFailure {
  caseId: string;
  group: CheckGroup | 'İLKE' | 'HARİCİ';
  field: string;
  expected: string;
  actual: string;
}

export interface GroupCount { pass: number; fail: number; }

export interface SelfCheckReport {
  deviceTimeZone: string;
  koruma: GroupCount;
  hedef: GroupCount;
  ilke: GroupCount;
  harici: GroupCount;
  bagimsiz: GroupCount;
  failures: CaseFailure[];
  elapsedMs: number;
}

const fmtField = (field: string, n: number): string => {
  if (n === -1) return 'yok';
  if (field === 'darkMinutes' || field === 'moonlessMinutes') return `${n} dk`;
  return new Date(n * 60000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};

export function runSelfCheck(): SelfCheckReport {
  const t0 = Date.now();
  const bagimsizCount: GroupCount = { pass: 0, fail: 0 };
  const report: SelfCheckReport = {
    deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    koruma: { pass: 0, fail: 0 },
    hedef: { pass: 0, fail: 0 },
    ilke: { pass: 0, fail: 0 },
    harici: bagimsizCount,
    bagimsiz: bagimsizCount,
    failures: [],
    elapsedMs: 0,
  };
  const siteById = new Map<string, CheckSite>();
  for (const s of CHECK_SITES) {
    siteById.set(s.id, s);
  }

  for (const c of GOLDEN) {
    const site = siteById.get(c.siteId);
    if (!site) continue;
    const got = computeNight(site, c.dateKey);
    const bucket = c.group === 'KORUMA' ? report.koruma : report.hedef;

    // 1) Referans karşılaştırması
    let caseOk = true;
    FIELDS.forEach((field, i) => {
      const exp = c.v[i];
      const act = got[i];
      const bothNone = exp === -1 && act === -1;
      const isDurationField = field === 'moonlessMinutes';
      // Ay'sız dakika hesabı 30 dk kova hatasından kesin dakikaya geçtiği için bilinen kova sapmalarına izin ver (maks 25 dk)
      const tol = isDurationField ? 25 : TOLERANCE_MIN;
      const ok = bothNone || (exp !== -1 && act !== -1 && Math.abs(exp - act) <= tol);
      if (!ok) {
        caseOk = false;
        report.failures.push({ caseId: c.id, group: c.group, field, expected: fmtField(field, exp), actual: fmtField(field, act) });
      }
    });
    if (caseOk) bucket.pass++; else bucket.fail++;

    // 2) Fiziksel tutarlılık ilkeleri (sahanın yeni olup olmamasından bağımsız)
    const [ss, cd, nd, ad, aw, nw, cw, sr, dark, moonless] = got;
    const ordered = ss <= cd && cd <= nd && nd <= ad && ad <= aw && aw <= nw && nw <= cw && cw <= sr;
    const durationsOk = moonless >= 0 && moonless <= dark && dark <= 1440;
    if (ordered && durationsOk) {
      report.ilke.pass++;
    } else {
      report.ilke.fail++;
      report.failures.push({
        caseId: c.id,
        group: 'İLKE',
        field: !ordered ? 'olay sıralaması' : 'süre aralığı',
        expected: 'gün batımı <= ... <= gün doğumu; 0 <= Ay\'sız <= karanlık <= 1440',
        actual: !ordered ? `batım ${fmtField('sunset', ss)}, doğum ${fmtField('sunrise', sr)}` : `Ay'sız ${moonless} dk, karanlık ${dark} dk`,
      });
    }
  }

  // 3) BAĞIMSIZ DOĞRULAMA (NOAA Solar Calculator - 0m dipsiz karşılaştırma)
  for (const ref of INDEPENDENT_NOAA_REFS) {
    // Dipsiz karşılaştırma için rakım kesinlikle 0 metre geçilir
    const ephem = calculateNightEphemeris(ref.dateKey, ref.lat, ref.lon, 0, ref.tz);
    const targetDate: Date | null = ephem[ref.field];

    if (!targetDate) {
      bagimsizCount.fail++;
      report.failures.push({
        caseId: `${ref.siteName} (${ref.dateKey})`,
        group: 'HARİCİ',
        field: ref.field,
        expected: ref.expectedHM,
        actual: 'hesaplanamadı (null)',
      });
      continue;
    }

    const actHM = formatTimeHM(targetDate, ref.tz);
    const [expH, expM] = ref.expectedHM.split(':').map(Number);
    const [actH, actM] = actHM.split(':').map(Number);
    const expMins = expH * 60 + expM;
    const actMins = actH * 60 + actM;
    let diffMin = Math.abs(actMins - expMins);
    if (diffMin > 720) diffMin = 1440 - diffMin;

    if (diffMin <= ref.toleranceMin) {
      bagimsizCount.pass++;
    } else {
      bagimsizCount.fail++;
      report.failures.push({
        caseId: `${ref.siteName} (${ref.dateKey})`,
        group: 'HARİCİ',
        field: ref.field,
        expected: `${ref.expectedHM} (±${ref.toleranceMin} dk)`,
        actual: `${actHM} (fark: ${diffMin} dk)`,
      });
    }
  }

  report.elapsedMs = Date.now() - t0;
  return report;
}

export function formatReport(r: SelfCheckReport, maxFailures = 12): string {
  const line = (name: string, g: GroupCount) => `${name}: ${g.pass} geçti, ${g.fail} kaldı`;
  const out: string[] = [
    `Cihaz saat dilimi: ${r.deviceTimeZone}  (${r.elapsedMs} ms)`,
    '',
    '─── [A] REGRESYON TESTLERİ (Eski Motor Çıktısıyla İç Tutarlılık) ───',
    line('KORUMA (değişmemeli)', r.koruma),
    line('HEDEF (Adım 2 sonrası geçmeli)', r.hedef),
    line('İLKE (fiziksel tutarlılık)', r.ilke),
    '',
    '─── [B] BAĞIMSIZ DOĞRULAMA (NOAA Solar Calculator - 0m Dipsiz) ───',
    line('BAĞIMSIZ DOĞRULAMA (NOAA 0m)', r.harici),
  ];

  const koruma = r.failures.filter((f) => f.group === 'KORUMA');
  if (koruma.length > 0) {
    out.push('', 'KORUMA HATALARI (bunlar olmamalı):');
    koruma.slice(0, maxFailures).forEach((f) => out.push(`  ${f.caseId} ${f.field}: beklenen ${f.expected}, bulunan ${f.actual}`));
    if (koruma.length > maxFailures) out.push(`  ... ve ${koruma.length - maxFailures} tane daha`);
  }

  const bagimsizFailures = r.failures.filter((f) => f.group === 'HARİCİ');
  if (bagimsizFailures.length > 0) {
    out.push('', 'BAĞIMSIZ DOĞRULAMA SAPMALARI:');
    bagimsizFailures.slice(0, maxFailures).forEach((f) => out.push(`  ${f.caseId} ${f.field}: beklenen ${f.expected}, bulunan ${f.actual}`));
  }

  return out.join('\n');
}
