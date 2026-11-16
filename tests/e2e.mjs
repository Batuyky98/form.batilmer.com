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
const addDays2 = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
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

// müsaitlik: randevu yetkisi olan personel (formu düzenleyemese de) saatleri yönetir
const sc = await rpc('v', 'getSchedule', fid);
ok(sc.hours && Array.isArray(sc.blocks), 'personel müsaitliği görebiliyor');
e = await ex(rpc('v', 'saveDraft', fid, (await rpc('a', 'getForm', fid)).draft));
ok(e?.code === 'yetki', 'personel formu düzenleyemiyor');
const dow = new Date(tomorrow).getUTCDay();
const pre = await rpc('v', 'saveSchedule', fid, { hours: { ...sc.hours, [dow]: [] } }, { dryRun: true });
ok(pre.affected.length >= 1 && (await rpc('v', 'getSchedule', fid)).hours[dow].length > 0, `kaydetmeden önce etkilenen randevular söyleniyor (${pre.affected.length}), değişmedi`);
await rpc('v', 'saveSchedule', fid, { closedDates: [tomorrow] });
ok((await rpc('p', 'getAvailability', f.slug, { date: tomorrow, serviceId: 'svc_muayene' })).length === 0, 'kapatılan gün formda hemen kapandı');
ok((await rpc('a', 'listAllAppointments', { from: tomorrow, to: tomorrow })).items.some((x) => x.status !== 'iptal'), 'kapalı güne denk gelen randevular iptal edilmedi');
await rpc('v', 'saveSchedule', fid, { closedDates: [] });
ok((await rpc('p', 'getAvailability', f.slug, { date: tomorrow, serviceId: 'svc_muayene' })).length > 0, 'gün yeniden açıldı');
e = await ex(rpc('v', 'saveSchedule', fid, { hours: { 1: [{ start: '18:00', end: '09:00' }] } }));
ok(e, 'ters saat aralığı reddedildi');
await rpc('a', 'setPermission', sek.id, fid, { view: true, randevu: false });
await rpc('s', 'login', 'sek@test.com', 'Sek.Sifre1234');
e = await ex(rpc('s', 'saveSchedule', fid, { closedDates: [tomorrow] }));
ok(e?.code === 'yetki', 'randevu yetkisi olmayan saat değiştiremez');

const izler = [];
// hizmet fiyatı: tik kapalıyken görünmez, açıkken onay kartında
const pf = await rpc('a', 'getForm', fid);
pf.draft.randevu.services[0].price = 450;
pf.draft.randevu.services[1].price = 'abc';
pf.draft.randevu.showPrices = true;
await rpc('a', 'saveDraft', fid, pf.draft);
const pf2 = (await rpc('a', 'getForm', fid)).draft.randevu;
ok(pf2.services[0].price === 450 && pf2.services[1].price === '', 'fiyat kaydedildi, geçersiz fiyat temizlendi');
await rpc('a', 'publishForm', fid, {});
const psl = await rpc('p', 'getAvailability', f.slug, { date: addDays2(tomorrow, 1), serviceId: pf2.services[0].id });
const pres = await rpc('p', 'submitForm', f.slug, { ad_soyad: 'Fiyat Test', telefon: '0533 444 55 66', email: 'fiyat@x.com', hayvan_adi: 'Zıpzıp', hayvan_turu: '🐱 Kedi', randevu: { date: addDays2(tomorrow, 1), time: psl[0].time, serviceId: pf2.services[0].id } }, { startedAt: Date.now() - 5000, kvkkAccepted: true });
ok(pres.appointment.price === '450 ₺', 'onay kartında fiyat: ' + pres.appointment.price);
izler.push('Fiyat Test', 'Zıpzıp', '5334445566');

