import { pickGroup } from './src/lib/pickGroup.js';

const PORTRAIT_FILES = [
  'Artemis Selene.png','Azura Focushearth.png','Chi_s Keki.png','Cino Cinnamon.png',
  'Coo Kie.png','Cortana Aiur.png','Dango Silvers.png','Estelle Inoue.png',
  'Godric Brandr.png','Haru Beoulve.png','Hestia Exaltia.png','Hori Sheet.png',
  'Jmo H.png','Liokki K_an.png','Lue Xion.png','Luna Noonuccal.png',
  'Miyuki Moon.png','Mutezs Nagi.png','Nanami Kazuya.png','Nier Arcana.jpg',
  'Pickle Tickle.png','Raiden Woltz.png','Renzy Kun.png','Silchus Ruin.png',
  'Trapizi Rei.png','Yeme Chevalcroix.png','Yuuna Kawashima.png','Zehka_a Amariyo.png',
];
const TANKS = ['harubeoulve','horisheet','pickletickle','dangosilvers','cookie','jmoh','redraven','hestiaexaltia','liokkikan','chiskeki','estelleinoue','artemisselene','nierarcana','zehkaaamariyo','cortanaaiur','cinocinnamon'];
const HEALERS = ['luexion','harubeoulve','pickletickle','dangosilvers','cookie','jmoh','azurafocushearth','liokkikan','chiskeki','renzykun','miyukimoon','yuunakawashima','artemisselene','nierarcana','nanamikazuya','mutezsnagi','cortanaaiur','cinocinnamon'];
const DPS = ['luexion','trapizirei','harubeoulve','pickletickle','yemechevalcroix','dangosilvers','cookie','jmoh','redraven','hestiaexaltia','azurafocushearth','liokkikan','chiskeki','persiusvladymir','renzykun','miyukimoon','yuunakawashima','artemisselene','nierarcana','zehkaaamariyo','nanamikazuya','cortanaaiur','lunanoonuccal','cinocinnamon','silchusruin','raidenwoltz'];
const SIG = {};
const add = (k,r) => { (SIG[k]=SIG[k]||[]).includes(r)||SIG[k].push(r); };
for (const k of TANKS) add(k,'tank');
for (const k of HEALERS) add(k,'healer');
for (const k of DPS) add(k,'dps');
const rolesFor = (f) => {
  const b = f.replace(/\.[^.]+$/,'').replace(/_/g,"'").toLowerCase().replace(/[^a-z0-9]/g,'');
  return SIG[b] ? [...SIG[b]] : ['dps'];
};
const EX = new Set(['Persius Vladymir.png','Red Raven.png']);
const pool = PORTRAIT_FILES.filter(f => !EX.has(f)).map(f => ({
  id: f, name: f.replace(/\.[^.]+$/,'').replace(/_/g,"'"),
  priority: 0, roles: rolesFor(f),
}));

const N = 5000;
const counts = {};
for (const p of pool) counts[p.id] = 0;
for (let i = 0; i < N; i++) for (const a of pickGroup(pool).assignments) counts[a.id]++;

console.log(`Pick rate (over ${N} runs):`);
const sorted = pool.slice().sort((a,b) => counts[b.id] - counts[a.id]);
for (const p of sorted) console.log(`  ${(counts[p.id]/N).toFixed(3)}  ${p.name}  [roles=${p.roles.join(',')}]`);
