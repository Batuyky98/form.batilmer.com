// KVKK aydınlatma metni ve kampanya izni metni şablonları.
// Formdaki alanlara, randevu ve hatırlatma ayarlarına göre doldurulur. Panelde "Hazır metni oluştur" ile
// metin kutusuna yazılır; Ana Admin kontrol edip düzenleyebilir. Hukuki tavsiye değildir; avukata kontrol ettirilmelidir.

const clean = (s) => String(s || '').trim();
const stripEmoji = (s) => clean(String(s || '').replace(/^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*/u, ''));

function dataList(fields) {
  const out = [];
  const add = (x) => { if (x && !out.includes(x)) out.push(x); };
  for (const f of fields || []) {
    const label = stripEmoji(f.label).replace(/\s*\*$/, '');
    if (f.type === 'tel') add('telefon numaranız');
    else if (f.type === 'email') add('e-posta adresiniz');
    else if (f.type === 'tc') add('T.C. kimlik numaranız');
    else if (f.type === 'randevu') add('randevu bilgileriniz (tarih, saat, hizmet)');
    else if (f.type === 'dosya') add(`yüklediğiniz dosyalar ("${label}")`);
    else if (/ad.?soyad|isim|adınız/i.test(label)) add('adınız soyadınız');
    else if (label) add(`"${label}"`);
  }
  return out;
}

// Kısa ve sade aydınlatma metni (KVKK m.10'un istediği her şey: kim, ne, neden, hangi sebeple, kime, haklar)
export function buildKvkkText({ isletme = '', settings = {}, fields = [], randevu = null }) {
  const k = settings.kvkk || {};
  const unvan = clean(k.company) || clean(isletme) || '[İşletme unvanı]';
  const adres = clean(settings.address) || '[İşletme adresi]';
  const eposta = clean(k.contactEmail);
  const tel = clean(k.contactPhone);
  const hasAppt = fields.some((f) => f.type === 'randevu');
  const wa = hasAppt && randevu?.wa?.enabled !== false;
  const waitlist = hasAppt && !!randevu?.waitlist?.enabled;
  const recall = hasAppt && !!randevu?.recall?.enabled && Object.keys(randevu?.recall?.days || {}).length > 0;
  const mails = !!settings.customerMails;
  const months = Number(settings.retentionMonths || 0);
  const data = dataList(fields);
  if (waitlist) data.push('bekleme listesine yazılırsanız saat tercihiniz');

  const amaclar = [
    hasAppt ? 'randevunuzu oluşturmak ve yönetmek' : 'talebinizi almak ve değerlendirmek',
    'size dönüş yapmak',
    wa || mails ? `randevu hatırlatması göndermek (${[wa && 'WhatsApp', mails && 'e-posta'].filter(Boolean).join(', ')})` : '',
    waitlist ? 'dolu bir günde yer açılınca bekleme listesindekilere haber vermek' : '',
    recall ? 'aldığınız hizmetin (aşı, bakım, kontrol vb.) tekrar zamanı gelince hatırlatmak' : '',
    hasAppt ? 'hizmet geçmişinizi tutmak' : '',
    'yasal yükümlülüklerimizi yerine getirmek'
  ].filter(Boolean);
  const basvuru = [eposta, adres !== '[İşletme adresi]' ? 'yukarıdaki adres' : ''].filter(Boolean).join(' veya ') || "İşletme'ye yazılı olarak";
  const saklama = [
    months > 0 ? `Verileriniz ${months} ay saklanır, sonra otomatik silinir.` : 'Verileriniz amaç için gereken ve kanunun öngördüğü süre kadar saklanır, sonra silinir.',
    waitlist ? 'Bekleme listesi bilgileri o gün geçince silinir.' : '',
    recall ? 'Tekrar zamanı hatırlatması istemezseniz bize söylemeniz yeterlidir; bu mesajlar reklam içermez.' : ''
  ].filter(Boolean).join(' ');

  return [
    'KİŞİSEL VERİLERİNİZ HAKKINDA AYDINLATMA METNİ',
    '',
    `Veri sorumlusu: ${unvan}, ${adres}${eposta || tel ? ` (${[eposta, tel].filter(Boolean).join(', ')})` : ''}.`,
    '',
    `İşlenen veriler: ${data.length ? data.join(', ') : 'formda paylaştığınız bilgiler'}; ayrıca güvenlik için gönderim zamanı ve IP adresi.`,
    '',
    `Amaç: ${amaclar.join(', ')}.`,
    '',
    `Hukuki sebep: Veriler bu formla elektronik ortamda toplanır; KVKK m.5/2-(c) sözleşmenin kurulması ve ifası, (ç) hukuki yükümlülük ve (f) meşru menfaat sebeplerine dayanılarak işlenir.`,
    '',
    `Aktarım: Altyapı sağlayıcımız Batilmer'e (veri işleyen) ve gerektiğinde yetkili kamu kurumlarına aktarılabilir.${wa || waitlist || recall ? ' WhatsApp ile mesaj gönderildiğinde yurt dışındaki WhatsApp altyapısı kullanılır (KVKK m.9).' : ''} Verileriniz satılmaz, başka kimseyle paylaşılmaz.`,
    '',
    `Saklama: ${saklama}`,
    '',
    `Haklarınız: KVKK'nın 11. maddesi uyarınca verilerinize erişme, düzeltilmesini veya silinmesini isteme, itiraz etme ve zararın giderilmesini isteme haklarınız vardır. Başvurunuzu ${basvuru} üzerinden iletebilirsiniz; 30 gün içinde ücretsiz yanıtlanır.`
  ].join('\n');
}

// Kampanya izni özelliği şimdilik KAPALI (panelde ve formda görünmez). İleride açmak için true yapın.
export const MARKETING_FEATURE = false;

export const DEFAULT_MARKETING_LABEL = 'Kampanya, indirim ve duyurulardan SMS, e-posta veya WhatsApp ile haberdar olmak istiyorum. (İsteğe bağlı)';

export function buildMarketingText({ isletme = '', settings = {} }) {
  const unvan = clean(settings.kvkk?.company) || clean(isletme) || '[İşletme unvanı]';
  const eposta = clean(settings.kvkk?.contactEmail);
  const tel = clean(settings.kvkk?.contactPhone);
  return [
    `TİCARİ ELEKTRONİK İLETİ VE AÇIK RIZA ONAYI`,
    ``,
    `Bu kutuyu işaretleyerek, ${unvan} tarafından kampanya, indirim, yeni hizmet ve duyurulara ilişkin ticari elektronik iletilerin telefon numarama ve e-posta adresime SMS, e-posta ve WhatsApp yoluyla gönderilmesine; bu amaçla ad, soyad ve iletişim bilgilerimin işlenmesine onay veriyorum.`,
    ``,
    `Bu onay isteğe bağlıdır; vermemeniz randevu veya başvurunuzu hiçbir şekilde etkilemez.`,
    ``,
    `Onayınızı dilediğiniz zaman ücretsiz olarak geri alabilirsiniz: size gelen iletideki ret seçeneğini kullanarak, İleti Yönetim Sistemi (İYS) üzerinden${eposta || tel ? ` veya ${[eposta, tel].filter(Boolean).join(' / ')} üzerinden` : ''} işletmeye bildirerek.`
  ].join('\n');
}