// KVKK: hazır aydınlatma metni + kampanya izni
const { buildKvkkText } = await import('../src/lib/kvkkTemplate.js');
const kf = await rpc('a', 'getForm', fid);
const kt = buildKvkkText({ isletme: 'Vital Veteriner', settings: { ...kf.draft.settings, address: 'Moda Cad. 24', kvkk: { company: 'Vital Vet Ltd. Şti.', contactEmail: 'kvkk@vital.com' } }, fields: kf.draft.fields, randevu: kf.draft.randevu });
ok(kt.includes('Vital Vet Ltd. Şti.') && kt.includes('telefon numaranız') && kt.includes('"Hayvanınızın adı"') && kt.includes('WhatsApp') && kt.includes('kvkk@vital.com') && kt.includes('11. maddesi'), 'hazır aydınlatma metni forma göre doldu');
kf.draft.settings.marketing = { enabled: true, label: 'Kampanyalardan haberdar olmak istiyorum', text: 'x' };
await rpc('a', 'saveDraft', fid, kf.draft);
await rpc('a', 'publishForm', fid, {});
const mkSend = async (name, phone, mk, i) => { const sl = await rpc('p', 'getAvailability', f.slug, { date: addDays2(tomorrow, 2), serviceId: 'svc_muayene' }); return rpc('p', 'submitForm', f.slug, { ad_soyad: name, telefon: phone, email: `m${i}@x.com`, hayvan_adi: 'Mırmır', hayvan_turu: '🐱 Kedi', randevu: { date: addDays2(tomorrow, 2), time: sl[i].time, serviceId: 'svc_muayene' } }, { startedAt: Date.now() - 5000, kvkkAccepted: true, marketingAccepted: mk }); };
await mkSend('İzinli Müşteri', '0535 101 20 30', true, 0);
await mkSend('İzinsiz Müşteri', '0535 101 20 31', false, 4);
const mkList = await rpc('a', 'listCustomers', { marketing: true });
ok(mkList.items.length === 0, 'kampanya izni özelliği kapalı: işaretlense bile kaydedilmiyor');
ok(!(await rpc('a', 'getCustomer', '5351012030')).marketingAt, 'müşteri kartında izin yok (özellik kapalı)');
izler.push('İzinli Müşteri', 'İzinsiz Müşteri', '5351012030', '5351012031', 'Mırmır');

