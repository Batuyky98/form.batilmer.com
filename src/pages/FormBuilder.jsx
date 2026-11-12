import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../auth.jsx';
import { Link } from '../router.jsx';
import { Badge, Field, Segmented, Spinner, Toggle, copyText, useConfirm, useToast } from '../components/ui.jsx';
import FormRenderer from '../components/FormRenderer.jsx';
import { FIELD_TYPES, GOOGLE_FONTS, hasOptions, newField, typeLabel } from '../lib/templates.js';
import { DEFAULT_RANDEVU, getSlots } from '../lib/availability.js';
import { OPERATORS, needsValue, describeCondition } from '../lib/conditions.js';
import { LANGS, DEFAULT_TEXTS } from '../lib/i18n.js';
import { clone, formatDate, formatDateTime, slugify, formBaseUrl, uid, today } from '../lib/util.js';
import { APPOINTMENT_TERMS } from '../lib/calendar.js';

const TABS = [
  ['alanlar', 'Alanlar'],
  ['gorunum', 'Görünüm'],
  ['ayarlar', 'Ayarlar'],
  ['randevu', 'Randevu'],
  ['paylas', 'Paylaş / Iframe kodu'],
  ['gecmis', 'Geçmiş']
];

// ======================================================= ALANLAR
function OptionsEditor({ options, onChange }) {
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const move = (i, d) => {
    const next = [...options];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  if (bulk) {
    return (
      <div className="stack-sm">
        <textarea rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} aria-label="Seçenekler, her satıra bir tane" />
        <div className="row">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => { onChange(bulkText.split('\n').map((x) => x.trim()).filter(Boolean)); setBulk(false); }}>Uygula</button>
          <button type="button" className="btn btn-sm" onClick={() => setBulk(false)}>Vazgeç</button>
        </div>
      </div>
    );
  }
  return (
    <div className="stack-sm">
      {options.map((o, i) => (
        <div className="opt-row" key={i}>
          <input value={o} aria-label={`Seçenek ${i + 1}`} onChange={(e) => onChange(options.map((x, k) => (k === i ? e.target.value : x)))} />
          <button type="button" className="icon-btn" aria-label="Yukarı taşı" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button type="button" className="icon-btn" aria-label="Aşağı taşı" onClick={() => move(i, 1)} disabled={i === options.length - 1}>↓</button>
          <button type="button" className="icon-btn" aria-label="Seçeneği sil" onClick={() => onChange(options.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => onChange([...options, `Seçenek ${options.length + 1}`])}>+ Seçenek ekle</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setBulkText(options.join('\n')); setBulk(true); }}>Toplu düzenle</button>
      </div>
    </div>
  );
}

function ConditionEditor({ field, prevFields, onChange }) {
  const c = field.condition;
  const src = c ? prevFields.find((f) => f.key === c.fieldKey) : null;
  const usable = prevFields.filter((f) => !['randevu', 'dosya'].includes(f.type));
  if (!c) {
    return (
      <div>
        <button type="button" className="btn btn-sm" disabled={!usable.length} onClick={() => onChange({ fieldKey: usable[0].key, operator: 'esit', value: usable[0].options?.[0] || '' })}>+ Koşul ekle</button>
        <div className="pf-hint">{usable.length ? 'Bu alan sadece önceki bir alana verilen cevaba göre görünsün.' : 'Koşul eklemek için bu alanın üstünde başka bir alan olmalı.'}</div>
      </div>
    );
  }
  return (
    <div className="sub-card stack-sm">
      <div className="pf-label">Bu alanı sadece şu durumda göster:</div>
      {!src && <div className="notice notice-warn">Koşulun bağlı olduğu alan silinmiş veya bu alanın altına taşınmış. Koşul şu an çalışmıyor; yeniden seçin.</div>}
      <div className="cond-row">
        <select aria-label="Koşul alanı" value={c.fieldKey} onChange={(e) => { const nf = usable.find((f) => f.key === e.target.value); onChange({ ...c, fieldKey: e.target.value, value: nf?.options?.[0] || '' }); }}>
          {!src && <option value={c.fieldKey}>(silinmiş alan)</option>}
          {usable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select aria-label="Koşul türü" value={c.operator} onChange={(e) => onChange({ ...c, operator: e.target.value })}>
          {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {needsValue(c.operator) && (src?.options?.length ? (
          <select aria-label="Koşul değeri" value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })}>
            {src.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input aria-label="Koşul değeri" value={c.value || ''} onChange={(e) => onChange({ ...c, value: e.target.value })} placeholder="değer" />
        ))}
        <button type="button" className="icon-btn" aria-label="Koşulu kaldır" onClick={() => onChange(undefined)}>✕</button>
      </div>
      <div className="pf-hint">Gizli kalan alan zorunlu olsa bile sorulmaz ve kaydedilmez.</div>
    </div>
  );
}

const ACCEPT_OPTIONS = [['pdf', 'PDF'], ['jpg', 'JPG'], ['png', 'PNG'], ['doc', 'Word'], ['xls', 'Excel']];

function FieldEditor({ field, onChange, allKeys, prevFields }) {
  const set = (patch) => onChange({ ...field, ...patch });
  const keyTaken = allKeys.filter((k) => k === field.key).length > 1;
  return (
    <div className="field-editor stack">
      <div className="grid-2">
        <Field label="Etiket" htmlFor={`fe-l-${field.id}`}>
          <input id={`fe-l-${field.id}`} value={field.label} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <Field label="Teknik anahtar" htmlFor={`fe-k-${field.id}`} hint={keyTaken ? 'Bu anahtar başka alanda da var!' : 'Excel ve veritabanında kullanılır. Kayıt geldikten sonra değiştirmeyin.'}>
          <input id={`fe-k-${field.id}`} value={field.key} onChange={(e) => set({ key: slugify(e.target.value).replace(/-/g, '_') })} />
        </Field>
      </div>
      {field.type !== 'randevu' && !['radio', 'checkbox'].includes(field.type) && (
        <Field label={field.type === 'select' ? 'Boş seçenek metni' : 'Placeholder (kutu içi örnek metin)'} htmlFor={`fe-p-${field.id}`}>
          <input id={`fe-p-${field.id}`} value={field.placeholder || ''} onChange={(e) => set({ placeholder: e.target.value })} />
        </Field>
      )}
      <Field label="Yardım metni (alanın altında görünür)" htmlFor={`fe-h-${field.id}`}>
        <input id={`fe-h-${field.id}`} value={field.help || ''} onChange={(e) => set({ help: e.target.value })} />
      </Field>
      <Toggle id={`fe-r-${field.id}`} checked={field.required} onChange={(v) => set({ required: v })} label="Zorunlu alan" />
      {hasOptions(field.type) && (
        <Field label="Seçenekler">
          <OptionsEditor options={field.options || []} onChange={(options) => set({ options })} />
        </Field>
      )}
      {['text', 'textarea'].includes(field.type) && (
        <div className="grid-2">
          <Field label="En az karakter"><input type="number" min="0" value={field.minLength || ''} onChange={(e) => set({ minLength: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="En fazla karakter"><input type="number" min="0" value={field.maxLength || ''} onChange={(e) => set({ maxLength: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        </div>
      )}
      {field.type === 'number' && (
        <div className="grid-2">
          <Field label="En küçük değer"><input type="number" value={field.min ?? ''} onChange={(e) => set({ min: e.target.value })} /></Field>
          <Field label="En büyük değer"><input type="number" value={field.max ?? ''} onChange={(e) => set({ max: e.target.value })} /></Field>
        </div>
      )}
      {field.type === 'date' && (
        <div className="grid-2">
          <Field label="En erken tarih"><input type="date" value={field.minDate || ''} onChange={(e) => set({ minDate: e.target.value })} /></Field>
          <Field label="En geç tarih"><input type="date" value={field.maxDate || ''} onChange={(e) => set({ maxDate: e.target.value })} /></Field>
        </div>
      )}
      {field.type === 'checkbox' && (
        <div className="grid-2">
          <Field label="En az seçim"><input type="number" min="0" value={field.minSelect || ''} onChange={(e) => set({ minSelect: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="En fazla seçim"><input type="number" min="0" value={field.maxSelect || ''} onChange={(e) => set({ maxSelect: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        </div>
      )}
      {field.type === 'tc' && <div className="notice notice-info">TC Kimlik No algoritmayla kontrol edilir ve panelde maskeli gösterilir. KVKK gereği sadece gerçekten gerekiyorsa isteyin.</div>}
      {field.type === 'randevu' && <div className="notice notice-info">Hizmetler, çalışma saatleri ve kapasite <b>Randevu</b> sekmesinden ayarlanır.</div>}
      {field.type === 'dosya' && (
        <>
          <Field label="İzin verilen dosya türleri">
            <div className="chips">
              {ACCEPT_OPTIONS.map(([k, label]) => {
                const acc = field.accept?.length ? field.accept : ['pdf', 'jpg', 'png'];
                const on = acc.includes(k);
                return (
                  <label key={k} className="chip-check">
                    <input type="checkbox" checked={on} onChange={(e) => {
                      const next = e.target.checked ? [...acc, k] : acc.filter((x) => x !== k);
                      if (next.length) set({ accept: next });
                    }} />
                    {label}
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="En büyük dosya boyutu (MB)" hint="Yerel testte tarayıcı deposu küçük olduğu için 2 MB önerilir; sunucuya geçince 10 MB'a kadar çıkarılabilir.">
            <input type="number" min="1" max="10" value={field.maxMB || 2} onChange={(e) => set({ maxMB: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
        </>
      )}
      <ConditionEditor field={field} prevFields={prevFields} onChange={(condition) => set({ condition })} />
    </div>
  );
}

function FieldsTab({ draft, setDraft, formId }) {
  const confirm = useConfirm();
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const fields = draft.fields;
  const keys = fields.map((f) => f.key);
  const setFields = (next) => setDraft({ ...draft, fields: next });

  const add = (type) => {
    if (type === 'randevu' && fields.some((f) => f.type === 'randevu')) return;
    const f = newField(type, keys);
    setFields([...fields, f]);
    setOpenId(f.id);
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  const remove = async (f) => {
    const usage = await api.fieldUsage(formId);
    const n = usage[f.key] || 0;
    const dependents = fields.filter((x) => x.condition?.fieldKey === f.key);
    const ok = await confirm({
      title: 'Alanı sil',
      message: (n ? `Bu alanda ${n} kayıtta veri var. Silerseniz form artık bu soruyu sormaz, ama eski cevaplar kayıtlarda ve Excel'de kalır.` : `"${f.label}" alanı silinsin mi?`) +
        (dependents.length ? `\n\nŞu alanların koşulu bu alana bağlı; koşulları kaldırılacak ve her zaman görünecekler: ${dependents.map((d) => d.label).join(', ')}` : ''),
      confirmText: 'Sil',
      danger: true
    });
    if (ok) setFields(fields.filter((x) => x.id !== f.id).map((x) => (x.condition?.fieldKey === f.key ? { ...x, condition: undefined } : x)));
  };
  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const from = fields.findIndex((f) => f.id === dragId);
    const to = fields.findIndex((f) => f.id === targetId);
    const next = [...fields];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setFields(next);
    setDragId(null);
  };

  return (
    <div className="stack">
      <div className="field-list">
        {fields.map((f, i) => (
          <div
            key={f.id}
            className={`field-item ${openId === f.id ? 'is-open' : ''} ${dragId === f.id ? 'is-drag' : ''}`}
            draggable
            onDragStart={() => setDragId(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(f.id)}
            onDragEnd={() => setDragId(null)}
          >
            <div className="field-item-head">
              <span className="drag" aria-hidden="true" title="Sürükleyip bırakın">⋮⋮</span>
              <button type="button" className="field-item-title" onClick={() => setOpenId(openId === f.id ? null : f.id)} aria-expanded={openId === f.id}>
                <span className="field-type">{typeLabel(f.type)}</span>
                <span className="field-item-label">
                  <span>{f.label || '(etiketsiz)'}{f.required && <span className="req"> *</span>}</span>
                  {f.condition?.fieldKey && <span className="field-cond">Koşullu: {describeCondition(f.condition, fields)}</span>}
                </span>
              </button>
              <div className="field-item-actions">
                <button type="button" className="icon-btn" aria-label="Yukarı taşı" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="icon-btn" aria-label="Aşağı taşı" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>↓</button>
                <button type="button" className="icon-btn" aria-label="Alanı sil" onClick={() => remove(f)}>✕</button>
              </div>
            </div>
            {openId === f.id && <FieldEditor field={f} allKeys={keys} prevFields={fields.slice(0, i)} onChange={(nf) => {
              let next = fields.map((x) => (x.id === f.id ? nf : x));
              // Anahtar değiştiyse bu alana bağlı koşulları da güncelle
              if (nf.key !== f.key) next = next.map((x) => (x.condition?.fieldKey === f.key ? { ...x, condition: { ...x.condition, fieldKey: nf.key } } : x));
              setFields(next);
            }} />}
          </div>
        ))}
        {!fields.length && <div className="muted">Henüz alan yok. Aşağıdan ekleyin.</div>}
      </div>
      <div>
        <div className="pf-label">Alan ekle</div>
        <div className="palette">
          {FIELD_TYPES.map((t) => (
            <button key={t.type} type="button" className="palette-btn" onClick={() => add(t.type)} disabled={t.type === 'randevu' && fields.some((f) => f.type === 'randevu')}>
              <span className="palette-icon" aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ======================================================= GÖRÜNÜM
function AppearanceTab({ draft, setDraft }) {
  const a = draft.appearance;
  const set = (patch) => setDraft({ ...draft, appearance: { ...a, ...patch } });
  return (
    <div className="stack">
      <p className="muted">Form, müşterinin sitesine iframe ile gömülecek. Bu ayarlarla sitenin bir parçası gibi görünmesini sağlayın.</p>
      <Field label="1. Arka plan">
        <Segmented value={a.background} onChange={(v) => set({ background: v })} label="Arka plan" options={[{ value: 'seffaf', label: 'Şeffaf (site arka planı)' }, { value: 'beyaz', label: 'Beyaz kart' }, { value: 'ozel', label: 'Özel renk' }]} />
        {a.background === 'ozel' && (
          <div className="color-row mt-sm"><input type="color" value={a.bgColor} onChange={(e) => set({ bgColor: e.target.value })} aria-label="Arka plan rengi" /><input value={a.bgColor} onChange={(e) => set({ bgColor: e.target.value })} aria-label="Arka plan renk kodu" /></div>
        )}
      </Field>
      <div className="grid-2">
        <Field label="2. Ana renk (buton, seçim)">
          <div className="color-row"><input type="color" value={a.primary} onChange={(e) => set({ primary: e.target.value })} aria-label="Ana renk" /><input value={a.primary} onChange={(e) => set({ primary: e.target.value })} aria-label="Ana renk kodu" /></div>
        </Field>
        <Field label="Yazı rengi">
          <div className="color-row"><input type="color" value={a.text} onChange={(e) => set({ text: e.target.value })} aria-label="Yazı rengi" /><input value={a.text} onChange={(e) => set({ text: e.target.value })} aria-label="Yazı renk kodu" /></div>
        </Field>
      </div>
      <Field label="3. Yazı tipi" htmlFor="ap-font" hint="'Sitenin fontu' seçilirse iframe içinde tarayıcının varsayılan fontu kullanılır; siteyle aynı olması için sitenin fontunu seçin.">
        <select id="ap-font" value={a.font} onChange={(e) => set({ font: e.target.value })}>
          <option value="site">Sitenin fontu / varsayılan</option>
          {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="4. Köşeler">
        <Segmented value={a.radius} onChange={(v) => set({ radius: v })} label="Köşeler" options={[{ value: 'keskin', label: 'Keskin' }, { value: 'hafif', label: 'Hafif yuvarlak' }, { value: 'tam', label: 'Tam yuvarlak' }]} />
      </Field>
      <Field label="5. Etiket yerleşimi">
        <Segmented value={a.labelPosition} onChange={(v) => set({ labelPosition: v })} label="Etiket yerleşimi" options={[{ value: 'ust', label: 'Alanın üstünde' }, { value: 'ic', label: 'Alanın içinde' }]} />
      </Field>
      <Field label="6. Genişlik">
        <Segmented value={a.width} onChange={(v) => set({ width: v })} label="Genişlik" options={[{ value: 'tam', label: 'Tam genişlik' }, { value: 'dar', label: 'Dar, ortalı' }, { value: 'iki', label: 'İki sütun (masaüstü)' }]} />
      </Field>
      <Toggle id="ap-head" checked={a.showHeader !== false} onChange={(v) => set({ showHeader: v })} label="7. Form başlığı ve açıklamasını göster" />
      <Field label="8. Buton metni" htmlFor="ap-btn">
        <input id="ap-btn" value={a.buttonText} onChange={(e) => set({ buttonText: e.target.value })} />
      </Field>
      <p className="muted small">9. Gönderim sonrası davranış <b>Ayarlar</b> sekmesinde.</p>
      <Toggle id="ap-dark" checked={a.dark} onChange={(v) => set({ dark: v })} label="10. Koyu tema (koyu renkli siteler için)" />
    </div>
  );
}

// ======================================================= AYARLAR
function SettingsTab({ form, draft, setDraft, isAdmin, onMetaSaved, onControlSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const s = draft.settings;
  const set = (patch) => setDraft({ ...draft, settings: { ...s, ...patch } });
  const [meta, setMeta] = useState({ name: form.name, isletme: form.isletme, slug: form.slug });
  const [control, setControl] = useState(form.control);

  // Dil değişince, hiç değiştirilmemiş varsayılan metinleri de yeni dile çevir
  function changeLang(lang) {
    const from = DEFAULT_TEXTS[s.language || 'tr'];
    const to = DEFAULT_TEXTS[lang];
    const swap = (cur, key) => (cur === from[key] ? to[key] : cur);
    setDraft({
      ...draft,
      appearance: { ...draft.appearance, buttonText: swap(draft.appearance.buttonText, 'buttonText') },
      settings: {
        ...s,
        language: lang,
        successMessage: swap(s.successMessage, 'successMessage'),
        kvkk: { ...s.kvkk, label: swap(s.kvkk.label, 'kvkkLabel') },
        autoReply: { ...s.autoReply, subject: swap(s.autoReply.subject, 'autoReplySubject'), body: swap(s.autoReply.body, 'autoReplyBody') }
      }
    });
    if (control.closedMessage === from.closedMessage) setControl({ ...control, closedMessage: to.closedMessage });
  }

  async function saveMeta() {
    if (meta.slug !== form.slug) {
      const ok = await confirm({ title: 'Form linki değişiyor', message: `Link /f/${form.slug} → /f/${slugify(meta.slug)} olacak.\nBu formu sitelerine iframe ile gömen herkesin kodu çalışmayı durdurur ve yeni kodu almaları gerekir.`, confirmText: 'Linki değiştir', danger: true });
      if (!ok) return;
    }
    try {
      await api.updateFormMeta(form.id, meta);
      toast('Form bilgileri kaydedildi.');
      onMetaSaved();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  async function saveControl() {
    try {
      const c = await api.updateControl(form.id, control);
      setControl(c);
      toast('Durum kaydedildi (hemen geçerli).');
      onControlSaved(c);
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <div className="stack">
      {isAdmin && (
        <section className="sub-card stack">
          <h3>Form bilgileri <Badge tone="blue">Ana Admin</Badge></h3>
          <div className="grid-2">
            <Field label="İşletme adı"><input value={meta.isletme} onChange={(e) => setMeta({ ...meta, isletme: e.target.value })} /></Field>
            <Field label="Form adı (panelde görünür)"><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
          </div>
          <Field label="Form linki" hint="Değişirse sitelere gömülü iframe'ler bozulur.">
            <div className="input-prefix"><span>/f/</span><input value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} onBlur={() => setMeta((m) => ({ ...m, slug: slugify(m.slug) }))} /></div>
          </Field>
          <div><button type="button" className="btn btn-sm btn-primary" onClick={saveMeta}>Bilgileri kaydet</button></div>
        </section>
      )}

      <section className="sub-card stack">
        <h3>Durum ve kontenjan <span className="muted small">(kaydedince hemen geçerli olur)</span></h3>
        <Toggle id="st-akt" checked={control.status === 'aktif'} onChange={(v) => setControl({ ...control, status: v ? 'aktif' : 'pasif' })} label={control.status === 'aktif' ? 'Form aktif (kayıt alıyor)' : 'Form pasif (kayıt almıyor)'} />
        <div className="grid-3">
          <Field label="Başlangıç tarihi"><input type="date" value={control.startDate} onChange={(e) => setControl({ ...control, startDate: e.target.value })} /></Field>
          <Field label="Bitiş tarihi"><input type="date" value={control.endDate} onChange={(e) => setControl({ ...control, endDate: e.target.value })} /></Field>
          <Field label="Kontenjan (boş = sınırsız)"><input type="number" min="1" value={control.quota} onChange={(e) => setControl({ ...control, quota: e.target.value })} /></Field>
        </div>
        <Field label="Form kapalıyken gösterilecek mesaj"><input value={control.closedMessage} onChange={(e) => setControl({ ...control, closedMessage: e.target.value })} /></Field>
        <div><button type="button" className="btn btn-sm btn-primary" onClick={saveControl}>Durumu kaydet</button></div>
      </section>

      <section className="sub-card stack">
        <h3>Form dili</h3>
        <Segmented value={s.language || 'tr'} onChange={changeLang} label="Form dili" options={LANGS} />
        <div className="pf-hint">Hata mesajları, gün/ay adları, "Seçiniz", "Fark etmez" gibi sistem metinleri ve müşteriye giden randevu mailleri bu dilde olur. Alan etiketlerini ve seçenekleri ilgili dilde kendiniz yazın.</div>
      </section>

      <section className="sub-card stack">
        <h3>Başlık ve gönderim</h3>
        <Field label="Form başlığı (formun üstünde)"><input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Açıklama"><textarea rows={2} value={s.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Gönderdikten sonra">
          <Segmented value={s.afterSubmit} onChange={(v) => set({ afterSubmit: v })} label="Gönderdikten sonra" options={[{ value: 'mesaj', label: 'Teşekkür mesajı göster' }, { value: 'yonlendir', label: 'Başka sayfaya yönlendir' }]} />
        </Field>
        {s.afterSubmit === 'yonlendir' ? (
          <Field label="Yönlendirilecek adres"><input type="url" placeholder="https://..." value={s.redirectUrl} onChange={(e) => set({ redirectUrl: e.target.value })} /></Field>
        ) : (
          <Field label="Teşekkür mesajı"><input value={s.successMessage} onChange={(e) => set({ successMessage: e.target.value })} /></Field>
        )}
      </section>

      <section className="sub-card stack">
        <h3>Bildirim ve kontrol</h3>
        <div className="notice notice-info">
          Yeni kayıt ve randevu bildirimleri <b>panel + telefon bildirimi</b> olarak gider. Kimin alacağını Ana Admin <b>Kullanıcılar</b> ekranında, bu formun satırındaki <b>"Bildirim"</b> tikiyle belirler. Bildirimde müşterinin adı ve telefonu yazmaz.
        </div>
        <Field label="Mükerrer kayıt kontrolü">
          <Segmented value={s.duplicateCheck} onChange={(v) => set({ duplicateCheck: v })} label="Mükerrer kayıt" options={[{ value: 'yok', label: 'Yok' }, { value: 'email', label: 'Aynı e-posta' }, { value: 'tel', label: 'Aynı telefon' }, { value: 'tc', label: 'Aynı TC' }]} />
        </Field>
        <Field label="Kayıtların saklama süresi (ay)" hint="Süresi dolan kayıtlar otomatik silinir. 0 = süresiz.">
          <input type="number" min="0" value={s.retentionMonths} onChange={(e) => set({ retentionMonths: Number(e.target.value) })} />
        </Field>
        {isAdmin && <Toggle id="st-ne" checked={s.notifyAdminOnEdit} onChange={(v) => set({ notifyAdminOnEdit: v })} label="Bir kullanıcı formu düzenleyip yayınlarsa Ana Admin'e mail at" />}
      </section>

      <section className="sub-card stack">
        <h3>Müşteriye mail <Badge tone="blue">Ücretli ek özellik</Badge> {!isAdmin && <Badge tone="gray">Sadece Ana Admin açabilir</Badge>}</h3>
        <Toggle id="st-cm" disabled={!isAdmin} checked={!!s.customerMails} onChange={(v) => set({ customerMails: v })} label={s.customerMails ? 'Açık: randevu onayı, değişiklik, iptal ve hatırlatma mailleri müşteriye gider' : 'Kapalı: müşteriye mail gitmez'} />
        <div className="pf-hint">
          Kapalıyken müşteri, formu gönderdiği ekranda randevu bilgilerini, <b>iptal bağlantısını</b> ve <b>"Takvimime ekle"</b> butonunu görür; hatırlatmayı kendi telefonunun takvimi yapar. Açmak için sunucuda mail servisinin (Brevo) ayarlı olması gerekir.
        </div>
      </section>

      <section className="sub-card stack">
        <h3>Otomatik cevap maili</h3>
        {!s.customerMails && <div className="notice notice-warn">"Müşteriye mail" kapalı olduğu için otomatik cevap gönderilmez.</div>}
        <Toggle id="st-ar" checked={s.autoReply.enabled} onChange={(v) => set({ autoReply: { ...s.autoReply, enabled: v } })} label="Formu dolduran kişiye otomatik mail gönder" />
        {s.autoReply.enabled && (
          <>
            {!draft.fields.some((f) => f.type === 'email') && <div className="notice notice-warn">Formda e-posta alanı yok; otomatik cevap kimseye gönderilemez.</div>}
            <Field label="Konu"><input value={s.autoReply.subject} onChange={(e) => set({ autoReply: { ...s.autoReply, subject: e.target.value } })} /></Field>
            <Field label="Mesaj" hint={`Formdaki cevapları süslü parantezle ekleyebilirsiniz: ${draft.fields.filter((f) => !['randevu', 'dosya'].includes(f.type)).slice(0, 4).map((f) => `{${f.key}}`).join(', ') || '{ad_soyad}'}`}>
              <textarea rows={6} value={s.autoReply.body} onChange={(e) => set({ autoReply: { ...s.autoReply, body: e.target.value } })} />
            </Field>
            {draft.fields.some((f) => f.type === 'randevu') && <div className="pf-hint">Randevu alınan gönderimlerde müşteriye zaten randevu onay maili gittiği için otomatik cevap ayrıca gönderilmez.</div>}
          </>
        )}
      </section>

      <section className="sub-card stack">
        <h3>KVKK onayı {!isAdmin && <Badge tone="gray">Sadece Ana Admin değiştirebilir</Badge>}</h3>
        <Toggle id="st-kv" disabled={!isAdmin} checked={s.kvkk.enabled} onChange={(v) => set({ kvkk: { ...s.kvkk, enabled: v } })} label="Formda KVKK onay kutusu göster" />
        {s.kvkk.enabled && (
          <>
            <Field label="Onay metni"><input disabled={!isAdmin} value={s.kvkk.label} onChange={(e) => set({ kvkk: { ...s.kvkk, label: e.target.value } })} /></Field>
            <Field label="Aydınlatma metni linki"><input disabled={!isAdmin} type="url" placeholder="https://..." value={s.kvkk.url} onChange={(e) => set({ kvkk: { ...s.kvkk, url: e.target.value } })} /></Field>
          </>
        )}
        {isAdmin && !s.kvkk.enabled && <div className="notice notice-warn">KVKK onayı kapalı. Kişisel veri topluyorsanız aydınlatma yükümlülüğünün başka şekilde karşılandığından emin olun.</div>}
      </section>
    </div>
  );
}

// ======================================================= RANDEVU
const WEEK = [[1, 'Pazartesi'], [2, 'Salı'], [3, 'Çarşamba'], [4, 'Perşembe'], [5, 'Cuma'], [6, 'Cumartesi'], [0, 'Pazar']];

function RandevuTab({ draft, setDraft, isAdmin }) {
  const cfg = draft.randevu || clone(DEFAULT_RANDEVU);
  const set = (patch) => setDraft({ ...draft, randevu: { ...cfg, ...patch } });
  const [closed, setClosed] = useState('');
  const hasField = draft.fields.some((f) => f.type === 'randevu');

  const setService = (i, patch) => set({ services: cfg.services.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setResource = (i, patch) => set({ resources: cfg.resources.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setDay = (day, ranges) => set({ hours: { ...cfg.hours, [day]: ranges } });

  return (
    <div className="stack">
      {!hasField && <div className="notice notice-warn">Bu formda randevu alanı yok. Ayarlar kaydedilir ama formda görünmez. <b>Alanlar</b> sekmesinden "Randevu" alanı ekleyin.</div>}

      <section className="sub-card stack">
        <h3>Genel</h3>
        <div className="grid-2">
          <Field label="Nasıl adlandırılsın?" hint="Bildirimlerde ve müşterinin gördüğü bilgi kartında kullanılır.">
            <select value={cfg.term || ''} onChange={(e) => set({ term: e.target.value })}>
              {APPOINTMENT_TERMS.map((t) => <option key={t} value={t === 'Randevu' ? '' : t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Randevular şu tarihten itibaren açılsın" hint="Örnek: işletme 1 Aralık'ta açılıyorsa form bugünden yayında olur, ilk seçilebilen gün 1 Aralık olur. Boş = hemen.">
            <div className="row">
              <input type="date" min={today()} value={cfg.openFrom || ''} onChange={(e) => set({ openFrom: e.target.value })} />
              {cfg.openFrom && <button type="button" className="btn btn-sm" onClick={() => set({ openFrom: '' })}>Temizle</button>}
            </div>
          </Field>
        </div>
        {cfg.openFrom && cfg.openFrom > today() && (
          <div className="pf-hint">Müşteri formda "Randevular {formatDate(cfg.openFrom)} tarihinden itibaren alınmaktadır." yazısını görür. "En fazla kaç gün ileri" bu tarihten itibaren sayılır. Panelden manuel randevu bu tarihten önce de eklenebilir.</div>
        )}
      </section>

      <section className="sub-card stack">
        <h3>Hizmetler</h3>
        <div className="table-wrap">
          <table className="tbl tbl-compact">
            <thead><tr><th>Hizmet adı</th><th>Süre (dk)</th><th>Ara (dk)</th><th aria-label="İşlem" /></tr></thead>
            <tbody>
              {cfg.services.map((s, i) => (
                <tr key={s.id}>
                  <td><input aria-label="Hizmet adı" value={s.name} onChange={(e) => setService(i, { name: e.target.value })} /></td>
                  <td><input aria-label="Süre" type="number" min="5" step="5" value={s.duration} onChange={(e) => setService(i, { duration: Number(e.target.value) })} /></td>
                  <td><input aria-label="Arka arkaya randevu arası" type="number" min="0" step="5" value={s.buffer || 0} onChange={(e) => setService(i, { buffer: Number(e.target.value) })} /></td>
                  <td><button type="button" className="icon-btn" aria-label="Hizmeti sil" disabled={cfg.services.length === 1} onClick={() => set({ services: cfg.services.filter((_, k) => k !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pf-hint">"Ara": randevudan sonra bırakılacak temizlik/hazırlık süresi.</div>
        <div><button type="button" className="btn btn-sm" onClick={() => set({ services: [...cfg.services, { id: uid('svc_'), name: 'Yeni hizmet', duration: 30, buffer: 0 }] })}>+ Hizmet ekle</button></div>
      </section>

      <section className="sub-card stack">
        <h3>Personel / kaynak <span className="muted small">(isteğe bağlı)</span></h3>
        <p className="muted small">Güzellik merkezinde uzmanlar, kafede masa grupları gibi. Boş bırakılırsa tek takvim kullanılır.</p>
        <Field label="Bu kaynaklar formda nasıl adlandırılsın?"><input value={cfg.resourceLabel} onChange={(e) => set({ resourceLabel: e.target.value })} /></Field>
        {cfg.resources.map((r, i) => (
          <div key={r.id} className="resource-row">
            <input aria-label="Kaynak adı" value={r.name} onChange={(e) => setResource(i, { name: e.target.value })} />
            <div className="chips">
              {cfg.services.map((s) => {
                const on = !r.serviceIds?.length || r.serviceIds.includes(s.id);
                return (
                  <label key={s.id} className="chip-check">
                    <input type="checkbox" checked={on} onChange={(e) => {
                      const current = r.serviceIds?.length ? r.serviceIds : cfg.services.map((x) => x.id);
                      const next = e.target.checked ? [...current, s.id] : current.filter((x) => x !== s.id);
                      setResource(i, { serviceIds: next.length === cfg.services.length ? [] : next });
                    }} />
                    {s.name}
                  </label>
                );
              })}
            </div>
            <button type="button" className="icon-btn" aria-label="Kaynağı sil" onClick={() => set({ resources: cfg.resources.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => set({ resources: [...cfg.resources, { id: uid('res_'), name: `${cfg.resourceLabel || 'Personel'} ${cfg.resources.length + 1}`, serviceIds: [] }] })}>+ Ekle</button></div>
      </section>

      <section className="sub-card stack">
        <h3>Çalışma saatleri</h3>
        {WEEK.map(([day, name]) => {
          const ranges = cfg.hours?.[day] || [];
          return (
            <div key={day} className="day-row">
              <div className="day-name">
                <Toggle id={`day-${day}`} checked={ranges.length > 0} onChange={(v) => setDay(day, v ? [{ start: '09:00', end: '18:00' }] : [])} label={name} />
              </div>
              <div className="day-ranges">
                {ranges.length === 0 && <span className="muted small">Kapalı</span>}
                {ranges.map((r, i) => (
                  <div key={i} className="range">
                    <input type="time" aria-label={`${name} başlangıç`} value={r.start} onChange={(e) => setDay(day, ranges.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
                    <span>–</span>
                    <input type="time" aria-label={`${name} bitiş`} value={r.end} onChange={(e) => setDay(day, ranges.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
                    <button type="button" className="icon-btn" aria-label="Aralığı sil" onClick={() => setDay(day, ranges.filter((_, k) => k !== i))}>✕</button>
                  </div>
                ))}
                {ranges.length > 0 && <button type="button" className="link-sm" onClick={() => setDay(day, [...ranges, { start: '14:00', end: '18:00' }])}>+ aralık (öğle arası için)</button>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="sub-card stack">
        <h3>Kapalı günler (tatil, izin)</h3>
        <div className="row">
          <input type="date" aria-label="Kapalı gün" value={closed} onChange={(e) => setClosed(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!closed} onClick={() => { if (!cfg.closedDates.includes(closed)) set({ closedDates: [...cfg.closedDates, closed].sort() }); setClosed(''); }}>Ekle</button>
        </div>
        <div className="chips">
          {cfg.closedDates.map((d) => (
            <span key={d} className="chip">{formatDate(d)} <button type="button" aria-label={`${d} kaldır`} onClick={() => set({ closedDates: cfg.closedDates.filter((x) => x !== d) })}>✕</button></span>
          ))}
          {!cfg.closedDates.length && <span className="muted small">Kapalı gün yok.</span>}
        </div>
      </section>

      <section className="sub-card stack">
        <h3>Kurallar</h3>
        <div className="grid-3">
          <Field label="Saat aralığı (dk)">
            <select value={cfg.interval} onChange={(e) => set({ interval: Number(e.target.value) })}>
              {[10, 15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} dk</option>)}
            </select>
          </Field>
          <Field label="Kapasite türü">
            <select value={cfg.capacityMode} onChange={(e) => set({ capacityMode: e.target.value })}>
              <option value="randevu">Randevu sayısı</option>
              <option value="kisi">Kişi sayısı (kafe/restoran)</option>
            </select>
          </Field>
          <Field label={cfg.capacityMode === 'kisi' ? 'Aynı anda toplam kişi' : cfg.resources.length ? 'Kaynak başına aynı anda' : 'Aynı saate kaç randevu'}>
            <input type="number" min="1" value={cfg.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} />
          </Field>
          {cfg.capacityMode === 'kisi' && (
            <Field label="Tek rezervasyonda en fazla kişi"><input type="number" min="1" value={cfg.partySizeMax} onChange={(e) => set({ partySizeMax: Number(e.target.value) })} /></Field>
          )}
          <Field label="En az kaç saat önceden"><input type="number" min="0" value={cfg.minNoticeHours} onChange={(e) => set({ minNoticeHours: Number(e.target.value) })} /></Field>
          <Field label="En fazla kaç gün ileri"><input type="number" min="1" value={cfg.maxDaysAhead} onChange={(e) => set({ maxDaysAhead: Number(e.target.value) })} /></Field>
          <Field label="İptal en geç (randevudan kaç saat önce)"><input type="number" min="0" value={cfg.cancelCutoffHours} onChange={(e) => set({ cancelCutoffHours: Number(e.target.value) })} /></Field>
          <Field label="Kişi başı aktif randevu sınırı" hint="Aynı e-posta/telefon; 0 = sınırsız"><input type="number" min="0" value={cfg.perContactLimit} onChange={(e) => set({ perContactLimit: Number(e.target.value) })} /></Field>
          {draft.settings.customerMails && <Field label="Hatırlatma maili (kaç saat önce)"><input type="number" min="1" value={cfg.reminderHours} onChange={(e) => set({ reminderHours: Number(e.target.value) })} /></Field>}
        </div>
        <Field label="Onay">
          <Segmented value={cfg.approval} onChange={(v) => set({ approval: v })} label="Onay modu" options={[{ value: 'auto', label: 'Otomatik onay' }, { value: 'manual', label: 'İşletme onaylasın' }]} />
        </Field>
        {cfg.approval === 'manual' && !draft.settings.customerMails && (
          <div className="pf-hint">Müşteriye mail kapalıyken müşteri onay durumunu, formdan sonra verilen bağlantıdaki sayfada görür. Gerekirse müşteriyi telefonla arayın.</div>
        )}
      </section>

      <section className="sub-card stack">
        <h3>Müşteriye SMS <Badge tone="blue">Ücretli ek özellik</Badge> {!isAdmin && <Badge tone="gray">Sadece Ana Admin açabilir</Badge>}</h3>
        <Toggle id="sms-c" disabled={!isAdmin} checked={cfg.sms?.confirm} onChange={(v) => set({ sms: { ...cfg.sms, confirm: v } })} label="Randevu alınınca, onaylanınca, taşınınca veya iptal edilince SMS gönder" />
        <Toggle id="sms-r" disabled={!isAdmin} checked={cfg.sms?.reminder} onChange={(v) => set({ sms: { ...cfg.sms, reminder: v } })} label="Hatırlatmayı SMS ile de gönder" />
        {!draft.fields.some((f) => f.type === 'tel') && (cfg.sms?.confirm || cfg.sms?.reminder) && <div className="notice notice-warn">Formda telefon alanı yok; SMS gönderilemez.</div>}
        <div className="pf-hint">SMS sağlayıcısı (Netgsm, İleti Merkezi vb.) bağlanana kadar SMS'ler gönderilmez, "Giden mailler" sayfasında görünür. SMS ücretlidir.</div>
      </section>
    </div>
  );
}

// ======================================================= PAYLAŞ
function ShareTab({ form }) {
  const toast = useToast();
  const base = formBaseUrl();
  const url = `${base}/f/${form.slug}`;
  const title = form.published?.settings?.title || form.name;
  const code = `<iframe src="${url}"\n        data-batilmer-form\n        title="${title.replace(/"/g, '&quot;')}"\n        style="width:100%;border:0;overflow:hidden;min-height:400px"\n        scrolling="no" loading="lazy"></iframe>\n<script src="${base}/embed.js" defer></script>`;
  const [fixedH, setFixedH] = useState(900);
  const codeNoScript = `<iframe src="${url}"\n        title="${title.replace(/"/g, '&quot;')}"\n        style="width:100%;height:${fixedH}px;border:0"\n        loading="lazy"></iframe>`;
  const copy = async (t) => toast((await copyText(t)) ? 'Kopyalandı.' : 'Kopyalanamadı, elle seçip kopyalayın.', 'ok');

  return (
    <div className="stack">
      {!form.publishedAt && <div className="notice notice-warn">Form henüz yayınlanmadı. Kodu şimdi alabilirsiniz ama form, yayınlanana kadar ziyaretçilere kapalı görünür.</div>}
      <section className="sub-card stack">
        <h3>Form linki</h3>
        <p className="muted small">Sitesi olmayan müşteriler bu linki doğrudan paylaşabilir (Instagram, WhatsApp...).</p>
        <div className="copy-row"><input readOnly value={url} aria-label="Form linki" onFocus={(e) => e.target.select()} /><button type="button" className="btn btn-sm" onClick={() => copy(url)}>Kopyala</button><a className="btn btn-sm btn-ghost" href={url} target="_blank" rel="noreferrer">Aç ↗</a></div>
      </section>
      <section className="sub-card stack">
        <h3>Iframe kodu (önerilen)</h3>
        <p className="muted small">Bu kodu sitenizde formun görüneceği yere yapıştırın. Formun yüksekliği otomatik ayarlanır, kaydırma çubuğu çıkmaz.</p>
        <pre className="code">{code}</pre>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(code)}>Iframe kodunu kopyala</button>
          <a className="btn btn-sm" href={`/test-sitesi?f=${encodeURIComponent(form.slug)}`} target="_blank" rel="noreferrer">Siteye gömülü halini göster ↗</a>
        </div>
      </section>
      <section className="sub-card stack">
        <h3>Script eklenemeyen siteler için</h3>
        <p className="muted small">Bazı site oluşturucular (Wix vb.) script'e izin vermez. Bu durumda sabit yükseklikli kodu kullanın; yükseklik formun en uzun haline göre seçilmeli.</p>
        <Field label="Yükseklik (px)"><input type="number" min="300" step="50" value={fixedH} onChange={(e) => setFixedH(Number(e.target.value))} /></Field>
        <pre className="code">{codeNoScript}</pre>
        <div><button type="button" className="btn btn-sm" onClick={() => copy(codeNoScript)}>Kopyala</button></div>
      </section>
    </div>
  );
}

// ======================================================= GEÇMİŞ
function HistoryTab({ form, isAdmin, onRestored }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.listVersions(form.id).then(setItems);
  }, [form.id, form.publishedAt]);
  async function restore(v) {
    const ok = await confirm({ title: 'Eski sürüme dön', message: `${formatDateTime(v.at)} tarihli sürüm taslağa yüklenecek. İnceleyip "Yayınla" diyene kadar canlı form değişmez.`, confirmText: 'Taslağa yükle' });
    if (!ok) return;
    await api.restoreVersion(v.id);
    toast('Sürüm taslağa yüklendi.');
    onRestored();
  }
  if (!items) return <Spinner />;
  if (!items.length) return <p className="muted">Henüz yayınlanmış sürüm yok.</p>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Tarih</th><th>Yayınlayan</th><th>Not</th><th>Alan</th>{isAdmin && <th aria-label="İşlem" />}</tr></thead>
        <tbody>
          {items.map((v, i) => (
            <tr key={v.id}>
              <td>{formatDateTime(v.at)} {i === 0 && <Badge tone="green">Canlı</Badge>}</td>
              <td>{v.by}</td>
              <td>{v.note || <span className="muted">—</span>}</td>
              <td>{v.fieldCount}</td>
              {isAdmin && <td>{i > 0 && <button type="button" className="btn btn-sm" onClick={() => restore(v)}>Taslağa yükle</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ======================================================= SAYFA
export default function FormBuilder({ id }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(null);
  const [draft, setDraftState] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('alanlar');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewDevice, setPreviewDevice] = useState('masaustu');

  async function load() {
    try {
      const f = await api.getForm(id);
      if (!f.perms.edit) {
        setError('Bu formu düzenleme yetkiniz yok.');
        return;
      }
      setForm(f);
      setDraftState(clone(f.draft));
      setDirty(false);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setDraft = (d) => {
    setDraftState(d);
    setDirty(true);
  };

  const hasUnpublished = useMemo(() => form && JSON.stringify(draft) !== JSON.stringify(form.published), [form, draft]);

  async function saveDraft(quiet = false) {
    setSaving(true);
    try {
      await api.saveDraft(id, draft);
      setDirty(false);
      const f = await api.getForm(id);
      setForm(f);
      if (!quiet) toast('Taslak kaydedildi. Canlı form değişmedi.');
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!(await saveDraft(true))) return;
    const affected = await api.previewPublishImpact(id);
    let cancelAffected = false;
    if (affected.length) {
      const list = affected.slice(0, 8).map((a) => `• ${a.date} ${a.start} – ${a.contact?.name || 'İsimsiz'}`).join('\n');
      const ok = await confirm({
        title: `${affected.length} randevu yeni saatlere uymuyor`,
        message: `Yeni çalışma saatleri / kapalı günler yüzünden şu randevular artık saat dışında kalıyor:\n${list}${affected.length > 8 ? '\n…' : ''}\n\nBu randevular iptal edilip müşterilere iptal maili gönderilsin mi? "Vazgeç" derseniz yayınlama yapılmaz.`,
        confirmText: 'İptal et, mail gönder ve yayınla',
        danger: true
      });
      if (!ok) return;
      cancelAffected = true;
    }
    try {
      await api.publishForm(id, { cancelAffected });
      toast('Form yayınlandı. Sitelerdeki form güncellendi.');
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  async function discard() {
    const ok = await confirm({ title: 'Değişiklikleri geri al', message: 'Yayınlanmamış tüm değişiklikler silinip canlı haline dönülecek.', confirmText: 'Geri al', danger: true });
    if (!ok) return;
    const d = await api.discardDraft(id);
    setDraftState(d);
    setDirty(false);
    load();
  }

  const previewSlots = async (p) => getSlots(draft.randevu, [], [], p);

  if (error) return <div className="page"><div className="notice notice-err">{error}</div><Link to="/panel" className="btn mt">← Formlara dön</Link></div>;
  if (!form || !draft) return <div className="page"><Spinner /></div>;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <Link to="/panel" className="back">← Formlar</Link>
          <h1>{form.name}</h1>
          <div className="row small muted">
            <span>{form.isletme}</span>
            <span>·</span>
            {form.publishedAt ? <span>Son yayın: {formatDateTime(form.publishedAt)}</span> : <Badge tone="gray">Hiç yayınlanmadı</Badge>}
            {hasUnpublished && <Badge tone="amber">Yayınlanmamış değişiklik</Badge>}
            {dirty && <Badge tone="amber">Kaydedilmedi</Badge>}
          </div>
        </div>
        <div className="row">
          {form.published && hasUnpublished && <button type="button" className="btn btn-ghost" onClick={discard}>Değişiklikleri geri al</button>}
          <button type="button" className="btn" onClick={() => saveDraft()} disabled={saving || !dirty}>Taslağı kaydet</button>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={saving}>Yayınla</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Form düzenleme">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div className={`builder ${['paylas', 'gecmis'].includes(tab) ? 'builder-single' : ''}`}>
        <div className="builder-main card">
          {tab === 'alanlar' && <FieldsTab draft={draft} setDraft={setDraft} formId={id} />}
          {tab === 'gorunum' && <AppearanceTab draft={draft} setDraft={setDraft} />}
          {tab === 'ayarlar' && <SettingsTab form={form} draft={draft} setDraft={setDraft} isAdmin={isAdmin} onMetaSaved={load} onControlSaved={(c) => setForm({ ...form, control: c })} />}
          {tab === 'randevu' && <RandevuTab draft={draft} setDraft={setDraft} isAdmin={isAdmin} />}
          {tab === 'paylas' && <ShareTab form={form} />}
          {tab === 'gecmis' && <HistoryTab form={form} isAdmin={isAdmin} onRestored={load} />}
        </div>
        {!['paylas', 'gecmis'].includes(tab) && (
          <aside className="builder-preview">
            <div className="preview-bar">
              <span className="small muted">Canlı önizleme (taslak)</span>
              <Segmented value={previewDevice} onChange={setPreviewDevice} label="Önizleme cihazı" options={[{ value: 'masaustu', label: 'Masaüstü' }, { value: 'mobil', label: 'Mobil' }]} />
              <button type="button" className="link-sm" onClick={() => setPreviewKey((k) => k + 1)}>Sıfırla</button>
            </div>
            <div className={`preview-stage ${previewDevice === 'mobil' ? 'is-mobile' : ''}`} style={{ background: draft.appearance.background === 'seffaf' ? 'repeating-conic-gradient(#eef1f5 0% 25%, #fff 0% 50%) 50% / 16px 16px' : undefined }}>
              <FormRenderer key={previewKey} content={draft} preview loadSlots={previewSlots} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
