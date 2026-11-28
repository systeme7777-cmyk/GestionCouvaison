/* Activation : chaque code s'utilise une seule fois (vérifié en ligne sur Firebase).
   Seules les empreintes SHA-256 des codes sont stockées ici. */
(function(){
const PEPPER="GIGABYTES-ANSAR|v1|";
const CODES=new Set(["bff7a0c44a29191538254255a151afcb65d7c82949b133ce351dac1c28473e41", "48ad73fd48302581220aee12adfe87b67f134bc2d30e2e7640aad24765888d91", "d618bf374bd64fd35955b6c042433f2856eaccc74a56b0b5b9351f6746834df5", "5a929b3330460017a3493dcbfc15c29346140a88fc8e978eb8b9b7f713faefa3", "39a77bfeb67353b458c2c10ce0562cc979d90b7023cb92bb7af7d97d9236a8a2", "a7febb55176135647c8ef9e10002173c7fd3ed41502af09a90da0a4fb7d1c5ce", "4c973e310507a56203ddf538dec6f0f17789930cc8ef819233f6ef9a9d625733", "6e384f006e47c8544a577ab3fe0ff34af094f9edc8f010001565b7dbf2a4c2bd", "8a3a3d3ef5e5f9fd92004263b20f152b3bf63dbaee0d839336d7f1c7df393dd7", "26a2a8cb89b5cfb0ceed97d17554b8648c2c4f809e37bcf487724e65c501fa2e", "a2d7c0fe0dd8048c8e872de51c0db6e43abff576a120093a9ff40447295b2d1e", "11fb4d7033017944619a26e68e14988feed8d32c7a9d71f832dcc02b77c43075", "f5db18ed926d0d70649c0099a21290a86c29d6d7f5d49bb77fd715cfea8e5a29", "b559d19f2e237a7cbe2ae8535de29f3dced1c45c46e131e5c98fd6d3b72cdf0e", "b010a216aeecbef17d0539b99397c432ff2afa182595e6aff774fcd13dd1faf2", "dcab6a4ebba1289fe59d7069de1ab8eea1ba351c1ed8f597b7235af1dab07dc4", "ff4552ad64a176cf3192e2d00437f3a67dc916438d116ce4fdd1f04c3d0293ec", "d54271c5e4a71f8762856dae06d840a1d388df29e6404f7fb7eac93fb6d19461", "7e02f0dcbeb8e1bc2d17c438c9e1f6df0c6036aa7e36a8ff775af4beed79bdf6", "c526822b0030e778dbc5167c12c4d7ca295a33d0ee1c598557e7d9d065852499", "86fddedf2b96fc2cbe21caa9d95f82abc28d38ba5d0274c97164ba87247308e9", "4b8fafe4f99c937054d4580dc4005d20ad2ef993978d4041ad2689a03101ecd6", "2e8f841d00c0b86844bb51b1f6ffb0043b8ac5e5ce1e852f8194a3d54416d028", "a2fdf288d2f2f63afbd4808485bd4d8314bcf6b5b30c1f39d12d84142815b40b", "29899e3165f4cc1a588ac777c57ec540a2b17c365ca16d0a89408ee6807f2e6f", "4ddb660b88af26afffdb2bf2aaaa0b9829ff18146f99e20ca84a15414013341b", "d6f2d2de8a00ecd6bcc1d0b0eb73b75f14f458de84630489677a3a91f76be6c1", "27900b8cd3917775285457b76e3d41cc6805d88d404c744d903cc67d008fa9f0", "5beddf7c791c9f36738895710b28d06d078777decd929cfff1247fe7806d15c3", "267f208c06c816c0823e609fee0d6aea28c608a1200b191fa2130d52d69cac8c", "87ec3fad2e6b34e9104aa4ebaf60483b8234ac62f0c2587a87b50a2293e1da60", "d5c6219e4c0e91425fc02d0f89c6fd917d4dec6de7c0eb25148f50f322cdb1c4", "3329c6784562be485a216594c068f057d5197284a2ab3aa95be27c3edec83cc9", "0a2fd6eec60ad86b848646f2f6b0c0ffc452143f781af1b6a02f76368f83752f", "075d5fde3f2baf9826a1d806464b65ab1265efdd54ac7429ef9717c22b4c1d4f", "c58239d9038a4341e8feab387ddde84036bf499d84d8cdf4f87dd3726e726c63", "c59c227e04ab091e2b0f100ec7bed4f324cef7882fe07bdaf0500540acd1a686", "12d8b676bb92a4de7a4a411fb4eabe7c49720bbd88f7de3fc5a55a929b99a8bf", "e92f95fd285e9bd6e492efa675f2ee8df6b86268294bf2718c587a1e2756bdbc", "0f631ed43b9a1a09f088ee966a6ece560bbd8f6318dffd78e9126928149594a4", "9f86e8070200de04f654de430f1426da9adbe11e81bc7886c540026345dea7e5", "29508cf877d247784cd50688ab5ac2328ef5d2b6e8dd4e7b115235a45b1edff9", "452767c8edf0fbb97affddc17b524cce720974e31be81fe20b64b787dbde4b6f", "88c55ec98ff725d21a128d648f6004918c07ca9133e6e63aef90fbb061de0a21", "715b5f96b07afe13a6d5c1e7c029e10ce6345e9798e62788d96421db805b44d7", "93193abe2833445a4b3d568bd4a7553f13098b6a5d8844b5179fb8d6d2ae57c9", "6251f53c3df5267a17025b5c5319927cbea7d88be9da5b3f2c7bc31407fc07d2", "7f3bbd11e8b1d1ea5a0d97c88751548e8d80562e5c839ea31bc5fdee86500d3c", "25deaf07b8ba1c53af9ebb215178997d0e32d5bd539681c8e200ee8508772f1d", "7226db37382b256c5a6233798324ecadea85baf5d5a06990cdc9727705c937bc"]);
function sha256(str){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes=new TextEncoder().encode(str), l=bytes.length;
  const n=((l+9+63)>>6)<<6, m=new Uint8Array(n); m.set(bytes); m[l]=0x80;
  const bl=l*8; for(let i=0;i<4;i++) m[n-1-i]=(bl>>>(8*i))&255;
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w=new Uint32Array(64), r=(x,k)=>(x>>>k)|(x<<(32-k));
  for(let o=0;o<n;o+=64){
    for(let i=0;i<16;i++) w[i]=(m[o+4*i]<<24)|(m[o+4*i+1]<<16)|(m[o+4*i+2]<<8)|m[o+4*i+3];
    for(let i=16;i<64;i++){const s0=r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3), s1=r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0;
      const t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H=[H[0]+a,H[1]+b,H[2]+c,H[3]+d,H[4]+e,H[5]+f,H[6]+g,H[7]+h].map(x=>x|0);
  }
  return H.map(x=>(x>>>0).toString(16).padStart(8,"0")).join("");
}
window.__sha256=sha256;
const KEY="cm-activation", USED="cm-codes-utilises";
function get(k){try{return localStorage.getItem(k);}catch(_){return null;}}
function set(k,v){try{localStorage.setItem(k,v);}catch(_){}}
const gate=document.getElementById("gate");
function unlock(){ document.documentElement.classList.remove("locked"); gate.hidden=true; }
const act=get(KEY);
if(act && CODES.has(act)) { unlock(); return; }
document.documentElement.classList.add("locked"); gate.hidden=false;
const inp=document.getElementById("gate-code"), err=document.getElementById("gate-err"), btn=document.getElementById("gate-go");
inp.addEventListener("input",()=>{
  let v=inp.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);
  inp.value=v.replace(/(.{4})(?=.)/g,"$1-"); err.textContent="";
});
/* Vérification en ligne (Firebase Firestore) : le code est inscrit comme utilisé.
   Une seconde inscription du même code est refusée par Firebase (code déjà utilisé). */
const FS="https://firestore.googleapis.com/v1/projects/gestion-couvaison/databases/(default)/documents/usedCodes";
const API_KEY="AIzaSyDTDioB3qnk7RQZuQuFyMt613nEQhMVnek";
function deviceId(){
  let d=get("cm-device");
  if(!d){ d=Array.from({length:16},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join(""); set("cm-device",d); }
  return d;
}
async function inscrire(raw){
  const id=sha256("GIGABYTES-ANSAR|used|v1|"+raw);
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch(`${FS}?documentId=${id}&key=${API_KEY}`,{
      method:"POST", headers:{"Content-Type":"application/json"}, signal:ctrl.signal,
      body:JSON.stringify({fields:{usedAt:{timestampValue:new Date().toISOString()},device:{stringValue:deviceId()},app:{stringValue:"carres-magiques"}}})
    });
    if(r.ok) return "ok";
    if(r.status===409) return "deja";
    return "refuse";
  }catch(_){ return "reseau"; }
  finally{ clearTimeout(t); }
}
let busy=false;
async function tryCode(){
  if(busy) return;
  const raw=inp.value.toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(raw.length!==12){ err.textContent="Le code contient 12 caractères."; return; }
  const h=sha256(PEPPER+raw);
  let used=[]; try{used=JSON.parse(get(USED)||"[]");}catch(_){}
  if(used.includes(h)){ err.textContent="Ce code a déjà été utilisé."; return; }
  if(!CODES.has(h)){ err.textContent="Code invalide."; inp.classList.add("shake"); setTimeout(()=>inp.classList.remove("shake"),400); return; }
  busy=true; btn.disabled=true; btn.textContent="Vérification…"; err.textContent="";
  const res=await inscrire(raw);
  busy=false; btn.disabled=false; btn.textContent="Activer";
  if(res==="ok"){ used.push(h); set(USED,JSON.stringify(used)); set(KEY,h); unlock(); return; }
  if(res==="deja"){ used.push(h); set(USED,JSON.stringify(used)); err.textContent="Ce code a déjà été utilisé."; return; }
  if(res==="reseau"){ err.textContent="Connexion internet nécessaire pour activer."; return; }
  err.textContent="Activation refusée. Réessayez plus tard.";
}
btn.addEventListener("click",tryCode);
inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); tryCode(); } });
})();
