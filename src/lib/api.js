// =====================================================================
//  BATILMER FORM PANELİ – API GİRİŞİ
//  Ekranlar veriye sadece bu dosya üzerinden ulaşır.
//  VITE_API_MODE=server  → Node.js sunucusu + MySQL (canlı, varsayılan)
//  VITE_API_MODE=local   → sunucusuz demo, veri tarayıcıda (localStorage)
// =====================================================================
import * as local from './api.local.js';
import { remote, onSessionExpired, onActivity } from './api.remote.js';

export { STATUS_LABELS, SUBMISSION_STATUSES, submissionStatusLabel, displayValue } from './shared.js';
export { addDays, today } from './util.js';
export { onSessionExpired, onActivity };

export const API_MODE = import.meta.env.VITE_API_MODE === 'local' ? 'local' : 'server';
const impl = API_MODE === 'local' ? local : remote;
const call = (name) => (...args) => impl[name](...args);
// Demo modunda (sunucusuz) olmayan özellikler: bildirim, Authenticator, oturum süresi
const serverOnly = (name, demo) => (...args) => (API_MODE === 'local' ? Promise.resolve(typeof demo === 'function' ? demo(...args) : demo) : remote[name](...args));

// Sadece yerel modda anlamlı olanlar (sunucuda bu işleri sunucu kendisi yapar)
export const ensureSeed = () => (API_MODE === 'local' ? local.ensureSeed() : Promise.resolve());
export const runScheduler = () => (API_MODE === 'local' ? local.runScheduler() : undefined);

// oturum
export const login = call('login');
export const logout = call('logout');
export const currentUser = call('currentUser');
export const changePassword = call('changePassword');
export const requestPasswordReset = call('requestPasswordReset');
export const resetPassword = call('resetPassword');
export const loginTotp = serverOnly('loginTotp', () => {
  throw new Error('Demo modunda iki adımlı doğrulama yok.');
});
export const publicConfig = serverOnly('publicConfig', { mailEnabled: false });
export const sessionInfo = serverOnly('sessionInfo', null);
export const touchSession = serverOnly('touchSession', null);
// iki adımlı doğrulama
export const totpStatus = serverOnly('totpStatus', { enabled: false, required: false, backupLeft: 0, demo: true });
export const totpSetupStart = serverOnly('totpSetupStart', () => {
  throw new Error('Demo modunda kullanılamaz.');
});
export const totpSetupConfirm = serverOnly('totpSetupConfirm', null);
export const totpDisable = serverOnly('totpDisable', true);
export const regenerateBackupCodes = serverOnly('regenerateBackupCodes', null);
export const adminResetTotp = serverOnly('adminResetTotp', true);
// bildirimler
export const pushConfig = serverOnly('pushConfig', { publicKey: '' });
export const savePushSubscription = serverOnly('savePushSubscription', true);
export const deletePushSubscription = serverOnly('deletePushSubscription', true);
export const myNotificationSettings = serverOnly('myNotificationSettings', { enabled: false, forms: [], devices: [], demo: true });
export const setNotifyEnabled = serverOnly('setNotifyEnabled', false);
export const deleteMyDevice = serverOnly('deleteMyDevice', true);
export const sendTestNotification = serverOnly('sendTestNotification', { sent: 0, failed: 0 });
export const pollNotifications = serverOnly('pollNotifications', { items: [], unread: 0, enabled: false, hasForms: false, session: null });
export const markNotificationsSeen = serverOnly('markNotificationsSeen', true);
export const purgeFormData = serverOnly('purgeFormData', () => {
  throw new Error('Demo modunda kullanılamaz.');
});
// kullanıcılar ve yetkiler
export const listUsers = call('listUsers');
export const createUser = call('createUser');
export const updateUser = call('updateUser');
export const adminSetPassword = call('adminSetPassword');
export const deleteUser = call('deleteUser');
export const getUserPermissions = call('getUserPermissions');
export const setPermission = call('setPermission');
export const myPermissions = call('myPermissions');
// formlar
export const listForms = call('listForms');
export const getForm = call('getForm');
export const createForm = call('createForm');
export const updateFormMeta = call('updateFormMeta');
export const saveDraft = call('saveDraft');
export const previewPublishImpact = call('previewPublishImpact');
export const publishForm = call('publishForm');
export const updateControl = call('updateControl');
export const discardDraft = call('discardDraft');
export const fieldUsage = call('fieldUsage');
export const listVersions = call('listVersions');
export const restoreVersion = call('restoreVersion');
export const duplicateForm = call('duplicateForm');
export const deleteForm = call('deleteForm');
// herkese açık form
export const getPublicForm = call('getPublicForm');
export const getAvailability = call('getAvailability');
export const submitForm = call('submitForm');
export const getAppointmentByToken = call('getAppointmentByToken');
export const cancelByToken = call('cancelByToken');
// kayıtlar
export const listSubmissions = call('listSubmissions');
export const setSubmissionStatus = call('setSubmissionStatus');
export const addSubmissionNote = call('addSubmissionNote');
export const deleteSubmission = call('deleteSubmission');
export const exportSubmissions = call('exportSubmissions');
export const formStats = call('formStats');
// randevular
export const listAppointments = call('listAppointments');
export const listAllAppointments = call('listAllAppointments');
export const adminSlots = call('adminSlots');
export const setAppointmentStatus = call('setAppointmentStatus');
export const moveAppointment = call('moveAppointment');
export const createManualAppointment = call('createManualAppointment');
export const addBlock = call('addBlock');
export const removeBlock = call('removeBlock');
// yönetim
export const listTrash = call('listTrash');
export const restoreItem = call('restoreItem');
export const purgeItem = call('purgeItem');
export const listLogs = call('listLogs');
export const listOutbox = call('listOutbox');
export const clearOutbox = call('clearOutbox');
// WhatsApp hatırlatma ve müşteri kartı (sunucu özellikleri; demo modunda boş döner)
export const listReminders = serverOnly('listReminders', () => ({ date: '', items: [], counts: { bugun: 0, yarin: 0 }, forms: [] }));
export const markReminded = serverOnly('markReminded', () => ({ waAt: Date.now(), waBy: '' }));
export const listCustomers = serverOnly('listCustomers', () => ({ items: [], total: 0 }));
export const getCustomer = serverOnly('getCustomer', () => { throw new Error('Demo modunda kullanılamaz.'); });
export const addCustomerNote = serverOnly('addCustomerNote', () => { throw new Error('Demo modunda kullanılamaz.'); });
export const deleteCustomerNote = serverOnly('deleteCustomerNote', () => true);
