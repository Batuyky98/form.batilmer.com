import crypto from 'node:crypto';
import { hotp, base32Decode, currentStep } from '../server/src/totp.js';
import { DatabaseSync } from 'node:sqlite';
const B = process.env.TEST_URL || 'http://localhost:3999';
const DATA = process.argv[2];
const jars = {};
async function rpc(who, name, ...args) {
  const bg = who.endsWith('bg');
  const w = bg ? who.slice(0, -2) : who;
  const r = await fetch(`${B}/api/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-batilmer': '1', cookie: jars[w] || '', ...(bg ? { 'x-batilmer-bg': '1' } : {}) }, body: JSON.stringify(args) });
  const sc = r.headers.get('set-cookie');
  if (sc) jars[w] = sc.split(';')[0];
  const j = await r.json();
  if (j.error) {
    const e = new Error(j.error.message);
    e.code = j.error.code;
    throw e;
  }
  return j.result;
}
const ok = (c, m) => {
  console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);
  if (!c) process.exitCode = 1;
};
const code = (sec, off = 0) => hotp(base32Decode(sec), currentStep() + off);
const ex = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
};

let u = await rpc('a', 'login', 'info@batilmer.com', 'Gecici.Sifre1');
ok(u.mustChange && u.twofaSetupRequired, 'admin ilk giriş: şifre + 2FA gerekli');
await rpc('a', 'changePassword', 'Gecici.Sifre1', 'Yeni.Sifre123');
let e = await ex(rpc('a', 'listForms'));
ok(e?.code === '2fa_kurulum', 'admin 2FA kurmadan işlem yapamaz');
const st = await rpc('a', 'totpSetupStart');
ok(st.url.startsWith('otpauth://'), 'otpauth url');
e = await ex(rpc('a', 'totpSetupConfirm', '000000'));
ok(e, 'yanlış kod reddedildi');
const conf = await rpc('a', 'totpSetupConfirm', code(st.secret));
ok(conf.backupCodes.length === 10, '10 yedek kod');
ok((await rpc('a', 'listForms')).length === 0, 'kurulumdan sonra işlem yapılabiliyor');
await rpc('a', 'logout');
const t = await rpc('a', 'login', 'info@batilmer.com', 'Yeni.Sifre123');
ok(t.twofa && t.ticket, 'şifreden sonra kod isteniyor');
e = await ex(rpc('a', 'loginTotp', t.ticket, code(st.secret)));
ok(e, 'aynı kod tekrar kullanılamaz (replay)');
u = await rpc('a', 'loginTotp', t.ticket, conf.backupCodes[0]);
ok(u.role === 'admin', 'yedek kodla giriş');
const t2 = await rpc('a', 'login', 'info@batilmer.com', 'Yeni.Sifre123');
e = await ex(rpc('a', 'loginTotp', t2.ticket, conf.backupCodes[0]));
ok(e, 'yedek kod tek kullanımlık');
u = await rpc('a', 'loginTotp', t2.ticket, conf.backupCodes[1]);

const fid = await rpc('a', 'createForm', { name: 'Randevu formu', isletme: 'Vital Veteriner', templateId: 'veteriner' });
const f = await rpc('a', 'getForm', fid);
ok(f.draft.settings.customerMails === false && !('notifyEmails' in f.draft.settings), 'müşteri maili varsayılan kapalı');
f.draft.randevu.openFrom = '2030-01-01';
await rpc('a', 'saveDraft', fid, f.draft);
await rpc('a', 'publishForm', fid, {});
let slots = await rpc('p', 'getAvailability', f.slug, { date: '2029-12-31', serviceId: 'svc_muayene' });
ok(slots.length === 0, 'açılış tarihinden önce saat yok');
slots = await rpc('p', 'getAvailability', f.slug, { date: '2030-01-02', serviceId: 'svc_muayene' });
ok(slots.length > 0, 'açılış tarihinden sonra saat var');
f.draft.randevu.openFrom = '';
f.draft.randevu.minNoticeHours = 0;
await rpc('a', 'saveDraft', fid, f.draft);
await rpc('a', 'publishForm', fid, {});

const vet = await rpc('a', 'createUser', { name: 'Veteriner', email: 'vet@test.com', password: 'Vet.Sifre123' });
const sek = await rpc('a', 'createUser', { name: 'Sekreter', email: 'sek@test.com', password: 'Sek.Sifre123' });
const other = await rpc('a', 'createForm', { name: 'Başka form', isletme: 'Kafe', templateId: 'kafe' });
const pv = await rpc('a', 'setPermission', vet.id, fid, { view: true, randevu: true, notify: true });
ok(pv.notify && pv.view, 'veterinere bildirim tiki');
await rpc('a', 'setPermission', sek.id, fid, { view: true, randevu: true, notify: false });
await rpc('v', 'login', 'vet@test.com', 'Vet.Sifre123');
await rpc('v', 'changePassword', 'Vet.Sifre123', 'Vet.Sifre1234');
await rpc('s', 'login', 'sek@test.com', 'Sek.Sifre123');
await rpc('s', 'changePassword', 'Sek.Sifre123', 'Sek.Sifre1234');
ok((await rpc('v', 'listForms')).map((x) => x.id).join() === fid, 'veteriner sadece kendi formunu görüyor');
e = await ex(rpc('v', 'getForm', other));
ok(e?.code === 'yetki', 'başka formu açamıyor');

const ua = crypto.createECDH('prime256v1');
ua.generateKeys();
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-abc', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
e = await ex(rpc('v', 'savePushSubscription', { ...sub, endpoint: 'https://evil.example.com/x' }, 'x'));
ok(e, 'bilinmeyen push adresi reddedildi');
await rpc('v', 'savePushSubscription', sub, 'Android · Chrome');
ok((await rpc('v', 'pushConfig')).publicKey.length === 87, 'vapid anahtarı');

const day = (() => {
  for (let i = 1; i < 10; i++) {
    const d = new Date(Date.now() + i * 864e5 + 3 * 3600e3).toISOString().slice(0, 10);
    if (new Date(d).getUTCDay() !== 0) return d;
  }
})();
slots = await rpc('p', 'getAvailability', f.slug, { date: day, serviceId: 'svc_muayene' });
const res = await rpc('p', 'submitForm', f.slug, { ad_soyad: 'Ali Veli', telefon: '0532 111 22 33', email: 'ali@x.com', hayvan_adi: 'Pamuk', hayvan_turu: '🐱 Kedi', randevu: { date: day, time: slots[0].time, serviceId: 'svc_muayene' } }, { startedAt: Date.now() - 5000, kvkkAccepted: true });
ok(res.appointment?.cancelUrl?.includes('/iptal/') && res.appointment.icsUrl && res.appointment.googleUrl.startsWith('https://calendar.google.com'), 'müşteri kartı: iptal + takvim linkleri');
const out = await rpc('a', 'listOutbox');
ok(!out.some((m) => m.to === 'ali@x.com'), 'müşteriye mail gitmedi');
const pv1 = await rpc('vbg', 'pollNotifications', 0);
ok(pv1.items.length === 1 && pv1.items[0].title === 'Yeni randevu' && !pv1.items[0].body.includes('Ali') && pv1.unread === 1, 'veterinere bildirim, kişisel veri yok: ' + pv1.items[0]?.body);
ok(pv1.session && pv1.session.idleLeftMs > 7000000, 'oturum bilgisi');
ok((await rpc('sbg', 'pollNotifications', 0)).items.length === 0, 'tiki olmayan sekretere bildirim yok');
ok((await rpc('abg', 'pollNotifications', 0)).items.length === 0, 'Ana Admin varsayılan bildirim almıyor');

const icsR = await fetch(res.appointment.icsUrl);
const ics = await icsR.text();
ok(icsR.headers.get('content-type').startsWith('text/calendar') && ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-P1D'), 'ics dosyası');

await rpc('p', 'cancelByToken', res.appointment.cancelUrl.split('/').pop());
const pv2 = await rpc('vbg', 'pollNotifications', 0);
ok(pv2.items[0].kind === 'iptal', 'iptal bildirimi: ' + pv2.items[0].title);
ok((await fetch(res.appointment.icsUrl)).status === 404, 'iptal edilen randevunun takvim dosyası kapandı');

await new Promise((r) => setTimeout(r, 4000));
const db = new DatabaseSync(`${DATA}/batilmer.sqlite`);
console.log('push durumu:', db.prepare('SELECT push_done, COUNT(*) c FROM notifications GROUP BY push_done').all());

await rpc('a', 'setPermission', vet.id, fid, { view: true, randevu: true, notify: false });
ok((await rpc('vbg', 'pollNotifications', 0)).items.length === 0, 'tik kaldırılınca bildirim akışı kesildi');

db.prepare('UPDATE sessions SET last_seen = ? WHERE user_id = ?').run(Date.now() - 2 * 3600e3 - 1000, vet.id);
e = await ex(rpc('v', 'listForms'));
ok(e?.code === 'oturum', '2 saat işlem yoksa oturum kapandı');
await rpc('s', 'listForms');
db.prepare('UPDATE sessions SET last_seen = ? WHERE user_id = ?').run(Date.now() - 3600e3, sek.id);
const before = db.prepare('SELECT last_seen FROM sessions WHERE user_id = ?').get(sek.id).last_seen;
await rpc('sbg', 'pollNotifications', 0);
ok(db.prepare('SELECT last_seen FROM sessions WHERE user_id = ?').get(sek.id).last_seen === before, 'arka plan kontrolü süreyi uzatmıyor');
await rpc('s', 'touchSession');
ok(db.prepare('SELECT last_seen FROM sessions WHERE user_id = ?').get(sek.id).last_seen > before, 'kullanıcı işlemi süreyi uzatıyor');
db.prepare('UPDATE sessions SET created_at = ? WHERE user_id = ?').run(Date.now() - 12 * 3600e3 - 1000, sek.id);
e = await ex(rpc('s', 'touchSession'));
ok(e?.code === 'oturum', '12 saat üst sınır');

await rpc('v', 'login', 'vet@test.com', 'Vet.Sifre1234');
const sub2 = { ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/test-def' };
await rpc('v', 'savePushSubscription', sub2, 'iPhone');
const n1 = (await rpc('v', 'myNotificationSettings', sub2.endpoint)).devices;
await rpc('v', 'logout', sub2.endpoint);
await rpc('v', 'login', 'vet@test.com', 'Vet.Sifre1234');
const n2 = (await rpc('v', 'myNotificationSettings', '')).devices;
ok(n1.some((d) => d.thisDevice) && n2.length === n1.length - 1, `çıkış yapınca o cihazın bildirimi silindi (${n1.length} → ${n2.length})`);
const users = await rpc('a', 'listUsers');
console.log(users.map((x) => `${x.name}: ${x.formCount} form, ${x.notifyFormCount} bildirim, ${x.pushDevices} cihaz, 2fa=${x.twofaEnabled}`).join('\n'));
e = await ex(rpc('a', 'deleteUser', users.find((x) => x.role === 'admin').id));
ok(e, 'kendi Ana Admin hesabını silemez');

// ---------------------------------------------------------------- WhatsApp hatırlatma + müşteri kartı
const g = await rpc('a', 'getForm', fid);
for (const d of [0, 1, 2, 3, 4, 5, 6]) g.draft.randevu.hours[d] = [{ start: '09:00', end: '18:00' }];
g.draft.randevu.minNoticeHours = 0;
g.draft.settings.customerMails = true; // kalıcı silmede giden maillerin de silindiğini görmek için
g.draft.randevu.wa = { enabled: true, when: 'once', notifyAt: new Date(Date.now() + 3 * 3600e3).toISOString().slice(11, 16), text: 'Merhaba {ad}, {hayvan_adi} için {gun} saat {saat} randevunuz var. İptal: {iptal_linki}' };
await rpc('a', 'saveDraft', fid, g.draft);
await rpc('a', 'publishForm', fid, {});
const tomorrow = new Date(Date.now() + 864e5 + 3 * 3600e3).toISOString().slice(0, 10);
const submitT = async (name, phone, pet, i) => { const sl = await rpc('p', 'getAvailability', f.slug, { date: tomorrow, serviceId: 'svc_muayene' }); return rpc('p', 'submitForm', f.slug, { ad_soyad: name, telefon: phone, email: `${pet.toLowerCase()}@x.com`, hayvan_adi: pet, hayvan_turu: '🐱 Kedi', randevu: { date: tomorrow, time: sl[i].time, serviceId: 'svc_muayene' } }, { startedAt: Date.now() - 5000, kvkkAccepted: true }); };
await submitT('Ali Veli', '+90 532 111 22 33', 'Pamuk', 3);
await submitT('Zeynep Kaya', '0212 555 11 22', 'Boncuk', 8);
let rem = await rpc('v', 'listReminders', { day: 'yarin' });
const ali = rem.items.find((x) => x.name === 'Ali Veli');
ok(ali && ali.waUrl.startsWith('https://wa.me/905321112233?text=') && ali.text.includes('Pamuk') && ali.text.includes('yarın') && ali.text.includes('/iptal/'), 'hatırlatma: WhatsApp linki ve hazır metin');
ok(rem.items.find((x) => x.name === 'Zeynep Kaya')?.waUrl === '', 'sabit hatta WhatsApp düğmesi yok');
ok(ali.customerKey === '5321112233' && !ali.firstTime, 'aynı telefon eski kayıtla eşleşti (ilk kez değil)');
ok(rem.counts.yarin === 2, 'yarın sayısı');
await rpc('v', 'markReminded', ali.id, true);
rem = await rpc('a', 'listReminders', { day: 'yarin' });
ok(rem.items.find((x) => x.id === ali.id).waBy === 'Veteriner', 'hatırlatıldı işareti herkeste görünüyor');
await rpc('a', 'markReminded', ali.id, false);
ok(!(await rpc('a', 'listReminders', { day: 'yarin' })).items.find((x) => x.id === ali.id).waAt, 'geri alındı');

// günlük "hatırlatmaları gönderin" bildirimi (zamanlayıcı doğrudan çalıştırılır)
await rpc('a', 'setPermission', vet.id, fid, { view: true, randevu: true, notify: true });
process.env.DB_DRIVER = 'sqlite';
process.env.DATA_DIR = DATA;
const { connect } = await import('../server/src/db.js');
const { _test: sched } = await import('../server/src/scheduler.js');
const sdb = await connect();
await sched.dailyReminderNotice(sdb);
await sched.dailyReminderNotice(sdb);
const hn = (await rpc('vbg', 'pollNotifications', 0)).items.filter((x) => x.kind === 'hatirlatma');
ok(hn.length === 1 && hn[0].body.includes('Yarın 2 randevu') && !hn[0].body.includes('Ali'), 'günlük hatırlatma bildirimi bir kez, kişisel veri yok: ' + hn[0]?.body);

// müşteri kartı
const cl = await rpc('a', 'listCustomers', {});
const cAli = cl.items.find((x) => x.key === '5321112233');
ok(cAli && cAli.records === 2 && cAli.name === 'Ali Veli', 'müşteri listesi: aynı telefon tek müşteri');
ok((await rpc('a', 'listCustomers', { q: '0532 111' })).items.some((x) => x.key === '5321112233'), 'telefonla arama');
ok((await rpc('a', 'listCustomers', { q: 'zeynep' })).items.length === 1, 'isimle arama');
const card = await rpc('v', 'getCustomer', '05321112233');
ok(card.items.length === 2 && card.stats.iptal === 1 && card.upcoming.length === 1 && card.items.some((i) => i.details.some((d) => d.value === 'Pamuk')), 'müşteri kartı: geçmiş, iptal, yaklaşan randevu, hayvan adı');
const note = await rpc('v', 'addCustomerNote', '5321112233', fid, 'Kuduz aşısı Mart 2027');
ok((await rpc('a', 'getCustomer', '5321112233')).notes[0].text === 'Kuduz aşısı Mart 2027', 'müşteri notu');
const nobody = await rpc('a', 'createUser', { name: 'Yetkisiz', email: 'yok@test.com', password: 'Yok.Sifre1234' });
await rpc('n', 'login', 'yok@test.com', 'Yok.Sifre1234');
await rpc('n', 'changePassword', 'Yok.Sifre1234', 'Yok.Sifre12345');
e = await ex(rpc('n', 'getCustomer', '5321112233'));
ok(e?.code === 'yok', 'yetkisiz kullanıcı müşteri kartını göremez');
ok((await rpc('n', 'listCustomers', {})).items.length === 0 && (await rpc('n', 'listReminders', {})).items.length === 0, 'yetkisiz kullanıcıya liste boş');
e = await ex(rpc('n', 'deleteCustomerNote', note.id));
ok(e, 'yetkisiz kullanıcı not silemez');
await rpc('a', 'deleteCustomerNote', note.id);
ok((await rpc('a', 'getCustomer', '5321112233')).notes.length === 0, 'Ana Admin notu sildi');
void nobody;

// logo: sadece küçük resim kabul edilir
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const lg = await rpc('a', 'getForm', fid);
lg.draft.appearance.logo = png;
await rpc('a', 'saveDraft', fid, lg.draft);
ok((await rpc('a', 'getForm', fid)).draft.appearance.logo === png, 'logo kaydedildi');
lg.draft.appearance.logo = 'javascript:alert(1)';
await rpc('a', 'saveDraft', fid, lg.draft);
ok((await rpc('a', 'getForm', fid)).draft.appearance.logo === '', 'geçersiz logo reddedildi');

const izler = [];
// test kayıtlarını temizleme: sadece Ana Admin, link yazılarak
e = await ex(rpc('v', 'purgeFormData', fid, f.slug));
ok(e, 'kullanıcı test kayıtlarını silemez');
e = await ex(rpc('a', 'purgeFormData', fid, 'yanlis-link'));
ok(e, 'link yanlışsa silinmez');
const before2 = (await rpc('a', 'listSubmissions', fid)).rows.length;
const pr = await rpc('a', 'purgeFormData', fid, f.slug);
ok(before2 > 0 && pr.deleted === before2 && (await rpc('a', 'listSubmissions', fid)).rows.length === 0, `test kayıtları temizlendi (${pr.deleted})`);
ok((await rpc('a', 'getForm', fid)).draft.fields.length > 0, 'form alanları duruyor');
// tek kayıt: çöp kutusu → kalıcı sil
await submitT('Deniz Yıldız', '0544 999 88 77', 'Tarçın', 5);
const dz = (await rpc('a', 'listSubmissions', fid)).rows.find((r) => Object.values(r.values).includes('Deniz Yıldız'));
await rpc('a', 'addCustomerNote', '5449998877', fid, 'Deniz notu');
await rpc('a', 'deleteSubmission', dz.id);
await rpc('a', 'purgeItem', 'submission', dz.id);
izler.push('Deniz Yıldız', 'Tarçın', '5449998877', 'tarçın@x.com', 'Deniz notu');
// kalıcı silmeden sonra veritabanının HİÇBİR tablosunda müşteriye dair iz kalmamalı
const sdb2 = new DatabaseSync(`${DATA}/batilmer.sqlite`);
izler.push('Ali Veli', 'Pamuk', 'Boncuk', '5321112233', 'ali@x.com', 'pamuk@x.com', 'Zeynep Kaya', '2125551122', 'Kuduz aşısı');
const bulunan = [];
for (const { name } of sdb2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
  for (const row of sdb2.prepare(`SELECT * FROM "${name}"`).all()) {
    const txt = JSON.stringify(row);
    for (const w of izler) if (txt.includes(w)) bulunan.push(`${name}: ${w}`);
  }
}
ok(bulunan.length === 0, 'kalıcı silmeden sonra hiçbir tabloda iz yok' + (bulunan.length ? ': ' + [...new Set(bulunan)].join(', ') : ''));

