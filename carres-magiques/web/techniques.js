/* Techniques intégrées (code d'origine fourni par l'utilisateur, identifiants préfixés). */
(function(){
// Disposition confirmée du carré 5x5 (ligne par ligne)
const layout = [
  ['ا','ب','ج','د','ه'],
  ['و','ز','ح','ط','ي'],
  ['ك','ل','م','ن','ص'],
  ['ع','ف','ض','ق','ر'],
  ['س','ت','ث','خ','ذ']
];

function calculer(){
  const nInput = document.getElementById('k5-nombre');
  const besoin = document.getElementById('k5-besoin').value.trim();
  const errEl = document.getElementById('k5-errMsg');
  const n = parseFloat(nInput.value);

  if(isNaN(n) || n % 2 !== 0){
    errEl.style.display = 'block';
    document.getElementById('k5-resultSection').style.display = 'none';
    return;
  }
  errEl.style.display = 'none';

  // Etape 1 : calcul de l'entrée
  const entree = (n/2) - 11;

  // Etape 2 : chaine des 8 valeurs de base (incréments fixes)
  const kha = entree;
  const ya  = kha + 4;   // dal
  const ba  = ya  + 5;   // ha
  const ayn = ba  + 1;   // alif
  const ta  = ayn + 2;   // ba
  const waw = ta  + 1;   // alif
  const dal = waw + 5;   // ha
  const ra  = dal + 4;   // dal

  // Etape 3 : les 16 cases croisées
  const values = {
    'خ': kha, 'ي': ya, 'ب': ba, 'ع': ayn, 'ت': ta, 'و': waw, 'د': dal, 'ر': ra,
    'ح': kha+ta, 'ف': kha+waw, 'ص': kha+dal, 'ذ': kha+ra,
    'ق': ya+ta,  'ج': ya+waw,  'ه': ya+dal,  'ل': ya+ra,
    'ك': ba+ta,  'ا': ba+waw,  'ض': ba+dal,  'ط': ba+ra,
    'س': ayn+ta, 'ن': ayn+waw, 'ز': ayn+dal, 'ث': ayn+ra
  };

  // Rendu du grid
  const gridEl = document.getElementById('k5-grid');
  gridEl.innerHTML = '';
  layout.forEach(row => {
    row.forEach(letter => {
      const cell = document.createElement('div');
      if(letter === 'م'){
        cell.className = 'cell center';
        cell.innerHTML = `<div class="letter">م</div><div class="value">${besoin || '—'}</div>`;
      } else {
        cell.className = 'cell';
        cell.innerHTML = `<div class="letter">${letter}</div><div class="value">${values[letter]}</div>`;
      }
      gridEl.appendChild(cell);
    });
  });

  // Sommes de vérification (les 4 "côtés" doivent être égaux)
  const sideSum = values['خ'] + values['ر'] + values['ذ'];
  document.getElementById('k5-sums').textContent =
    `Entrée : ${entree}  •  Somme d'angle : ${values['ب']+values['و']}  •  Vérification : ${sideSum}`;

  document.getElementById('k5-resultSection').style.display = 'block';
  document.getElementById('k5-resultSection').scrollIntoView({behavior:'smooth', block:'start'});
}

document.getElementById('k5-go').addEventListener('click',calculer);
})();
(function(){
// Table abjad ORIENTALE (Mashriqi - standard)
const abjadOrientale = {
  'ا':1,'أ':1,'إ':1,'آ':1,'ب':2,'ج':3,'د':4,'ه':5,'ة':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ى':10,
  'ك':20,'ل':30,'م':40,'ن':50,'س':60,'ع':70,'ف':80,'ص':90,
  'ق':100,'ر':200,'ش':300,'ت':400,'ث':500,'خ':600,'ذ':700,'ض':800,'ظ':900,'غ':1000
};
// Table abjad OCCIDENTALE (Maghribi)
const abjadOccidentale = {
  'ا':1,'أ':1,'إ':1,'آ':1,'ب':2,'ج':3,'د':4,'ه':5,'ة':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ى':10,
  'ك':20,'ل':30,'م':40,'ن':50,'ص':60,'ع':70,'ف':80,'ض':90,
  'ق':100,'ر':200,'س':300,'ت':400,'ث':500,'خ':600,'ذ':700,'ظ':800,'غ':900,'ش':1000
};
let abjadValues = abjadOccidentale;

// Index de position (1-16) des 16 lettres utilisées dans le carré magique de base
const posIndex = {'ا':1,'ب':2,'ج':3,'د':4,'ه':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ك':11,'ل':12,'م':13,'ن':14,'س':15,'ع':16};

// Regroupement par élément (selon position, carré latin confirmé)
const feuPos   = [1,8,10,15];
const terrePos = [2,7,9,16];
const airPos   = [3,6,12,13];
const eauPos   = [4,5,11,14];

// Modèle "Occidentale" (ordre de remplissage des cases, ligne par ligne)
const occidentaleTemplate = [8,11,14,1, 13,2,7,12, 3,16,9,6, 10,5,4,15];
// Modèle de fusion finale
const finalTemplate = [14,11,8,1, 4,5,10,15, 9,16,3,6, 7,2,13,12];

function setSystem(sys){
  abjadValues = (sys === 'occ') ? abjadOccidentale : abjadOrientale;
  document.getElementById('cp-btnOcc').classList.toggle('on', sys === 'occ');
  document.getElementById('cp-btnOri').classList.toggle('on', sys !== 'occ');
}

function abjadTotal(name){
  let total = 0;
  for(const ch of name){
    if(abjadValues[ch] !== undefined) total += abjadValues[ch];
  }
  return total;
}

function buildIndividualSquare(N){
  const shifted = N - 30;
  const R = ((shifted % 4) + 4) % 4;
  const base = (shifted - R) / 4;

  const valueByPos = {};
  occidentaleTemplate.forEach(T => {
    valueByPos[T] = base + (T-1) + (T>12 ? R : 0);
  });

  const sumOf = positions => positions.reduce((s,p)=> s+valueByPos[p], 0);

  return {
    N, base, R, valueByPos,
    Feu: sumOf(feuPos), Terre: sumOf(terrePos), Air: sumOf(airPos), Eau: sumOf(eauPos),
    gridValues: occidentaleTemplate.map(T => valueByPos[T])
  };
}

function renderGrid(elId, values){
  const el = document.getElementById('cp-'+elId);
  el.innerHTML = '';
  values.forEach(v => {
    const c = document.createElement('div');
    c.className = 'cell';
    c.textContent = v;
    el.appendChild(c);
  });
}

function calculer(){
  const talibName = document.getElementById('cp-talib').value.trim();
  const matloubName = document.getElementById('cp-matloub').value.trim();
  const talibNumRaw = document.getElementById('cp-talibNum').value.trim();
  const matloubNumRaw = document.getElementById('cp-matloubNum').value.trim();
  const errEl = document.getElementById('cp-errMsg');

  const talibN = talibNumRaw ? parseInt(talibNumRaw, 10) : (talibName ? abjadTotal(talibName) : NaN);
  const matloubN = matloubNumRaw ? parseInt(matloubNumRaw, 10) : (matloubName ? abjadTotal(matloubName) : NaN);

  if(isNaN(talibN) || isNaN(matloubN)){
    errEl.style.display = 'block';
    document.getElementById('cp-resultSection').style.display = 'none';
    return;
  }
  errEl.style.display = 'none';

  const talib = buildIndividualSquare(talibN);
  const matloub = buildIndividualSquare(matloubN);

  renderGrid('gridTalib', talib.gridValues);
  document.getElementById('cp-detailTalib').textContent =
    `N=${talib.N} → base=${talib.base}, reste=${talib.R} · Feu=${talib.Feu} Terre=${talib.Terre} Air=${talib.Air} Eau=${talib.Eau}`;

  renderGrid('gridMatloub', matloub.gridValues);
  document.getElementById('cp-detailMatloub').textContent =
    `N=${matloub.N} → base=${matloub.base}, reste=${matloub.R} · Feu=${matloub.Feu} Terre=${matloub.Terre} Air=${matloub.Air} Eau=${matloub.Eau}`;

  // Fusion finale
  const S1 = matloub.Feu + talib.Air;
  const S2 = matloub.Terre + talib.Eau;
  const rem1 = S1 % 2;
  const rem2 = S2 % 2;
  const base1 = Math.floor(S1/2) - 3;
  const base2 = Math.floor(S2/2) - 4;

  const finalValues = finalTemplate.map(T => {
    if(T <= 8) return base1 + (T-1) + (T>=5 ? rem1 : 0);
    return base2 + (T-9) + (T>=13 ? rem2 : 0);
  });
  renderGrid('gridFinal', finalValues);
  document.getElementById('cp-detailFinal').textContent =
    `S1 (Feu matloub + Air talib) = ${S1} → base1=${base1}${rem1?' (+1 dès la 5e case)':''} · S2 (Terre matloub + Eau talib) = ${S2} → base2=${base2}${rem2?' (+1 dès la 13e case)':''}`;

  document.getElementById('cp-resultSection').style.display = 'block';
  document.getElementById('cp-resultSection').scrollIntoView({behavior:'smooth', block:'start'});
}

document.getElementById('cp-go').addEventListener('click',calculer);
document.getElementById('cp-btnOcc').addEventListener('click',()=>setSystem('occ'));
document.getElementById('cp-btnOri').addEventListener('click',()=>setSystem('ori'));
})();
(function(){
// ---- Valeurs abjad standard ----
const abjadValues = {
  'ا':1,'ب':2,'ج':3,'د':4,'ه':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,
  'ك':20,'ل':30,'م':40,'ن':50,'س':60,'ع':70,'ف':80,'ص':90,
  'ق':100,'ر':200,'ش':300,'ت':400,'ث':500,'خ':600,'ذ':700,'ض':800,'ظ':900,'غ':1000
};
function abjadTotal(name){
  return [...name].filter(ch => abjadValues[ch] !== undefined).reduce((s,ch) => s + abjadValues[ch], 0);
}

const maisons = [
  { nom:'النفس', arabe:'الحفظ', asmaa:'حفيظ',
    grille:[[7,10,13,null],[12,1,6,11],[2,15,8,5],[9,4,3,14]],
    instr:'وإن أردت أن تحفظ نفسك عليك أن تدخل بيت الأول وتدخل اسم الله حفيظ، واجعل اسمك في البيت الخالي.' },
  { nom:'المال', asmaa:'معطي',
    grille:[[13,6,null,11],[8,3,5,14],[7,12,10,1],[2,9,15,4]],
    instr:'وإن أردت المال عليك أن تدخل بيت الثاني وأدخل اسم الله معطي في الخاتم، إن شاء الله تجد مالاً.' },
  { nom:'الإخوة', asmaa:'ودود',
    grille:[[11,null,6,13],[14,5,3,8],[1,10,12,7],[4,15,9,2]],
    instr:'وإن أردت مكانة عليك أن تدخل بيت الثالث وادخل في الخاتم أسماء الله ودود، واجعل حاجتك في البيت الخالي.' },
  { nom:'الآباء', asmaa:'جامع',
    grille:[[null,11,6,13],[5,14,3,8],[10,1,12,7],[15,4,9,2]],
    instr:'وإن أردت أن تجمع كل شيء عليك أن تدخل بيت الرابع وتدخل فيه اسم الله جامع.' },
  { nom:'البنين', asmaa:'وهاب، وارث (وكهيعص)',
    grille:[[4,1,14,11],[15,10,5,null],[9,12,3,6],[2,7,8,13]],
    instr:'وإن كنت تريد البنين عليك أن تدخل بيت الخامس وأدخل في الخاتم أسماء الله وهاب، وارث. واذكر: ربي لا تذرني فرداً وأنت خير الوارثين.' },
  { nom:'المرض', asmaa:'سلام، صبور',
    grille:[[1,12,11,6],[10,7,null,13],[4,9,14,3],[15,2,5,8]],
    instr:'وإن كنت تريد أن تسلم المريض عليك أن تدخل بيت السادس وتدخل في الخواتم يا سلام يا صبور، وتجعل اسم المريض في البيت الخالي، وتدور: سلاماً قولاً من رب رحيم.' },
  { nom:'النكاح', asmaa:'جامع',
    grille:[[6,11,12,1],[13,null,7,10],[3,14,9,4],[8,5,2,15]],
    instr:'وإن أردت أن تنجح (الزواج) عليك أن تدخل بيت السابع وتدخل اسم الله جامع في الخواتم، واسم من تريد في البيت الخالي.' },
  { nom:'القبر', asmaa:'منتقم',
    grille:[[11,14,1,4],[null,5,10,15],[6,3,12,9],[13,8,7,2]],
    instr:'وإن كنت تريد ذلك على كل شيء بموته، عليك أن تدخل بيت الثامن وتدخل في الخاتم اسم الله منتقم، واسم المطلوب في البيت الخالي، وتدور: عزرائيل، تبت يدا.' },
  { nom:'السفر', asmaa:'فياض',
    grille:[[2,7,8,13],[9,12,3,6],[15,10,5,null],[4,1,14,11]],
    instr:'وإن أردت أن لا يصاب أحد بعين عليك أن تدخل بيت التاسع وتدخل في الخاتم اسم الله فياض، واسم المطلوب في البيت الخالي، وتدعو في الطريق الذي يريده المطلوب.' },
  { nom:'السلطان', asmaa:'مالك الملك، مقتدر',
    grille:[[15,2,5,8],[4,9,14,3],[10,7,null,13],[1,12,11,6]],
    instr:'وإن كنت تريد ملك الدنيا والآخرة عليك بتقوى الله وطاعة رسوله، أن تدخل بيت العاشر وتدخل اسماء الله مالك الملك مقتدر، وتدخل في الخالي اسمك واسم الأرض التي تريد أن تملكها.' },
  { nom:'الرجاء', asmaa:'(غير مؤكد)',
    grille:[[8,5,2,15],[3,14,9,4],[13,null,7,10],[6,11,12,1]],
    instr:'وإن كنت تجمع بين كل شيء من الله ورسوله، عليك أن تدخل بيت الحادي عشر وتدخل حاجتك في البيت الخالي، لا بد أن يعطيك سريعاً.' },
  { nom:'الأعداء', asmaa:'محيط',
    grille:[[13,8,7,2],[6,3,12,9],[null,15,10,5],[11,4,1,14]],
    instr:'وإن كنت تخاف من شر العدو عليك أن تدخل بيت الثاني عشر وتدخل في الخاتم اسم الله محيط، واسمك في البيت الخالي.' },
  { nom:'السائل', asmaa:'مجيب',
    grille:[[9,4,3,14],[2,15,8,5],[12,1,6,11],[7,10,13,null]],
    instr:'وإن كنت تريد سؤال جنّة، عليك أن تدخل بيت الثالث عشر وتدخل في الخاتم اسم الله مجيب.' },
  { nom:'المسؤول', asmaa:'سريع، قريب، مجيب',
    grille:[[2,9,15,4],[7,12,10,1],[8,3,5,14],[13,6,null,11]],
    instr:'وإن كنت تريد العيد وجميع المال من الذهب والفضة وغيره والثياب والمعيشة، عليك أن تدخل بيت الرابع عشر وتدخل في الخواتم أسماء الله سريع قريب مجيب.' },
  { nom:'القاضي', asmaa:'غالب',
    grille:[[4,15,9,2],[1,10,12,7],[14,5,3,8],[11,null,6,13]],
    instr:'وإن كنت تريد أن تغلب القاضي عليك أن تدخل بيت الخامس عشر وتدخل في الخواتم اسم الله غالب، واسمك في البيت الخالي، وتدور: كتب الله لأغلبن أنا ورسلي، إن الله قوي عزيز.' },
  { nom:'العاقبة', asmaa:'(غير مؤكد)',
    grille:[[14,3,4,9],[5,8,15,2],[11,6,1,12],[null,13,10,7]],
    instr:'وإن كنت تريد أن تجمع كل شيء إليه، عليك بتقوى الله تعالى، أن تدخل بيت السادس عشر.' }
];

const sel = document.getElementById('mr-besoin');
maisons.forEach((m, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = `${i+1}. ${m.nom}`;
  sel.appendChild(opt);
});

function afficher(){
  const idx = sel.value;
  const resultSection = document.getElementById('mr-resultSection');
  if(idx === ''){ resultSection.style.display = 'none'; return; }
  const m = maisons[idx];
  const nomCalcul = document.getElementById('mr-nomCalcul').value.trim();
  const voeu = document.getElementById('mr-voeu').value.trim();

  document.getElementById('mr-titreBeit').textContent = `البيت ${parseInt(idx)+1} — ${m.nom}`;

  const gridRefEl = document.getElementById('mr-gridRef');
  gridRefEl.innerHTML = '';
  m.grille.forEach(row => {
    row.forEach(v => {
      const cell = document.createElement('div');
      cell.className = v === null ? 'cell blank' : 'cell';
      cell.textContent = v === null ? '—' : v;
      gridRefEl.appendChild(cell);
    });
  });

  const gridEl = document.getElementById('mr-grid');
  gridEl.innerHTML = '';
  const calcEl = document.getElementById('mr-calcDetail');

  if(nomCalcul.length === 0){
    calcEl.innerHTML = '<i>أدخل اسماً أو عدداً لحساب المربع</i>';
    m.grille.forEach(row => {
      row.forEach(v => {
        const cell = document.createElement('div');
        cell.className = v === null ? 'cell blank' : 'cell';
        cell.textContent = v === null ? (voeu.length > 0 ? voeu : 'حاجتك هنا') : v;
        gridEl.appendChild(cell);
      });
    });
  } else {
    const total = isNaN(parseInt(nomCalcul)) || /[\u0621-\u064A]/.test(nomCalcul) ? abjadTotal(nomCalcul) : parseInt(nomCalcul);
    const quotient = Math.floor(total / 30);
    const remainder = total % 30;
    calcEl.innerHTML = `<b>${nomCalcul}</b> = ${total} → ${total} = 30×${quotient} + ${remainder} (الباقي يُضاف إلى الخانات 12، 13، 14، 15)`;

    const resultat = m.grille.map(row => row.map(L => L === null ? null : L*quotient + (L >= 12 ? remainder : 0)));

    resultat.forEach(row => {
      row.forEach(v => {
        const cell = document.createElement('div');
        if(v === null){
          cell.className = 'cell blank';
          cell.textContent = voeu.length > 0 ? voeu : 'حاجتك هنا';
        } else {
          cell.className = 'cell';
          cell.textContent = v;
        }
        gridEl.appendChild(cell);
      });
    });
  }

  document.getElementById('mr-asmaa').innerHTML = `<b>اسم/أسماء الله لهذا البيت:</b> ${m.asmaa}`;
  document.getElementById('mr-instructions').textContent = m.instr;

  resultSection.style.display = 'block';
  resultSection.scrollIntoView({behavior:'smooth', block:'start'});
}

document.getElementById('mr-besoin').addEventListener('change',afficher);
document.getElementById('mr-nomCalcul').addEventListener('input',afficher);
document.getElementById('mr-voeu').addEventListener('input',afficher);
})();
(function(){
// ---- Tables abjad ----
const abjadOrientale = {
  'ا':1,'أ':1,'إ':1,'آ':1,'ب':2,'ج':3,'د':4,'ه':5,'ة':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ى':10,
  'ك':20,'ل':30,'م':40,'ن':50,'س':60,'ع':70,'ف':80,'ص':90,
  'ق':100,'ر':200,'ش':300,'ت':400,'ث':500,'خ':600,'ذ':700,'ض':800,'ظ':900,'غ':1000
};
const abjadOccidentale = {
  'ا':1,'أ':1,'إ':1,'آ':1,'ب':2,'ج':3,'د':4,'ه':5,'ة':5,'و':6,'ز':7,'ح':8,'ط':9,'ي':10,'ى':10,
  'ك':20,'ل':30,'م':40,'ن':50,'ص':60,'ع':70,'ف':80,'ض':90,
  'ق':100,'ر':200,'س':300,'ت':400,'ث':500,'خ':600,'ذ':700,'ظ':800,'غ':900,'ش':1000
};
let abjadValues = abjadOccidentale;

function reverseMap(table){
  const rev = {};
  for(const [letter,val] of Object.entries(table)){
    if(rev[val] === undefined) rev[val] = letter; // keep first (base letter, not variants)
  }
  return rev;
}

function setSystem(sys){
  abjadValues = (sys === 'occ') ? abjadOccidentale : abjadOrientale;
  document.getElementById('zd-btnOcc').classList.toggle('on', sys === 'occ');
  document.getElementById('zd-btnOri').classList.toggle('on', sys !== 'occ');
}

// ---- Zodiaque (12 signes, 3 lettres chacun) ----
const zodiacSigns = [
  {name:'حمل (Bélier)', letters:['ا','ه','ط']},
  {name:'ثور (Taureau)', letters:['ب','و','ي']},
  {name:'جوزاء (Gémeaux)', letters:['ج','ز','ك']},
  {name:'سرطان (Cancer)', letters:['د','ح','ل']},
  {name:'أسد (Lion)', letters:['ط','م','ف']},
  {name:'عذراء (Vierge)', letters:['ي','ن','ص']},
  {name:'ميزان (Balance)', letters:['ك','س','ق']},
  {name:'عقرب (Scorpion)', letters:['ل','ع','ر']},
  {name:'قوس (Sagittaire)', letters:['ف','ش','ذ']},
  {name:'جدي (Capricorne)', letters:['ص','ض','ت']},
  {name:'دلو (Verseau)', letters:['ق','ث','ظ']},
  {name:'حوت (Poisson)', letters:['خ','غ','ر']}
];

// ---- Lettres compatibles (allumage) ----
const partnerPairs = [
  ['ا','ج'],['ه','ز'],['ط','ك'],['م','س'],['ف','ق'],['ش','ث'],['ذ','ظ'],
  ['د','ب'],['ح','و'],['ل','ي'],['ع','ن'],['ر','ص'],['خ','ت'],['غ','ض']
];
const partnerOf = {};
partnerPairs.forEach(([a,b]) => { partnerOf[a]=b; partnerOf[b]=a; });

function abjadTotal(name){
  let total = 0;
  for(const ch of name){ if(abjadValues[ch] !== undefined) total += abjadValues[ch]; }
  return total;
}

function lettersOnly(name){
  return [...name].filter(ch => abjadValues[ch] !== undefined);
}

function getZodiac(name){
  const N = abjadTotal(name);
  let r = N % 12;
  if(r === 0) r = 12;
  return {N, index:r, sign: zodiacSigns[r-1]};
}

// Entrelacement des noms : talib(cycle) / matloub, se termine sur une lettre du talib
function interleaveNames(talibLetters, matloubLetters){
  const result = [];
  // Le talib fournit toujours la lettre de verrouillage finale.
  // Si le matloub est plus long (ou égal), la boucle tourne sur sa longueur (talib cyclé).
  // Si le talib est plus long, la boucle tourne sur (longueur du talib - 1) (matloub cyclé),
  // pour que le verrouillage final tombe sur la toute dernière lettre du talib.
  const loopCount = (matloubLetters.length >= talibLetters.length)
    ? matloubLetters.length
    : talibLetters.length - 1;
  for(let i = 0; i < loopCount; i++){
    result.push(talibLetters[i % talibLetters.length]);
    result.push(matloubLetters[i % matloubLetters.length]);
  }
  result.push(talibLetters[loopCount % talibLetters.length]); // verrouillage final sur le talib
  return result;
}

// Entrelacement simple (zodiaque, 3+3, sans verrouillage)
function interleaveSimple(a, b){
  const result = [];
  for(let k = 0; k < Math.max(a.length,b.length); k++){
    if(k < a.length) result.push(a[k]);
    if(k < b.length) result.push(b[k]);
  }
  return result;
}

// Fusion : bloc zodiaque (cyclique) + bloc noms
function fuseBlocks(nameBlock, zodBlock){
  const result = [];
  for(let i = 0; i < nameBlock.length; i++){
    result.push(zodBlock[i % zodBlock.length]);
    result.push(nameBlock[i]);
  }
  return result;
}

function allumer(sequence){
  return sequence.map(l => [l, partnerOf[l] || l]);
}

// ---- Expansion d'un nombre en toutes lettres (pour compter les lettres) ----
const unitsFull = ['','احد','اثنان','ثلاثة','اربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
const unitsShort = ['','','','ثلاث','اربع','خمس','ست','سبع','ثمان','تسع'];
const tensFull = {10:'عشرة',20:'عشرين',30:'ثلاثين',40:'اربعين',50:'خمسين',60:'ستين',70:'سبعين',80:'ثمانين',90:'تسعين'};

function hundredsPhrase(h){
  if(h === 0) return '';
  if(h === 1) return 'مائة';
  if(h === 2) return 'مئتان';
  return unitsShort[h] + ' مائة';
}
function thousandsPhrase(th){
  if(th === 0) return '';
  if(th === 1) return 'الف';
  if(th === 2) return 'الفان';
  return unitsShort[th] + ' الاف';
}

function expandNumber(N){
  if(N >= 10000) return null; // hors périmètre de l'expansion automatique
  const th = Math.floor(N/1000);
  let rem = N % 1000;
  const h = Math.floor(rem/100);
  rem = rem % 100;
  const t = Math.floor(rem/10) * 10;
  const u = rem % 10;
  const parts = [
    u ? unitsFull[u] : '',
    t ? tensFull[t] : '',
    hundredsPhrase(h),
    thousandsPhrase(th)
  ].filter(p => p);
  const phrase = parts.join(' ');
  const letterCount = phrase.replace(/\s/g,'').length;
  return {phrase, letterCount};
}

// ---- Décomposition d'un nombre en lettres abjad ----
function numberToAbjadLetters(N, revMap){
  const th = Math.floor(N/1000);
  let rem = N % 1000;
  const h = Math.floor(rem/100) * 100;
  rem = rem % 100;
  const t = Math.floor(rem/10) * 10;
  const u = rem % 10;
  const letters = [];
  if(u && revMap[u]) letters.push(revMap[u]);
  if(t && revMap[t]) letters.push(revMap[t]);
  if(h && revMap[h]) letters.push(revMap[h]);
  if(th === 1 && revMap[1000]) letters.push(revMap[1000]);
  return letters;
}

// ---- Noms des 28 lettres (pour dilatation) ----
const letterName = {
  'ا':'الالف','ب':'الباء','ج':'الجيم','د':'الدال','ه':'الهاء','و':'الواو','ز':'الزاي','ح':'الحاء',
  'ط':'الطاء','ي':'الياء','ك':'الكاف','ل':'اللام','م':'الميم','ن':'النون','س':'السين','ع':'العين',
  'ف':'الفاء','ص':'الصاد','ق':'القاف','ر':'الراء','ش':'الشين','ت':'التاء','ث':'الثاء','خ':'الخاء',
  'ذ':'الذال','ض':'الضاد','ظ':'الظاد','غ':'الغين'
};

// ---- Demeures lunaires (manazil) correspondant à chaque lettre ----
const manzilName = {
  'ا':'الشرطين','ب':'البطين','ج':'الثريا','د':'الدبران','ه':'الهقعة','و':'الهنعة','ز':'الذراع','ح':'النثرة',
  'ط':'الطرفة','ي':'الجبهة','ك':'الزبرة','ل':'الصرفة','م':'العواء','ن':'السماك','س':'الغفر','ع':'الزبانة',
  'ف':'الاكليل','ص':'القلب','ق':'الشولة','ر':'النعائم','ش':'البلدة','ت':'سعد الذابح','ث':'سعد بلع',
  'خ':'سعد السعود','ذ':'سعد الاخبية','ض':'الفرع المقدم','ظ':'الفرع المؤخر','غ':'الرشاء'
};

// ---- Nom du zodiaque avec article, planète régente, jour de la planète ----
const zodiacExtra = [
  {def:'الحمل', planet:'المريخ', day:'الثلاثاء'},
  {def:'الثور', planet:'الزهرة', day:'الجمعة'},
  {def:'الجوزاء', planet:'عطارد', day:'الاربعاء'},
  {def:'السرطان', planet:'القمر', day:'الاثنين'},
  {def:'الاسد', planet:'الشمس', day:'الاحد'},
  {def:'العذراء', planet:'عطارد', day:'الاربعاء'},
  {def:'الميزان', planet:'الزهرة', day:'الجمعة'},
  {def:'العقرب', planet:'المريخ', day:'الثلاثاء'},
  {def:'القوس', planet:'المشتري', day:'الخميس'},
  {def:'الجدي', planet:'الزحل', day:'السبت'},
  {def:'الدلو', planet:'الزحل', day:'السبت'},
  {def:'الحوت', planet:'المشتري', day:'الخميس'}
];

function rauhaneNumber(word){
  const cleanLetters = [...word].filter(ch => ch !== 'ء' && abjadValues[ch] !== undefined);
  const pmWord = cleanLetters.reduce((s,ch) => s + abjadValues[ch], 0);
  let totalLetterCount = 0;
  for(const ch of cleanLetters){
    const exp = expandNumber(abjadValues[ch]);
    if(exp) totalLetterCount += exp.letterCount;
  }
  return totalLetterCount*totalLetterCount + pmWord - 51;
}

function computeRauhane(zod){
  const [l1,l2,l3] = zod.sign.letters;
  const extra = zodiacExtra[zod.index - 1];
  const items = [
    {label:'1ère lettre dilatée ('+l1+')', word: letterName[l1]},
    {label:'2ème lettre dilatée ('+l2+')', word: letterName[l2]},
    {label:'3ème lettre dilatée ('+l3+')', word: letterName[l3]},
    {label:'Manzil de la 1ère lettre', word: manzilName[l1]},
    {label:'Manzil de la 2ème lettre', word: manzilName[l2]},
    {label:'Manzil de la 3ème lettre', word: manzilName[l3]},
    {label:'Nom du zodiaque', word: extra.def},
    {label:'Étoile régente', word: extra.planet},
    {label:'Jour de l\'étoile', word: extra.day}
  ];
  return items.map(it => ({...it, result: rauhaneNumber(it.word)}));
}

function renderRauhane(elId, rauhaneList){
  const el = document.getElementById('zd-'+elId);
  el.innerHTML = '';
  rauhaneList.forEach((r,idx) => {
    const div = document.createElement('div');
    div.className = 'kv';
    div.innerHTML = `${idx+1}. <b>${r.word}</b> (${r.label}) → ${r.result}`;
    el.appendChild(div);
  });
}

// ---- Texte d'invocation — transcrit tel que corrigé par l'utilisateur ----
const invocationTemplate =
`يا هكثا ءيل ٥٧٦

اجيبوا وتوكلوا ايتها الارواح الروحانية المشعشعة النورانية المستخرجة من دقاءق الحروف اجب يا __RAWHAN18__
توكلوا وامزجوا وتحرقوا قلب __MATLOUB__ في محبة وشوق وعطف __THALIB__ بحق اسماء الله __ALLAH18__ بقضاء حاجتي __THALIB2__ في الحال بارك الله فيكم و عليكم ان كانت الا صيحة واحدة فاذاهم جميع لدينا محضرون

برهته ١٢`;

function generateInvocation(talibName, matloubName, rauhaneTalibList, rauhaneMatloubList){
  let txt = invocationTemplate;
  const values = [...rauhaneTalibList.map(r => r.result), ...rauhaneMatloubList.map(r => r.result)];
  txt = txt.replace('__RAWHAN18__', values.join(' - '));
  txt = txt.replace('__ALLAH18__', "[.......... a completer : 18 noms d'Allah, un par rauhane, selon la 1ere lettre de son nom]");
  txt = txt.split('__MATLOUB__').join(matloubName);
  txt = txt.split('__THALIB2__').join(talibName);
  txt = txt.split('__THALIB__').join(talibName);
  return txt;
}

function renderLetters(elId, arr){
  document.getElementById('zd-'+elId).textContent = arr.join(' ');
}
function renderPairs(elId, pairs){
  const el = document.getElementById('zd-'+elId);
  el.innerHTML = '';
  pairs.forEach(([a,b]) => {
    const span = document.createElement('span');
    span.textContent = a + b;
    el.appendChild(span);
  });
}

function calculer(){
  const talibName = document.getElementById('zd-talib').value.trim();
  const matloubName = document.getElementById('zd-matloub').value.trim();
  const errEl = document.getElementById('zd-errMsg');

  if(!talibName || !matloubName){
    errEl.style.display = 'block';
    document.getElementById('zd-resultSection').style.display = 'none';
    return;
  }
  errEl.style.display = 'none';

  const zodTalib = getZodiac(talibName);
  const zodMatloub = getZodiac(matloubName);
  document.getElementById('zd-zodTalib').innerHTML = `<b>Talib</b> : N=${zodTalib.N} → reste=${zodTalib.index} → ${zodTalib.sign.name} → lettres : ${zodTalib.sign.letters.join(' ')}`;
  document.getElementById('zd-zodMatloub').innerHTML = `<b>Matloub</b> : N=${zodMatloub.N} → reste=${zodMatloub.index} → ${zodMatloub.sign.name} → lettres : ${zodMatloub.sign.letters.join(' ')}`;

  const rauhaneTalibList = computeRauhane(zodTalib);
  const rauhaneMatloubList = computeRauhane(zodMatloub);
  renderRauhane('rauhaneTalib', rauhaneTalibList);
  renderRauhane('rauhaneMatloub', rauhaneMatloubList);

  document.getElementById('zd-invocationText').textContent = generateInvocation(talibName, matloubName, rauhaneTalibList, rauhaneMatloubList);

  const talibLetters = lettersOnly(talibName);
  const matloubLetters = lettersOnly(matloubName);
  const nameBlock = interleaveNames(talibLetters, matloubLetters);
  renderLetters('nameBlock', nameBlock);
  document.getElementById('zd-nameBlockNote').textContent = `${nameBlock.length} lettres (talib cyclé, verrouillé sur une lettre du talib à la fin).`;

  const zodBlock = interleaveSimple(zodTalib.sign.letters, zodMatloub.sign.letters);
  renderLetters('zodBlock', zodBlock);

  const fusionBlock = fuseBlocks(nameBlock, zodBlock);
  renderLetters('fusionBlock', fusionBlock);

  const allumePairs = allumer(fusionBlock);
  renderPairs('allumeBlock', allumePairs);

  const allAllumedLetters = allumePairs.flat();
  const pmGlobal = allAllumedLetters.reduce((s,l) => s + (abjadValues[l]||0), 0);
  document.getElementById('zd-pmGlobal').innerHTML = `<b>PM global</b> (somme des ${allAllumedLetters.length} lettres allumées) = ${pmGlobal}`;

  const exp = expandNumber(pmGlobal);
  if(!exp){
    document.getElementById('zd-expansion').textContent = 'Nombre trop grand pour l\'expansion automatique (≥10000) — à faire manuellement.';
    document.getElementById('zd-kaabou').textContent = '';
    document.getElementById('zd-finalTalib').textContent = '—';
    document.getElementById('zd-finalMatloub').textContent = '—';
  } else {
    document.getElementById('zd-expansion').innerHTML = `<b>Nombre élargi</b> : ${exp.phrase} → ${exp.letterCount} lettres`;
    const kaabou = exp.letterCount * exp.letterCount;
    document.getElementById('zd-kaabou').innerHTML = `<b>Ka'abou</b> = ${exp.letterCount}×${exp.letterCount} = ${kaabou}`;

    const revMap = reverseMap(abjadValues);
    const kaabouLetters = numberToAbjadLetters(kaabou, revMap);
    const kaabouAllume = allumer(kaabouLetters);
    const kaabouAllumeLetters = kaabouAllume.flat();

    const half = Math.ceil(kaabouAllumeLetters.length/2);
    const talibBlock = kaabouAllumeLetters.slice(0, half);
    const matloubBlock = kaabouAllumeLetters.slice(half);
    document.getElementById('zd-finalTalib').textContent = talibBlock.join(' ');
    document.getElementById('zd-finalMatloub').textContent = matloubBlock.join(' ');
  }

  document.getElementById('zd-resultSection').style.display = 'block';
  document.getElementById('zd-resultSection').scrollIntoView({behavior:'smooth', block:'start'});
}

document.getElementById('zd-go').addEventListener('click',calculer);
document.getElementById('zd-btnOcc').addEventListener('click',()=>setSystem('occ'));
document.getElementById('zd-btnOri').addEventListener('click',()=>setSystem('ori'));
})();
