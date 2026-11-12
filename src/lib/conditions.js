// Koşullu alanlar: "Hizmet = Diğer ise 'Hangi hizmet?' alanını göster" gibi.
// Bir alanın koşulu sadece KENDİSİNDEN ÖNCEKİ bir alana bağlanabilir.
// Koşulun bağlı olduğu alan gizliyse, bu alan da gizlenir (zincirleme).

export const OPERATORS = [
  { value: 'esit', label: 'şuna eşitse' },
  { value: 'esit_degil', label: 'şuna eşit değilse' },
  { value: 'dolu', label: 'doldurulmuşsa' },
  { value: 'bos', label: 'boşsa' }
];

export const needsValue = (op) => op === 'esit' || op === 'esit_degil';

function isFilled(v) {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return String(v).trim() !== '';
}

function matches(cond, value) {
  switch (cond.operator) {
    case 'esit':
      return Array.isArray(value) ? value.includes(cond.value) : String(value ?? '') === String(cond.value ?? '');
    case 'esit_degil':
      return Array.isArray(value) ? !value.includes(cond.value) : String(value ?? '') !== String(cond.value ?? '');
    case 'dolu':
      return isFilled(value);
    case 'bos':
      return !isFilled(value);
    default:
      return true;
  }
}

// { alanAnahtari: true/false } döner
export function visibilityMap(fields, values) {
  const visible = {};
  for (const f of fields) {
    const c = f.condition;
    if (!c || !c.fieldKey) {
      visible[f.key] = true;
      continue;
    }
    const sourceVisible = visible[c.fieldKey];
    if (sourceVisible === undefined) {
      // Kaynak alan silinmiş ya da sonra geliyor: koşulu yok say, alanı göster
      visible[f.key] = true;
      continue;
    }
    visible[f.key] = !!sourceVisible && matches(c, values[c.fieldKey]);
  }
  return visible;
}

export function visibleFields(fields, values) {
  const map = visibilityMap(fields, values);
  return fields.filter((f) => map[f.key]);
}

export function describeCondition(cond, fields) {
  if (!cond?.fieldKey) return '';
  const src = fields.find((f) => f.key === cond.fieldKey);
  const op = OPERATORS.find((o) => o.value === cond.operator)?.label || '';
  return `"${src?.label || cond.fieldKey}" ${needsValue(cond.operator) ? `"${cond.value}" ` : ''}${op}`;
}
