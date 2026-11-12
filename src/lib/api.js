// =====================================================================
//  BATILMER FORM PANELİ – API GİRİŞİ
//  Ekranlar veriye sadece bu dosya üzerinden ulaşır.
//  VITE_API_MODE=server  → Node.js sunucusu + MySQL (canlı, varsayılan)
//  VITE_API_MODE=local   → sunucusuz demo, veri tarayıcıda (localStorage)
// =====================================================================
import * as local from './api.local.js';
import { remote, onSessionExpired } from './api.remote.js';

export { STATUS_LABELS, SUBMISSION_STATUSES, submissionStatusLabel, displayValue } from './shared.js';
export { addDays, today } from './util.js';
export { onSessionExpired };

export const API_MODE = import.meta.env.VITE_API_MODE === 'local' ? 'local' : 'server';
const impl = API_MODE === 'local' ? local : remote;
const call = (name) => (...args) => impl[name](...args);

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
