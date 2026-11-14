// "Başlarken" kartının adımları: bu cihazda/kullanıcıda yapıldı mı?
// Tarayıcıda saklanır (kişisel veri yok); silinirse kart yeniden görünür, zararı yok.
const KEY = (uid) => `bf_baslarken_${uid || 'x'}`;

export function getSteps(uid) {
  try {
    return JSON.parse(localStorage.getItem(KEY(uid)) || '{}');
  } catch {
    return {};
  }
}

export function markStep(uid, step) {
  try {
    const s = getSteps(uid);
    if (s[step]) return;
    s[step] = Date.now();
    localStorage.setItem(KEY(uid), JSON.stringify(s));
  } catch {
    /* gizli sekme vb. */
  }
}

// Kullanıcı kimliği bilinmeyen yerlerden (paylaş penceresi gibi) çağrılır
let currentUid = '';
export const setOnboardingUser = (uid) => {
  currentUid = uid || '';
};
export const markStepNow = (step) => markStep(currentUid, step);
