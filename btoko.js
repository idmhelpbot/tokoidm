const fs = require('fs');
const path = require('path');

// 🔥 pakai engine yang SUDAH TEMBUS
const { getDetailToko } = require('./toko');


// ================= DELAY =================
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function randomDelay(){
  // jangan terlalu cepat!
  return 1500 + Math.random()*2000; // 1.5 – 3.5 detik
}



// ================= DB =================
const dbPath = path.join(__dirname,'toko.json');

function loadDB(){
  try{
    if(!fs.existsSync(dbPath)) return [];
    return JSON.parse(fs.readFileSync(dbPath,'utf8'));
  }catch{
    console.log('⚠️ toko.json rusak — reset otomatis');
    return [];
  }
}

function saveDB(db){

  const temp = dbPath+'.tmp';

  fs.writeFileSync(temp,JSON.stringify(db,null,2));
  fs.renameSync(temp,dbPath);
}



// ================= LOAD LIST =================
function loadKodeToko(){

  const file = path.join(__dirname,'toko.txt');

  if(!fs.existsSync(file)){
    console.log('❌ toko.txt tidak ditemukan!');
    process.exit(1);
  }

  return fs.readFileSync(file,'utf8')
    .split('\n')
    .map(v=>v.trim().toUpperCase())
    .filter(Boolean);
}



// ================= FORMAT =================
function formatToko(toko,no){

  const lat = Number(toko.latitude);
  const lng = Number(toko.longitude);

  return{
    no,
    storeCode:toko.storeCode||null,
    storeName:toko.storeName||null,
    storeType:toko.storeType||null,
    dcCode:toko.dcCode||null,
    address:toko.address||null,
    openingHour:toko.openingHour||null,
    closingHour:toko.closingHour||null,
    latitude:lat,
    longitude:lng,
    operational:toko.operational??null,
    googleMaps:
      Number.isFinite(lat)&&Number.isFinite(lng)
        ?`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        :null
  };
}



// ================= MAIN =================
(async()=>{

console.log('\n🚀 BACKUP TOKO DIMULAI (ENGINE TOKO.JS)...\n');

const kodeList = loadKodeToko();
let db = loadDB();

const existing = new Set(db.map(t=>t.storeCode));
let nomor = db.length + 1;


// 🔥 TEST ENGINE DULU
console.log('🔍 Test request...');

const test = await getDetailToko('FWCL', true);

if(!test){
  console.log('\n❌ Engine toko.js gagal ambil data.');
  console.log('👉 Kemungkinan token atau IP kena limit.\n');
  process.exit(1);
}

console.log('✅ Engine OK!\n');
console.log(`📊 Resume aktif → ${db.length} toko sudah tersimpan\n`);




for(const kode of kodeList){

  if(existing.has(kode))
    continue;

  const toko = await getDetailToko(kode, true);

  if(toko){

    db.push(formatToko(toko,nomor++));
    existing.add(kode);

    saveDB(db);

    console.log(`✅ No.${nomor-1} | ${kode} | saved`);

  }else{

    console.log(`⚠️ ${kode} tidak ditemukan / dilimit`);
  }

  await sleep(randomDelay());
}



console.log('\n🎉 BACKUP SELESAI!');
console.log(`📦 Total toko: ${db.length}\n`);

})();