// Google yorum isteği
ok((await rpc('a', 'listReviewQueue')).items.length === 0, 'yorum isteği kapalıyken liste boş');
const rvf = await rpc('a', 'getForm', fid);
rvf.draft.randevu.review = { enabled: true, googleUrl: 'https://g.page/r/test-isletme/review', text: '', mode: 'puan' };
await rpc('a', 'saveDraft', fid, rvf.draft);
await rpc('a', 'publishForm', fid, {});
const izinliAppt = (await rpc('a', 'listAllAppointments', { from: addDays2(tomorrow, 2), to: addDays2(tomorrow, 2) })).items.find((x) => x.name === 'İzinli Müşteri');
await rpc('a', 'setAppointmentStatus', izinliAppt.id, 'geldi');
new DatabaseSync(`${DATA}/batilmer.sqlite`).prepare('UPDATE appointments SET date = ? WHERE id = ?').run(new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), izinliAppt.id);
const rq = await rpc('v', 'listReviewQueue');
const rqi = rq.items.find((x) => x.apptId === izinliAppt.id);
ok(rqi && rqi.waUrl.includes('wa.me/905351012030') && decodeURIComponent(rqi.waUrl).includes('/yorum/'), '"Geldi" olan müşteri yorum listesinde, WhatsApp mesajı hazır');
const rtok = decodeURIComponent(rqi.waUrl).match(/\/yorum\/([a-f0-9]{32})/)[1];
await rpc('v', 'markReviewSent', rqi.id);
ok(!(await rpc('v', 'listReviewQueue')).items.some((x) => x.id === rqi.id), 'gönderilen istek listeden çıktı');
const pg = await rpc('p', 'getReviewPage', rtok);
ok(pg && pg.isletme && !JSON.stringify(pg).includes('İzinli') && !JSON.stringify(pg).includes('5351012030'), 'puan sayfası kişisel veri göstermiyor');
const sr = await rpc('p', 'submitReview', rtok, { rating: 2, comment: 'Çok bekledim' });
ok(sr.googleUrl === 'https://g.page/r/test-isletme/review', 'düşük puanda da Google linki veriliyor (kurala uygun)');
e = await ex(rpc('p', 'submitReview', rtok, { rating: 5 }));
ok(e, 'aynı ziyarete ikinci kez puan verilemiyor');
const lowN = (await rpc('vbg', 'pollNotifications', 0)).items.find((x) => x.kind === 'yorum');
ok(lowN && lowN.title.includes('Düşük puan') && !lowN.body.includes('İzinli'), 'düşük puanda bildirim, kişisel veri yok');
await rpc('p', 'reviewGoogleClick', rtok);
const rl = await rpc('a', 'listReviews');
ok(rl.stats.rated === 1 && rl.stats.avg === 2 && rl.stats.google === 1 && rl.items[0].comment === 'Çok bekledim', 'Yorumlar ekranı: ortalama, Google tıklaması, yorum');
ok((await rpc('a', 'getCustomer', '5351012030')).items.some((i) => i.appt?.review?.rating === 2), 'müşteri kartında puan');
izler.push('Çok bekledim');
// Tek adım (varsayılan): link doğrudan Google'a
delete rvf.draft.randevu.review.mode;
await rpc('a', 'saveDraft', fid, rvf.draft);
await rpc('a', 'publishForm', fid, {});
const pg2 = await rpc('p', 'getReviewPage', rtok);
ok(pg2.mode === 'google' && pg2.googleUrl === 'https://g.page/r/test-isletme/review', 'varsayılan: link doğrudan Google yorum ekranına gider');

// Randevumu yönet: tik kapalıyken kapalı; açıkken telefon + ad eşleşirse görünür ve iptal edilir
e = await ex(rpc('p', 'findMyAppointments', f.slug, { phone: '0533 444 55 66', name: 'Fiyat Test' }));
ok(e?.code === 'yetki', 'Randevumu yönet kapalıyken çalışmıyor');
const mg = await rpc('a', 'getForm', fid);
mg.draft.randevu.selfManage = true;
await rpc('a', 'saveDraft', fid, mg.draft);
await rpc('a', 'publishForm', fid, {});
ok((await rpc('p', 'findMyAppointments', f.slug, { phone: '05334445566', name: 'Yanlış İsim' })).length === 0, 'ad eşleşmezse randevu gösterilmiyor');
const mine = await rpc('p', 'findMyAppointments', f.slug, { phone: '+90 533 444 55 66', name: 'fiyat  test' });
ok(mine.length === 1 && mine[0].token && mine[0].canCancel && !('name' in mine[0]) && !('phone' in mine[0]), 'telefon + ad eşleşince aktif randevu bulundu (kişisel veri dönmüyor)');
await rpc('p', 'cancelByToken', mine[0].token);
ok((await rpc('p', 'findMyAppointments', f.slug, { phone: '05334445566', name: 'Fiyat Test' })).length === 0, 'iptal edilen randevu listeden çıktı');
let limited = false;
for (let k = 0; k < 6; k++) { const r = await ex(rpc('p', 'findMyAppointments', f.slug, { phone: '05001112233', name: 'Deneme Kisi' })); if (r?.code === 'sinir') limited = true; }
ok(limited, 'aynı numaraya çok deneme engellendi');

