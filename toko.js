const axios = require('axios');
const { readTokenFromFile, buildHeaders } = require('./utils');

const URL_NEAREST = 'https://ap-mc.klikindomaret.com/assets-klikidmorder/api/get/catalog-xpress/api/webapp/stores/nearest';
const MAX_RETRY = 2;

async function getDetailToko(kodeToko, returnData = false, coord = { latitude: -6.9173248, longitude: 107.610112 }) {
  const kode = String(kodeToko || '').trim().toUpperCase();
  const fallback = { storeCode: kode || '-', storeName: kode || '-' };
  if (!kode) return returnData ? fallback : logToko(fallback);

  let token = null;
  try { token = await readTokenFromFile(); } catch {}
  if (!token) return returnData ? fallback : logToko(fallback);

  const base = buildHeaders(token) || {};
  const headers = {
    ...base,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.klikindomaret.com',
    'Referer': 'https://www.klikindomaret.com/',
    'x-correlation-id': Date.now().toString(),
    apps: 'klikindomaret',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua-platform': '"Windows"',
    Connection: 'keep-alive',
    'Accept-Encoding': 'gzip, deflate, br, zstd'
  };

  const params = {
    latitude: coord?.latitude ?? -6.9173248,
    longitude: coord?.longitude ?? 107.610112,
    page: 0,
    keyword: kode,
    selectedStoreCode: kode
  };

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await axios.get(URL_NEAREST, {
        params,
        headers,
        timeout: 12000,
        validateStatus: () => true
      });

      if (res.status === 401 || res.status === 403) {
        return returnData ? fallback : logToko(fallback);
      }
      if (res.status >= 500) {
        if (attempt < MAX_RETRY) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return returnData ? fallback : logToko(fallback);
      }

      const content = res?.data?.data?.content;
      const list = Array.isArray(content) ? content : [];
      const toko =
        list.find(it => String(it?.storeCode || '').toUpperCase() === kode) ||
        list[0];
      if (!toko) return returnData ? fallback : logToko(fallback);

      const clean = {
        storeCode: toko.storeCode ?? kode,
        storeName: toko.storeName ?? toko.name ?? kode,
        storeType: toko.storeType ?? '-',
        dcCode: toko.dcCode ?? '-',
        address: toko.address ?? '-',
        openingHour: toko.openingHour ?? toko.openHour ?? '-',
        closingHour: toko.closingHour ?? toko.closeHour ?? '-',
        distanceString: toko.distanceString ?? toko.distance ?? '-',
        latitude: isFiniteNumber(toko.latitude) ? Number(toko.latitude) : null,
        longitude: isFiniteNumber(toko.longitude) ? Number(toko.longitude) : null,
        operational:
          typeof toko.operational === 'boolean'
            ? toko.operational
            : parseOperational(toko)
      };

      return returnData ? clean : logToko(clean);
    } catch (err) {
      if (isTransient(err) && attempt < MAX_RETRY) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return returnData ? fallback : logToko(fallback);
    }
  }

  return returnData ? fallback : logToko(fallback);
}

/**
 * Cari daftar toko di sekitar koordinat (dipakai untuk kirim lokasi user).
 * Mengembalikan { coord, stores } mirip sekitar.js, tapi tanpa selectedStoreCode & tanpa filter khusus.
 */
async function cariTokoNearby(latitude, longitude) {
  const coord = {
    latitude: Number(latitude),
    longitude: Number(longitude)
  };

  let token = null;
  try { token = await readTokenFromFile(); } catch {}
  if (!token) {
    return { coord, stores: [] };
  }

  const base = buildHeaders(token) || {};
  const headers = {
    ...base,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.klikindomaret.com',
    'Referer': 'https://www.klikindomaret.com/',
    'x-correlation-id': Date.now().toString(),
    apps: 'klikindomaret',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua-platform': '"Windows"',
    Connection: 'keep-alive',
    'Accept-Encoding': 'gzip, deflate, br, zstd'
  };

  const params = {
    latitude: coord.latitude,
    longitude: coord.longitude,
    page: 0,
    keyword: '',          // tidak filter kode tertentu
    selectedStoreCode: '' // penting: kosong supaya cari sekitar titik
  };

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await axios.get(URL_NEAREST, {
        params,
        headers,
        timeout: 12000,
        validateStatus: () => true
      });

      if (res.status === 401 || res.status === 403) {
        // token tidak valid → anggap tidak ada hasil
        return { coord, stores: [] };
      }
      if (res.status >= 500) {
        if (attempt < MAX_RETRY) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return { coord, stores: [] };
      }

      const content = res?.data?.data?.content;
      const stores = Array.isArray(content) ? content : [];
      return { coord, stores };
    } catch (err) {
      lastError = err;
      if (isTransient(err) && attempt < MAX_RETRY) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  return { coord, stores: [] };
}

function isTransient(err) {
  const msg = String(err?.message || '');
  return (
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('timeout') ||
    /ECONNRESET|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)
  );
}

function isFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n);
}

function parseOperational(toko) {
  const s = String(toko?.status || toko?.storeStatus || '').toLowerCase();
  if (!s) return null;
  if (/(open|buka|operational|aktif)/i.test(s)) return true;
  if (/(closed|tutup|non-aktif|nonaktif)/i.test(s)) return false;
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function logToko(toko) {
  try {
    console.log(`📦 KODE TOKO : ${toko.storeCode || '-'}`);
    console.log(`🏪 NAMA TOKO : ${toko.storeName || '-'}`);
    if (toko.address) console.log(`📍 ALAMAT : ${toko.address}`);
    if (toko.openingHour || toko.closingHour) {
      console.log(
        `🕒 JAM BUKA : ${toko.openingHour || '-'} - ${toko.closingHour || '-'}`
      );
    }
    if (toko.distanceString) console.log(`📏 JARAK : ${toko.distanceString}`);
    if (Number.isFinite(toko.latitude) && Number.isFinite(toko.longitude)) {
      console.log(`🌐 KOORDINAT : ${toko.latitude}, ${toko.longitude}`);
    }
    if (typeof toko.operational === 'boolean') {
      console.log(`✅ STATUS : ${toko.operational ? 'Buka' : 'Tutup'}`);
    }
  } catch {}
}

module.exports = {
  getDetailToko,
  cariTokoNearby
};
