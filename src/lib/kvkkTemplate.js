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
    else if (f.type === 'randevu') add('randevu tarihi, saati ve seçtiğiniz hizmet');
    else if (f.type === 'dosya') add(`yüklediğiniz dosyalar (${label})`);
    else if (/ad.?soyad|isim|adınız/i.test(label)) add('adınız ve soyadınız');
    else if (label) add(`formda yazdığınız "${label}" bilgisi`);
  }
  return out;
}

export function buildKvkkText({ isletme = '', settings = {}, fields = [], randevu = null }) {
  const k = settings.kvkk || {};
  const unvan = clean(k.company) || clean(isletme) || '[İşletme unvanı]';
  const adres = clean(settings.address) || '[İşletme adresi]';
  const eposta = clean(k.contactEmail);
  const tel = clean(k.contactPhone);
  const hasAppt = fields.some((f) => f.type === 'randevu');
  const wa = hasAppt && randevu?.wa?.enabled !== false;
  const mails = !!settings.customerMails;
  const months = Number(settings.retentionMonths || 0);
  const data = dataList(fields);
  const iletisim = [eposta && `e-posta: ${eposta}`, tel && `telefon: ${tel}`].filter(Boolean).join(', ');

  const amaclar = [
    hasAppt ? 'randevunuzun oluşturulması, onaylanması, değiştirilmesi ve iptali' : 'başvurunuzun / talebinizin alınması ve değerlendirilmesi',
    'sizinle iletişime geçilmesi ve talebinize dönüş yapılması',
    wa || mails ? `randevu hatırlatma ve bilgilendirme mesajlarının ${[wa && 'WhatsApp', mails && 'e-posta'].filter(Boolean).join(' ve ')} ile gönderilmesi` : '',
    hasAppt ? 'hizmet geçmişinizin ve hizmetle ilgili notların tutulması' : '',
    'hukuki yükümlülüklerimizin yerine getirilmesi ve olası uyuşmazlıklarda delil olarak kullanılması'
  ].filter(Boolean);

  const parts = [
    `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ`,
    ``,
    `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi uyarınca, veri sorumlusu sıfatıyla ${unvan} ("İşletme") tarafından hazırlanmıştır.`,
    ``,
    `1. Veri sorumlusu`,
    `${unvan}`,
    `Adres: ${adres}${iletisim ? `\nİletişim: ${iletisim}` : ''}`,
    ``,
    `2. İşlenen kişisel verileriniz`,
    `Bu form aracılığıyla ${data.length ? data.join(', ') : 'formda paylaştığınız bilgiler'} ile işlem güvenliği için formu gönderdiğiniz tarih/saat ve IP adresi bilgisi işlenmektedir.`,
    ``,
    `3. İşleme amaçları`,
    ...amaclar.map((a) => `• ${a.charAt(0).toLocaleUpperCase('tr') + a.slice(1)},`),
    ``,
    `4. Hukuki sebepler ve toplama yöntemi`,
    `Kişisel verileriniz bu çevrim içi form aracılığıyla elektronik ortamda toplanmakta; KVKK m.5/2-(c) "bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması", m.5/2-(ç) "veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi" ve m.5/2-(f) "ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati" hukuki sebeplerine dayanılarak işlenmektedir.`,
    ``,
    `5. Aktarım`,
    `Kişisel verileriniz; form ve randevu altyapısını sağlayan ve verileri İşletme adına barındıran hizmet sağlayıcımız Batilmer'e (veri işleyen sıfatıyla), yasal zorunluluk hâlinde yetkili kamu kurum ve kuruluşlarına KVKK'nın 8. maddesine uygun olarak aktarılabilir.${wa ? ` Randevu hatırlatması WhatsApp ile yapıldığında, mesaj İşletme'nin WhatsApp hesabından gönderilir ve WhatsApp hizmetini sağlayan yurt dışında yerleşik şirketin altyapısı üzerinden iletilir; bu aktarım KVKK'nın 9. maddesine uygun şekilde gerçekleştirilir.` : ''} Verileriniz bunların dışında üçüncü kişilerle paylaşılmaz, satılmaz.`,
    ``,
    `6. Saklama süresi`,
    months > 0
      ? `Kişisel verileriniz, toplandığı tarihten itibaren ${months} ay saklanır ve bu sürenin sonunda otomatik olarak silinir. Silinen veriler güvenlik yedeklerinden en geç 14 gün içinde kaldırılır.`
      : `Kişisel verileriniz, işleme amacının gerektirdiği ve ilgili mevzuatta öngörülen süre boyunca saklanır; sürenin sonunda silinir, yok edilir veya anonim hâle getirilir.`,
    ``,
    `7. Haklarınız`,
    `KVKK'nın 11. maddesi uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, KVKK m.7 kapsamında silinmesini veya yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.`,
    ``,
    `Bu haklarınıza ilişkin taleplerinizi ${[adres !== '[İşletme adresi]' ? `yukarıdaki adrese yazılı olarak` : '', eposta ? `${eposta} adresine e-posta ile` : ''].filter(Boolean).join(' veya ') || 'İşletme\'ye yazılı olarak'} iletebilirsiniz. Talepleriniz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.`
  ];
  return parts.join('\n');
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