// ücretsiz sohbet asistanı
ok((await rpc('p', 'getAssistant', f.slug)) === null, 'asistan kapalıyken bilgi dönmüyor');
{
  const r0 = await fetch(`${B}/api/asistan/${f.slug}`);
  ok(r0.status === 200 && (await r0.json()) === null, 'asistan kapalıyken site balonu çıkmıyor (null)');
  ok((await (await fetch(`${B}/api/asistan/yok-boyle-form`)).json()) === null, 'olmayan form için balon yok');
  ok((await fetch(`${B}/api/asistan/..%2Fetc`)).status === 404, 'geçersiz link reddedildi');
}
{
  const g = await rpc('a', 'getForm', fid);
  g.draft.settings.assistant = { ...g.draft.settings.assistant, enabled: true, greeting: 'Selam', whatsapp: '0555 700 80 90', faq: [{ q: 'Otopark?', a: 'Var' }, { q: '', a: 'boş' }] };
  await rpc('a', 'saveDraft', fid, g.draft);
  await rpc('a', 'publishForm', fid, {});
  const as = await rpc('p', 'getAssistant', f.slug);
  ok(as && as.greeting === 'Selam' && as.whatsapp === '05557008090' && as.faq.length === 1 && as.services.length > 0, 'asistan açıkken menü bilgileri geliyor');
  ok(!JSON.stringify(as).includes('Fiyat Test') && !('rows' in as), 'asistan kişisel veri döndürmüyor');
  ok(as.subtitle === 'Size nasıl yardımcı olabiliriz?' && as.peek.startsWith('Merhaba') && as.title, 'varsayılan başlık / alt yazı / balon yazısı geliyor');
  const r1 = await fetch(`${B}/api/asistan/${f.slug}`);
  const b1 = await r1.json();
  ok(r1.headers.get('access-control-allow-origin') === '*' && /^#[0-9a-f]{6}$/i.test(b1.color) && b1.peek && !('faq' in b1) && !('services' in b1), 'site balonu: her siteden okunur, sadece renk + yazı döner');
  ok(!(await fetch(`${B}/asistan/${f.slug}`)).headers.get('x-frame-options'), 'asistan sayfası başka sitelere gömülebilir');
  ok((await fetch(`${B}/panel`)).headers.get('x-frame-options') === 'SAMEORIGIN', 'panel başka siteye gömülemez');
  const g2 = await rpc('a', 'getForm', fid);
  g2.draft.settings.assistant = { ...g2.draft.settings.assistant, color: '#c0127a', title: 'Vital Destek', subtitle: '', peek: '' };
  await rpc('a', 'saveDraft', fid, g2.draft);
  await rpc('a', 'publishForm', fid, {});
  const as2 = await rpc('p', 'getAssistant', f.slug);
  const b2 = await (await fetch(`${B}/api/asistan/${f.slug}`)).json();
  ok(as2.primary === '#c0127a' && as2.title === 'Vital Destek' && as2.subtitle === '' && b2.color === '#c0127a' && b2.peek === '', 'panelden renk, başlık seçildi; alt yazı ve balon yazısı kapatılabildi');
  const g3 = await rpc('a', 'getForm', fid);
  g3.draft.settings.assistant = { ...g3.draft.settings.assistant, color: 'red;background:url(x)', title: '<b>x</b>'.repeat(30) };
  await rpc('a', 'saveDraft', fid, g3.draft);
  const g4 = (await rpc('a', 'getForm', fid)).draft.settings.assistant;
  ok(g4.color === '' && g4.title.length <= 60, 'geçersiz renk ve uzun başlık temizlendi');
  g3.draft.settings.assistant.enabled = false;
  await rpc('a', 'saveDraft', fid, g3.draft);
  await rpc('a', 'publishForm', fid, {});
  ok((await (await fetch(`${B}/api/asistan/${f.slug}`)).json()) === null, 'asistan kapatılınca sitedeki balon da kalkıyor');
}



// ---------------------------------------------------------------- tekrar çağırma
{
  const T = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  ok((await rpc('v', 'listRecalls')).forms.length === 0, 'tekrar çağırma kapalıyken liste yok');
  const g = await rpc('a', 'getForm', fid);
  g.draft.randevu.recall = { enabled: true, text: '', days: { svc_asi: 365, svc_tiras: 999, yok_boyle: 30 } };
  await rpc('a', 'saveDraft', fid, g.draft);
  const saved = (await rpc('a', 'getForm', fid)).draft.randevu.recall.days;
  ok(saved.svc_asi === 365 && !('svc_tiras' in saved) && !('yok_boyle' in saved), 'geçersiz süre ve olmayan hizmet temizlendi');
  await rpc('a', 'publishForm', fid, {});
  const slot = async (date, svc = 'svc_asi') => (await rpc('a', 'getAvailability', f.slug, { date, serviceId: svc })).map((x) => x.time);
  const manual = async (name, phone, date, svc = 'svc_asi') => rpc('a', 'createManualAppointment', fid, { name, phone, date, time: (await slot(date, svc))[0], serviceId: svc });
  // geçmişe taşı + geldi
  const past = async (id, days) => sdb.query("UPDATE appointments SET date = ?, status = 'geldi' WHERE id = ?", [shift(T, -days), id]);
  const r1 = await manual('Recall Kisi', '0555 123 45 67', tomorrow); await past(r1, 360);
  const r2 = await manual('Recall Iki', '0555 222 33 44', tomorrow); await past(r2, 370);
  const r3 = await manual('Recall Uc', '0555 333 44 55', tomorrow); await past(r3, 370);
  await manual('Recall Uc', '0555 333 44 55', tomorrow); // sonra yeniden randevu aldı
  const r4 = await manual('Recall Dort', '0555 444 55 66', tomorrow); await past(r4, 200);
  const r5 = await manual('Recall Bes', '0555 555 66 77', tomorrow, 'svc_muayene'); await past(r5, 370); // muayeneye süre verilmedi
  let rl = await rpc('v', 'listRecalls');
  const names = rl.items.map((x) => x.name);
  ok(names.includes('Recall Kisi') && names.includes('Recall Iki'), 'süresi yaklaşan ve geçen müşteriler listede');
  ok(!names.includes('Recall Uc'), 'sonradan yeniden randevu alan listede yok');
  ok(!names.includes('Recall Dort') && !names.includes('Recall Bes'), 'süresi gelmeyen ve süre verilmeyen hizmet listede yok');
  const k = rl.items.find((x) => x.name === 'Recall Kisi');
  ok(k.dueDate === shift(T, 5) && k.waUrl.startsWith('https://wa.me/905551234567?text=') && decodeURIComponent(k.waUrl).includes('?hizmet=svc_asi') && k.text.includes('Aşı'), 'çağırma: tarih, WhatsApp linki, hizmet seçili form linki');
  ok(rl.items.find((x) => x.name === 'Recall Iki').dueDate < T, 'geciken çağrı');
  e = await ex(rpc('v', 'markRecall', k.id, 'bozuk'));
  ok(e, 'geçersiz işlem reddedildi');
  await rpc('v', 'markRecall', k.id, 'sent');
  rl = await rpc('v', 'listRecalls');
  ok(!rl.items.some((x) => x.id === k.id) && rl.done.find((x) => x.id === k.id)?.status === 'cagrildi' && rl.done.find((x) => x.id === k.id).sentBy === 'Veteriner', 'çağrıldı olarak işaretlendi');
  ok(rl.stats.sent === 1 && rl.stats.booked === 0, 'bu ay 1 çağrı');
  await manual('Recall Kisi', '0555 123 45 67', tomorrow); // müşteri randevu aldı
  rl = await rpc('v', 'listRecalls');
  ok(rl.done.find((x) => x.id === k.id)?.status === 'geldi' && rl.stats.booked === 1, 'çağrılan müşteri randevu alınca "randevu aldı" sayıldı');
  const iki = rl.items.find((x) => x.name === 'Recall Iki');
  await rpc('v', 'markRecall', iki.id, 'snooze');
  rl = await rpc('v', 'listRecalls');
  ok(!rl.items.some((x) => x.id === iki.id), 'ertelenen 1 hafta görünmüyor');
  await sdb.query('UPDATE recalls SET hidden_until = ? WHERE id = ?', [T, iki.id]);
  rl = await rpc('v', 'listRecalls');
  ok(rl.items.find((x) => x.id === iki.id)?.dueDate === iki.dueDate, 'erteleme bitince tarih değişmeden geri geliyor');
  await rpc('v', 'markRecall', iki.id, 'dismiss');
  const r6 = await manual('Recall Iki', '0555 222 33 44', tomorrow); await past(r6, 366);
  rl = await rpc('v', 'listRecalls');
  ok(!rl.items.some((x) => x.name === 'Recall Iki'), '"gerek yok" denilen müşteri bir daha düşmüyor');
  izler.push('Recall Kisi', 'Recall Iki', 'Recall Uc', '5551234567', '5552223344');

  // ---------------------------------------------------------------- bekleme listesi
  let day = shift(T, 2);
  for (let i = 0; i < 10 && !(await slot(day, 'svc_muayene')).length; i++) day = shift(day, 1);
  e = await ex(rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', name: 'Bekleyen Bir', phone: '0544 100 20 30' }));
  ok(e, 'bekleme listesi kapalıyken yazılamaz');
  const g2 = await rpc('a', 'getForm', fid);
  g2.draft.randevu.waitlist = { enabled: true, text: '' };
  await rpc('a', 'saveDraft', fid, g2.draft);
  await rpc('a', 'publishForm', fid, {});
  ok((await rpc('p', 'getPublicForm', f.slug)).content.randevu.waitlist.enabled === true, 'formda bekleme listesi açık');
  e = await ex(rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', name: 'Bekleyen Bir', phone: '0544 100 20 30' }));
  ok(e?.code === 'bos', 'boş saat varken bekleme listesine yazılmıyor');
  const clearBlocks = async () => { for (const b of (await rpc('a', 'listAppointments', fid, { from: day, to: day })).blocks) await rpc('a', 'removeBlock', b.id); };
  await rpc('a', 'addBlock', fid, { date: day, start: '00:00', end: '23:59', note: 'test' });
  ok((await slot(day, 'svc_muayene')).length === 0, 'gün dolu (kapalı saat)');
  e = await ex(rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', name: 'Bekleyen Bir', phone: '0212 555 11 22' }));
  ok(e, 'sabit hatla yazılamaz (WhatsApp gerekli)');
  e = await ex(rpc('p', 'joinWaitlist', f.slug, { date: '2020-01-01', serviceId: 'svc_muayene', name: 'Bekleyen Bir', phone: '0544 100 20 30' }));
  ok(e, 'geçmiş tarihe yazılamaz');
  await rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', pref: 'hepsi', name: 'Bekleyen Bir', phone: '0544 100 20 30' });
  await rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', pref: 'bozuk', name: 'Bekleyen Bir', phone: '+90 544 100 20 30' }); // aynı kişi tekrar
  await rpc('p', 'joinWaitlist', f.slug, { date: day, serviceId: 'svc_muayene', pref: 'aksam', name: 'Bekleyen Iki', phone: '0544 200 30 40' });
  let wl = await rpc('v', 'listWaitlist');
  let grp = wl.groups.find((x) => x.date === day);
  ok(grp && grp.entries.length === 2 && grp.entries[0].name === 'Bekleyen Bir' && grp.entries[0].pref === 'hepsi', 'aynı kişi iki kez yazılmadı; sıra korunuyor');
  ok(!grp.open && grp.entries.every((x) => !x.waUrl) && wl.open === 0, 'yer yokken "haber ver" düğmesi yok');
  await clearBlocks();
  const freeAppt = await manual('Iptal Eden', '0544 999 88 77', day, 'svc_muayene');
  await rpc('a', 'addBlock', fid, { date: day, start: '00:00', end: '23:59' });
  await rpc('vbg', 'pollNotifications', 0);
  await rpc('a', 'setAppointmentStatus', freeAppt, 'iptal');
  const nb = (await rpc('vbg', 'pollNotifications', 0)).items.filter((x) => x.kind === 'bekleme');
  ok(nb.length === 1 && nb[0].title.includes('Yer açıldı') && nb[0].body.includes('2 kişi') && !nb[0].body.includes('Bekleyen'), 'iptal olunca "yer açıldı" bildirimi (kişisel veri yok): ' + nb[0]?.title);
  await clearBlocks();
  wl = await rpc('v', 'listWaitlist');
  grp = wl.groups.find((x) => x.date === day);
  const b1 = grp.entries[0];
  ok(grp.open && b1.waUrl.startsWith('https://wa.me/905441002030?text=') && decodeURIComponent(b1.waUrl).includes(`tarih=${day}&saat=${b1.time}`) && wl.open >= 1, 'yer açılınca "haber ver" linki saat seçili');
  const b2 = grp.entries[1];
  ok(!b2.time || b2.time >= '17:00', 'akşam isteyen kişiye akşam saati önerilir');
  await rpc('v', 'markWaitlist', b1.id, 'notified');
  ok((await rpc('v', 'listWaitlist')).groups.find((x) => x.date === day).entries[0].notifiedBy === 'Veteriner', 'haber verildi işareti');
  await rpc('a', 'createManualAppointment', fid, { name: 'Bekleyen Bir', phone: '05441002030', date: day, time: b1.time, serviceId: 'svc_muayene' });
  grp = (await rpc('v', 'listWaitlist')).groups.find((x) => x.date === day);
  ok(grp.entries.length === 1 && grp.entries[0].name === 'Bekleyen Iki', 'randevu alan kişi bekleme listesinden düştü');
  e = await ex(rpc('p', 'markWaitlist', grp.entries[0].id, 'remove'));
  ok(e, 'giriş yapmayan bekleme kaydını silemez');
  // gün geçince ad/telefon silinir
  await sdb.query('UPDATE waitlist SET date = ? WHERE id = ?', [shift(T, -1), grp.entries[0].id]);
  await sched.cleanup(sdb);
  const wrow = (await sdb.query('SELECT * FROM waitlist WHERE id = ?', [grp.entries[0].id]))[0];
  ok(wrow && wrow.name === '' && wrow.phone === '' && !wrow.phone_key, 'günü geçen bekleme kaydında ad ve telefon silindi');
  izler.push('Bekleyen Bir', 'Bekleyen Iki', '5441002030', '5442003040');

  // ---------------------------------------------------------------- ay sonu raporu
  const rep = await rpc('v', 'monthReport', {});
  const R = rep.report;
  ok(R && R.month === T.slice(0, 7) && R.weekdays.length === 7 && rep.months.length === 6, 'rapor: bu ay, 7 gün, 6 ay seçeneği');
  ok(R.total > 0 && R.services.length > 0 && R.isletme === 'Vital Veteriner', 'rapor: randevu sayısı ve hizmetler');
  ok(R.recall.sent === 1 && R.recall.booked === 1, 'rapor: tekrar çağırma katkısı');
  ok(R.waitlist.joined >= 2 && R.waitlist.booked === 1, 'rapor: bekleme listesi katkısı');
  ok(!JSON.stringify(R).includes('Recall Kisi') && !JSON.stringify(R).includes('5551234567'), 'raporda kişisel veri yok');
  ok((await rpc('v', 'monthReport', { month: 'bozuk' })).report.month === T.slice(0, 7), 'bozuk ay bu aya döner');
  const old = await rpc('v', 'monthReport', { month: '2020-01' });
  ok(old.report.total === 0, 'eski ay boş');
  ok((await rpc('v', 'monthReport', { formId: other })).report === null, 'yetkisi olmayan formun raporu görünmez');
  await sched.monthlyReportNotice(sdb);
}

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

