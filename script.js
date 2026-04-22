// ==================== CONFIGURAZIONE ====================
const firebaseConfig = {
    apiKey: "AIzaSyAVlSo3W578ClzYE4z2qLQfaNaDIk41USI",
    authDomain: "richieste-u14.firebaseapp.com",
    projectId: "richieste-u14",
    storageBucket: "richieste-u14.appspot.com"
};

// Inizializza Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configurazione EmailJS
const EMAILJS_CONFIG = {
    publicKey: 'YOUR_PUBLIC_KEY',
    serviceId: 'YOUR_SERVICE_ID',
    templateId: 'YOUR_TEMPLATE_ID'
};


// ==================== COSTANTI ====================
const CONSTANTS = {
    TEMP_PASSWORD: 'union14.it',
    PASSWORD_MIN_LENGTH: 8,
    PAGE_SIZE_DEFAULT: 10,
    EMPLOYEES_PAGE_SIZE: 5,
    TOAST_DURATION: 3000,
    DEBOUNCE_DELAY: 300,
    ORE_GIORNO_LAVORATIVO: 8,
     ORE_FERIE_ANNUALI: 160,      // 20 giorni * 8 ore
    ORE_PERMESSI_ANNUALI: 103  // 13 giorni * 8 ore
};

// ==================== STATO APPLICAZIONE ====================
const appState = {
    currentUser: null,
    currentUserData: null,
    isAdmin: false,
    filters: { type: '', employee: '', year: '', month: '', status: '' },
    currentPage: 1,
    pageSize: CONSTANTS.PAGE_SIZE_DEFAULT,
    totalRequests: 0,
    realtimeListener: null,
    employeesPage: 1,
    employeesPageSize: CONSTANTS.EMPLOYEES_PAGE_SIZE,
    totalEmployees: 0,
    allEmployees: [],
    listeners: new Map()
};
// Aggiungi evento per lo storico reset
const resetHistoryBtn = document.getElementById('resetHistoryBtn');
if (resetHistoryBtn) {
    resetHistoryBtn.addEventListener('click', showResetHistory);
}
// ==================== VARIABILI CALENDARIO ====================
let currentCalendarDate = new Date();
let allAbsences = [];
let notificationsEnabled = false;

// ==================== UTILITY FUNCTIONS ====================
function setupEmployeesTab() {
    const showEmployeesBtn = document.getElementById('showEmployeesBtn');
    if (showEmployeesBtn) {
        showEmployeesBtn.addEventListener('click', async () => {
            const employeesList = document.getElementById('employeesList');
            if (employeesList.style.display === 'block') {
                employeesList.style.display = 'none';
            } else {
                employeesList.style.display = 'block';
                appState.employeesPage = 1; // Reset alla prima pagina
                await loadEmployeesList();
                initEmployeesPaginationEvents();
            }
        });
    }
}
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeInput(input) {
    if (!input) return '';
    return String(input).trim().replace(/[<>]/g, '');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleError(error, context = '') {
    console.error(`Error in ${context}:`, error);
    
    let userMessage = 'Si è verificato un errore';
    
    if (error.code) {
        switch (error.code) {
            case 'permission-denied':
                userMessage = 'Non hai i permessi per eseguire questa operazione';
                break;
            case 'unavailable':
                userMessage = 'Servizio temporaneamente non disponibile. Riprova più tardi';
                break;
            case 'not-found':
                userMessage = 'Risorsa non trovata';
                break;
            default:
                userMessage = error.message || 'Errore sconosciuto';
        }
    }
    
    showFeedback('Errore', userMessage);
    return userMessage;
}

function validatePassword(password, isNewPassword = false) {
    const errors = [];
    
    if (!password || password.length === 0) {
        errors.push('La password è obbligatoria');
    }
    
    if (isNewPassword) {
        if (password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
            errors.push(`La password deve avere almeno ${CONSTANTS.PASSWORD_MIN_LENGTH} caratteri`);
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('La password deve contenere almeno una lettera maiuscola');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('La password deve contenere almeno un numero');
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            errors.push('La password deve contenere almeno un carattere speciale');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

function checkPasswordStrength(password) {
    if (!password) return { score: 0, label: '', class: '', suggestions: [] };
    
    let score = 0;
    const suggestions = [];
    
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length < 8) suggestions.push('Usa almeno 8 caratteri');
    if (/[A-Z]/.test(password)) score++;
    else suggestions.push('Aggiungi lettere maiuscole');
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    else suggestions.push('Aggiungi numeri');
    if (/[^A-Za-z0-9]/.test(password)) score++;
    else suggestions.push('Aggiungi caratteri speciali (!@#$%^&*)');
    
    let label = '', className = '';
    if (score <= 2) {
        label = 'Debole';
        className = 'weak';
    } else if (score <= 4) {
        label = 'Media';
        className = 'medium';
    } else {
        label = 'Forte';
        className = 'strong';
    }
    
    return { score, label, className, suggestions };
}

function setLoadingState(element, isLoading, customText = null) {
    if (!element) return;
    
    if (isLoading) {
        element.disabled = true;
        const originalText = element.getAttribute('data-original-text') || element.textContent;
        element.setAttribute('data-original-text', originalText);
        
        const loadingEl = element.querySelector('.btn-loading');
        if (loadingEl) {
            loadingEl.style.display = 'inline-flex';
            const textSpan = element.querySelector('.btn-text');
            if (textSpan) textSpan.style.display = 'none';
        } else {
            element.textContent = customText || 'Caricamento...';
        }
    } else {
        element.disabled = false;
        const loadingEl = element.querySelector('.btn-loading');
        const textSpan = element.querySelector('.btn-text');
        
        if (loadingEl) {
            loadingEl.style.display = 'none';
            if (textSpan) textSpan.style.display = 'inline';
        } else {
            const originalText = element.getAttribute('data-original-text');
            if (originalText) element.textContent = originalText;
        }
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, CONSTANTS.TOAST_DURATION);
}

function showFeedback(title, message, isHtml = false) {
    const titleEl = document.getElementById('feedbackTitle');
    const messageEl = document.getElementById('feedbackMessage');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) {
        if (isHtml) {
            messageEl.innerHTML = message;
        } else {
            messageEl.textContent = message;
        }
    }
    
    const dialog = document.getElementById('feedbackDialog');
    if (dialog) dialog.showModal();
    
    if (title !== 'Errore') {
        showToast(message, title === 'Successo' ? 'success' : 'info');
    }
}

function showConfirmation(title, message, onConfirm, onCancel = null) {
    const titleEl = document.getElementById('confirmationTitle');
    const messageEl = document.getElementById('confirmationMessage');
    const confirmBtn = document.getElementById('confirmAction');
    const cancelBtn = document.getElementById('cancelAction');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    
    const dialog = document.getElementById('confirmationDialog');
    
    const handleConfirm = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };
    
    const handleCancel = () => {
        cleanup();
        if (onCancel) onCancel();
    };
    
    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        if (dialog) dialog.close();
    };
    
    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    
    if (dialog) dialog.showModal();
}

function announceToScreenReader(message) {
    const srAnnouncement = document.getElementById('srAnnouncement');
    if (srAnnouncement) {
        srAnnouncement.textContent = message;
        setTimeout(() => { srAnnouncement.textContent = ''; }, 3000);
    }
}

function formatDate(dateValue) {
    if (!dateValue) return 'N/D';
    try {
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString('it-IT');
    } catch {
        return 'N/D';
    }
}

function showError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = message ? 'block' : 'none';
        if (message) {
            errorEl.setAttribute('role', 'alert');
        }
    }
}

function showLogin() {
    const loginContainer = document.getElementById('loginContainer');
    const mainContainer = document.getElementById('mainContainer');
    const loginForm = document.getElementById('loginForm');
    
    if (loginContainer) loginContainer.style.display = 'flex';
    if (mainContainer) mainContainer.style.display = 'none';
    if (loginForm) loginForm.reset();
    
    showError('');
}

// ==================== AUTHENTICATION ====================
function getAuthErrorMessage(error) {
    const errors = {
        'auth/invalid-email': 'Email non valida',
        'auth/user-disabled': 'Account disabilitato. Contatta l\'amministratore',
        'auth/user-not-found': 'Utente non trovato',
        'auth/wrong-password': 'Password errata',
        'auth/too-many-requests': 'Troppi tentativi falliti. Riprova più tardi',
        'auth/network-request-failed': 'Errore di connessione. Verifica la tua rete',
        'auth/invalid-login-credentials': 'Email o password non validi',
        'auth/requires-recent-login': 'Per sicurezza, effettua di nuovo il login'
    };
    return errors[error.code] || `Errore: ${error.message}`;
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email')?.value?.trim().toLowerCase() || '';
    const password = document.getElementById('password')?.value || '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!email || !password) {
        showError('Inserisci email e password');
        return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Inserisci un indirizzo email valido');
        return;
    }
    
    try {
        setLoadingState(submitBtn, true);
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        let userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            const querySnapshot = await db.collection('users').where('email', '==', email).get();
            
            if (!querySnapshot.empty) {
                userDoc = querySnapshot.docs[0];
                await db.collection('users').doc(user.uid).set(userDoc.data());
                await db.collection('users').doc(userDoc.id).delete();
                userDoc = await db.collection('users').doc(user.uid).get();
            }
        }
        
        if (!userDoc.exists) {
            const newUserData = {
                name: user.displayName || email.split('@')[0],
                email: email,
                role: email === 'eliraoui.a@union14.it' ? 'admin' : 'dipendente',
                temporaryPassword: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('users').doc(user.uid).set(newUserData);
            userDoc = await db.collection('users').doc(user.uid).get();
        }
        
        const userData = userDoc.data();
        
        appState.currentUser = user;
        appState.currentUserData = userData;
        appState.isAdmin = userData.role === 'admin';
        
        setupUI();
        
        showError('');
        showToast(`Benvenuto ${escapeHtml(userData.name)}`, 'success');
        announceToScreenReader(`Accesso effettuato come ${userData.name}`);
        
    } catch (error) {
        console.error('Login error:', error);
        showError(getAuthErrorMessage(error));
    } finally {
        setLoadingState(submitBtn, false);
    }
}

async function handleLogout() {
    try {
        if (appState.realtimeListener) {
            appState.realtimeListener();
            appState.realtimeListener = null;
        }
        
        appState.listeners.forEach((listener, element) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(listener.event, listener.handler);
            }
        });
        appState.listeners.clear();
        
        await auth.signOut();
        
        appState.currentUser = null;
        appState.currentUserData = null;
        appState.isAdmin = false;
        appState.currentPage = 1;
        appState.filters = { type: '', employee: '', year: '', month: '', status: '' };
        
        showLogin();
        showToast('Logout effettuato con successo', 'success');
        
    } catch (error) {
        console.error("Logout error:", error);
        showFeedback('Errore', 'Errore durante il logout');
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();
    
    const email = prompt("Inserisci la tua email per reimpostare la password:");
    if (!email) return;
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert("Email non valida");
        return;
    }
    
    try {
        await auth.sendPasswordResetEmail(email);
        showFeedback('Successo', 'Email di reset inviata! Controlla la tua casella di posta (anche nello spam).');
    } catch (error) {
        showFeedback('Errore', getAuthErrorMessage(error));
    }
}
function getAnnoCorrente() {
    return new Date().getFullYear();
}

// Ottieni il nome del campo per un anno specifico
function getFieldName(baseName, anno = null) {
    const year = anno || getAnnoCorrente();
    return `${baseName}_${year}`;
}
async function inizializzaOreAnnoCorrente(userId) {
    const annoCorrente = getAnnoCorrente();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    const updateData = {};
    
    // Verifica se esiste già il campo per l'anno corrente
    const ferieField = getFieldName('oreFerie', annoCorrente);
    const permessiField = getFieldName('orePermessi', annoCorrente);
    
    if (!userData[ferieField]) {
        updateData[ferieField] = CONSTANTS.ORE_FERIE_ANNUALI;
        updateData[getFieldName('oreFerieUtilizzate', annoCorrente)] = 0;
    }
    
    if (!userData[permessiField]) {
        updateData[permessiField] = CONSTANTS.ORE_PERMESSI_ANNUALI;
        updateData[getFieldName('orePermessiUtilizzate', annoCorrente)] = 0;
    }
    
    if (Object.keys(updateData).length > 0) {
        await userRef.update(updateData);
    }
}
async function getOreTotali(userId) {
    const annoCorrente = getAnnoCorrente();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData) return { ferie: 0, permessi: 0 };
    
    // Assicura che i campi anno corrente esistano
    await inizializzaOreAnnoCorrente(userId);
    const userDocAggiornato = await db.collection('users').doc(userId).get();
    const dataAggiornata = userDocAggiornato.data();
    
    // Ore anno corrente
    const oreFerieAnno = dataAggiornata[getFieldName('oreFerie', annoCorrente)] || CONSTANTS.ORE_FERIE_ANNUALI;
    const orePermessiAnno = dataAggiornata[getFieldName('orePermessi', annoCorrente)] || CONSTANTS.ORE_PERMESSI_ANNUALI;
    
    // Ore utilizzate anno corrente
    const oreFerieUtilizzate = dataAggiornata[getFieldName('oreFerieUtilizzate', annoCorrente)] || 0;
    const orePermessiUtilizzate = dataAggiornata[getFieldName('orePermessiUtilizzate', annoCorrente)] || 0;
    
    // Ore residue da anni precedenti
    const oreFeriePrecedenti = dataAggiornata.oreFeriePrecedenti || 0;
    const orePermessiPrecedenti = dataAggiornata.orePermessiPrecedenti || 0;
    
    // Calcolo totali
    const totaleFerie = (oreFerieAnno - oreFerieUtilizzate) + oreFeriePrecedenti;
    const totalePermessi = (orePermessiAnno - orePermessiUtilizzate) + orePermessiPrecedenti;
    
    return {
        ferie: Math.max(totaleFerie, 0),
        permessi: Math.max(totalePermessi, 0),
        ferieAnnoCorrente: oreFerieAnno - oreFerieUtilizzate,
        permessiAnnoCorrente: orePermessiAnno - orePermessiUtilizzate,
        feriePrecedenti: oreFeriePrecedenti,
        permessiPrecedenti: orePermessiPrecedenti,
        ferieTotaliAnno: oreFerieAnno,
        permessiTotaliAnno: orePermessiAnno,
        ferieUtilizzateAnno: oreFerieUtilizzate,
        permessiUtilizzateAnno: orePermessiUtilizzate
    };
}

// ==================== GESTIONE ORE RESIDUE ====================

// Calcola ore per un periodo di ferie
function calcolaOreFerie(dataInizio, dataFine) {
    const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
    return giorni * CONSTANTS.ORE_GIORNO_LAVORATIVO;
}

// Calcola ore per un permesso
function calcolaOrePermesso(oraInizio, oraFine) {
    const start = oraInizio.split(':').map(Number);
    const end = oraFine.split(':').map(Number);
    let ore = end[0] - start[0];
    const minuti = end[1] - start[1];
    if (minuti < 0) {
        ore -= 1;
    } else if (minuti > 0) {
        ore += 0.5;
    }
    return Math.max(ore, 0.5);
}

// Ottieni ore residue di un dipendente
async function getOreResidue(userId, anno = new Date().getFullYear()) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return { oreFerie: 0, orePermessi: 0 };
        
        const data = userDoc.data();
        
        // Se è il primo anno o reset anno, inizializza
        if (data.annoCorrente !== anno) {
            const newData = {
                annoCorrente: anno,
                oreFerie: CONSTANTS.ORE_FERIE_ANNUALI,
                orePermessi: CONSTANTS.ORE_PERMESSI_ANNUALI,
                oreFerieUtilizzate: 0,
                orePermessiUtilizzate: 0
            };
            await db.collection('users').doc(userId).update(newData);
            return {
                oreFerie: CONSTANTS.ORE_FERIE_ANNUALI,
                orePermessi: CONSTANTS.ORE_PERMESSI_ANNUALI,
                oreFerieUtilizzate: 0,
                orePermessiUtilizzate: 0
            };
        }
        
        return {
            oreFerie: (data.oreFerie || CONSTANTS.ORE_FERIE_ANNUALI) - (data.oreFerieUtilizzate || 0),
            orePermessi: (data.orePermessi || CONSTANTS.ORE_PERMESSI_ANNUALI) - (data.orePermessiUtilizzate || 0),
            oreFerieTotali: data.oreFerie || CONSTANTS.ORE_FERIE_ANNUALI,
            orePermessiTotali: data.orePermessi || CONSTANTS.ORE_PERMESSI_ANNUALI,
            oreFerieUtilizzate: data.oreFerieUtilizzate || 0,
            orePermessiUtilizzate: data.orePermessiUtilizzate || 0
        };
    } catch (error) {
        console.error('Errore getOreResidue:', error);
        return { oreFerie: 0, orePermessi: 0 };
    }
}

// Aggiorna contatore ore dopo modifica stato richiesta
async function aggiornaContatoreOre(userId, tipoRichiesta, ore, operazione = 'sottrai') {
    try {
        const annoCorrente = getAnnoCorrente();
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        
        // Prima consuma le ore residue dell'anno precedente, poi quelle dell'anno corrente
        const orePrecedenti = tipoRichiesta === 'Ferie' 
            ? (userData.oreFeriePrecedenti || 0)
            : (userData.orePermessiPrecedenti || 0);
        
        const utilizzateField = getFieldName(`${tipoRichiesta === 'Ferie' ? 'oreFerieUtilizzate' : 'orePermessiUtilizzate'}`, annoCorrente);
        let nuoveUtilizzateAnno = userData[utilizzateField] || 0;
        let nuovePrecedenti = orePrecedenti;
        
        if (operazione === 'sottrai') {
            // Sottrai ore: prima dalle precedenti, poi dall'anno corrente
            if (orePrecedenti >= ore) {
                nuovePrecedenti = orePrecedenti - ore;
            } else {
                nuovePrecedenti = 0;
                const oreDaAnnoCorrente = ore - orePrecedenti;
                nuoveUtilizzateAnno += oreDaAnnoCorrente;
            }
        } else {
            // Aggiungi ore (revoca): aggiungi prima all'anno corrente, poi alle precedenti
            // (logica inversa per mantenere la priorità)
            const utilizateAnno = userData[utilizzateField] || 0;
            if (utilizateAnno >= ore) {
                nuoveUtilizzateAnno = utilizateAnno - ore;
            } else {
                nuoveUtilizzateAnno = 0;
                const oreDaPrecedenti = ore - utilizateAnno;
                nuovePrecedenti = orePrecedenti + oreDaPrecedenti;
            }
        }
        
        const updateData = {
            [utilizzateField]: Math.max(0, nuoveUtilizzateAnno)
        };
        
        if (tipoRichiesta === 'Ferie') {
            updateData.oreFeriePrecedenti = Math.max(0, nuovePrecedenti);
        } else {
            updateData.orePermessiPrecedenti = Math.max(0, nuovePrecedenti);
        }
        
        await userRef.update(updateData);
        
        // Aggiorna UI se l'utente è loggato
        if (appState.currentUser && appState.currentUser.uid === userId) {
            await aggiornaDisplayOreResidue();
        }
        
    } catch (error) {
        console.error('Errore aggiornamento contatore:', error);
        throw error;
    }
}
// Ricalcola tutte le ore utilizzate da zero (utile per correzioni)
async function ricalcolaOreUtilizzate(userId, anno = new Date().getFullYear()) {
    try {
        // Prendi tutte le richieste approvate dell'anno
        const startDate = new Date(anno, 0, 1);
        const endDate = new Date(anno, 11, 31);
        
        const snapshot = await db.collection('richieste')
            .where('userId', '==', userId)
            .where('stato', '==', 'Approvato')
            .get();
        
        let oreFerieTotali = 0;
        let orePermessiTotali = 0;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const dataRichiesta = data.dataInizio?.toDate() || data.data?.toDate();
            
            if (dataRichiesta && dataRichiesta.getFullYear() === anno) {
                if (data.tipo === 'Ferie' && data.dataInizio && data.dataFine) {
                    const ore = calcolaOreFerie(data.dataInizio.toDate(), data.dataFine.toDate());
                    oreFerieTotali += ore;
                } else if (data.tipo === 'Permesso' && data.oraInizio && data.oraFine) {
                    const ore = calcolaOrePermesso(data.oraInizio, data.oraFine);
                    orePermessiTotali += ore;
                }
            }
        }
        
        await db.collection('users').doc(userId).update({
            oreFerieUtilizzate: oreFerieTotali,
            orePermessiUtilizzate: orePermessiTotali,
            annoCorrente: anno
        });
        
        return { oreFerieTotali, orePermessiTotali };
    } catch (error) {
        console.error('Errore ricalcolo:', error);
        return { oreFerieTotali: 0, orePermessiTotali: 0 };
    }
}

// Aggiorna display ore residue per il dipendente loggato
async function aggiornaDisplayOreResidue() {
    if (!appState.currentUser || appState.isAdmin) return;
    
    const totali = await getOreTotali(appState.currentUser.uid);
    
    // Aggiorna indicatore ferie
    const ferieForm = document.getElementById('ferie');
    if (ferieForm) {
        let oreIndicator = document.getElementById('oreFerieIndicator');
        if (!oreIndicator) {
            const formHeader = ferieForm.querySelector('h3');
            if (formHeader) {
                const indicator = document.createElement('div');
                indicator.id = 'oreFerieIndicator';
                indicator.className = 'ore-residue-card';
                indicator.innerHTML = `
                    <div class="ore-residue-info">
                        <div class="ore-label">🏖️ Ore ferie disponibili:</div>
                        <div class="ore-value ${totali.ferie < 40 ? 'ore-basse' : ''}">${totali.ferie}h</div>
                    </div>
                    <div class="ore-dettaglio">
                        <small>📅 Anno corrente: ${totali.ferieAnnoCorrente}h</small>
                        ${totali.feriePrecedenti > 0 ? `<small>📦 Residuo anni precedenti: +${totali.feriePrecedenti}h</small>` : ''}
                        ${totali.feriePrecedenti < 0 ? `<small class="text-danger">⚠️ Negativo da recuperare: ${totali.feriePrecedenti}h</small>` : ''}
                    </div>
                `;
                formHeader.insertAdjacentElement('afterend', indicator);
            }
        } else {
            oreIndicator.querySelector('.ore-value').textContent = `${totali.ferie}h`;
            const dettaglioDiv = oreIndicator.querySelector('.ore-dettaglio');
            if (dettaglioDiv) {
                dettaglioDiv.innerHTML = `
                    <small>📅 Anno corrente: ${totali.ferieAnnoCorrente}h</small>
                    ${totali.feriePrecedenti !== 0 ? `<small>📦 Residuo anni precedenti: ${totali.feriePrecedenti >= 0 ? '+' : ''}${totali.feriePrecedenti}h</small>` : ''}
                `;
            }
        }
    }
    
    // Aggiorna indicatore permessi
    const permessiForm = document.getElementById('permessi');
    if (permessiForm) {
        let oreIndicator = document.getElementById('orePermessiIndicator');
        if (!oreIndicator) {
            const formHeader = permessiForm.querySelector('h3');
            if (formHeader) {
                const indicator = document.createElement('div');
                indicator.id = 'orePermessiIndicator';
                indicator.className = 'ore-residue-card';
                indicator.innerHTML = `
                    <div class="ore-residue-info">
                        <div class="ore-label">⏰ Ore permessi disponibili:</div>
                        <div class="ore-value ${totali.permessi < 20 ? 'ore-basse' : ''}">${totali.permessi}h</div>
                    </div>
                    <div class="ore-dettaglio">
                        <small>📅 Anno corrente: ${totali.permessiAnnoCorrente}h</small>
                        ${totali.permessiPrecedenti > 0 ? `<small>📦 Residuo anni precedenti: +${totali.permessiPrecedenti}h</small>` : ''}
                        ${totali.permessiPrecedenti < 0 ? `<small class="text-danger">⚠️ Negativo da recuperare: ${totali.permessiPrecedenti}h</small>` : ''}
                    </div>
                `;
                formHeader.insertAdjacentElement('afterend', indicator);
            }
        } else {
            oreIndicator.querySelector('.ore-value').textContent = `${totali.permessi}h`;
            const dettaglioDiv = oreIndicator.querySelector('.ore-dettaglio');
            if (dettaglioDiv) {
                dettaglioDiv.innerHTML = `
                    <small>📅 Anno corrente: ${totali.permessiAnnoCorrente}h</small>
                    ${totali.permessiPrecedenti !== 0 ? `<small>📦 Residuo anni precedenti: ${totali.permessiPrecedenti >= 0 ? '+' : ''}${totali.permessiPrecedenti}h</small>` : ''}
                `;
            }
        }
    }
}


// ==================== REQUESTS MANAGEMENT ====================
function calcolaGiorniLavorativi(inizio, fine) {
    let giorni = 0;
    const data = new Date(inizio);
    const end = new Date(fine);
    data.setHours(0, 0, 0);
    end.setHours(0, 0, 0);
    
    while (data <= end) {
        const giorno = data.getDay();
        if (giorno !== 0 && giorno !== 6) giorni++;
        data.setDate(data.getDate() + 1);
    }
    return giorni;
}

function calcolaGiorniFerie() {
    const inizio = document.getElementById('ferieDataInizio')?.value;
    const fine = document.getElementById('ferieDataFine')?.value;
    const giorniInput = document.getElementById('ferieGiorni');
    
    if (inizio && fine && giorniInput) {
        const giorni = calcolaGiorniLavorativi(inizio, fine);
        giorniInput.value = giorni;
    }
}

async function loadRequests() {
    const richiesteBody = document.getElementById('richiesteBody');
    if (!richiesteBody) return;
    
    richiesteBody.innerHTML = `<tr><td colspan="6" class="text-center"><div class="loading-spinner"></div> Caricamento...</td></tr>`;
    
    try {
        let allDocs = [];
        let query = db.collection('richieste');
        
        // Per admin: applica filtri base su Firestore solo per tipo e stato
        if (appState.isAdmin) {
            let firestoreQuery = db.collection('richieste');
            
            if (appState.filters.type && appState.filters.type !== '') {
                firestoreQuery = firestoreQuery.where('tipo', '==', appState.filters.type);
            }
            
            if (appState.filters.status && appState.filters.status !== '') {
                firestoreQuery = firestoreQuery.where('stato', '==', appState.filters.status);
            }
            
            firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc');
            const snapshot = await firestoreQuery.get();
            allDocs = snapshot.docs;
            
        } else {
            const snapshot = await db.collection('richieste')
                .where('userId', '==', appState.currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();
            allDocs = snapshot.docs;
        }
        
        // Filtri lato client
        let filteredDocs = allDocs;
        
        if (appState.isAdmin) {
            // Filtro per dipendente
            if (appState.filters.employee && appState.filters.employee !== '') {
                const searchTerm = sanitizeInput(appState.filters.employee).toLowerCase();
                filteredDocs = filteredDocs.filter(doc => 
                    doc.data().userName?.toLowerCase().includes(searchTerm)
                );
            }
        }
        
        // FILTRO PER DATA MIGLIORATO - gestisce periodi a cavallo tra mesi
        if (appState.filters.year || appState.filters.month) {
            const year = appState.filters.year ? parseInt(appState.filters.year) : null;
            const month = appState.filters.month ? parseInt(appState.filters.month) : null;
            
            filteredDocs = filteredDocs.filter(doc => {
                const data = doc.data();
                
                // Per i permessi (singolo giorno)
                if (data.tipo === 'Permesso') {
                    const docDate = data.data?.toDate();
                    if (!docDate) return false;
                    
                    let match = true;
                    if (year && docDate.getFullYear() !== year) match = false;
                    if (month && (docDate.getMonth() + 1) !== month) match = false;
                    return match;
                }
                
                // Per Ferie e Malattia (periodi)
                const startDate = data.dataInizio?.toDate();
                const endDate = data.dataFine?.toDate();
                
                if (!startDate || !endDate) return false;
                
                // Se non ci sono filtri su anno/mese, mostra tutto
                if (!year && !month) return true;
                
                // Ottieni il range del mese/anno da filtrare
                let filterStartDate, filterEndDate;
                
                if (year && month) {
                    // Filtro per mese specifico
                    filterStartDate = new Date(year, month - 1, 1);
                    filterEndDate = new Date(year, month, 0); // Ultimo giorno del mese
                } else if (year && !month) {
                    // Filtro solo per anno
                    filterStartDate = new Date(year, 0, 1);
                    filterEndDate = new Date(year, 11, 31);
                } else {
                    return true;
                }
                
                // Verifica se il periodo si sovrappone con il mese/anno filtrato
                const overlaps = (startDate <= filterEndDate && endDate >= filterStartDate);
                
                return overlaps;
            });
        }
        
        appState.totalRequests = filteredDocs.length;
        updatePagination();
        
        const start = (appState.currentPage - 1) * appState.pageSize;
        const paginated = filteredDocs.slice(start, start + appState.pageSize);
        renderRequests(paginated);
        
    } catch (error) {
        console.error('Errore loadRequests:', error);
        handleError(error, 'loadRequests');
        richiesteBody.innerHTML = `<tr><td colspan="6" class="error text-center">Errore nel caricamento delle richieste: ${error.message}</td></tr>`;
    }
}

function renderRequests(docs) {
    const richiesteBody = document.getElementById('richiesteBody');
    if (!richiesteBody) return;
    
    richiesteBody.innerHTML = '';
    
    if (docs.length === 0) {
        const colspan = appState.isAdmin ? 6 : 5;
        richiesteBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">Nessuna richiesta trovata</td></tr>`;
        return;
    }
    
    docs.forEach(doc => {
        const data = doc.data();
        let periodo = '', dettagli = '';
        
        switch (data.tipo) {
            case 'Ferie':
    const start = data.dataInizio?.toDate();
    const end = data.dataFine?.toDate();
    const startStr = start ? start.toLocaleDateString('it-IT') : 'N/D';
    const endStr = end ? end.toLocaleDateString('it-IT') : 'N/D';
    periodo = `${startStr} - ${endStr}`;
    
    // Calcola giorni nel mese filtrato (se c'è un filtro mese attivo)
    let giorniInfo = `${data.giorni} giorni totali`;
    if (appState.filters.month && start && end) {
        const filterMonth = parseInt(appState.filters.month) - 1;
        const filterYear = appState.filters.year ? parseInt(appState.filters.year) : start.getFullYear();
        
        let giorniNelMese = 0;
        let current = new Date(start);
        const filterStart = new Date(filterYear, filterMonth, 1);
        const filterEnd = new Date(filterYear, filterMonth + 1, 0);
        
        while (current <= end) {
            if (current >= filterStart && current <= filterEnd) {
                const dayOfWeek = current.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) giorniNelMese++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        if (giorniNelMese > 0 && giorniNelMese < data.giorni) {
            giorniInfo = `${giorniNelMese} giorni nel mese selezionato (totale ${data.giorni})`;
        } else if (giorniNelMese === data.giorni) {
            giorniInfo = `${data.giorni} giorni (interamente nel mese)`;
        }
    }
    
    dettagli = giorniInfo;
                break;
            case 'Malattia':
                const malStart = data.dataInizio?.toDate();
                const malEnd = data.dataFine?.toDate();
                const malStartStr = malStart ? malStart.toLocaleDateString('it-IT') : 'N/D';
                const malEndStr = malEnd ? malEnd.toLocaleDateString('it-IT') : 'N/D';
                periodo = `${malStartStr} - ${malEndStr}`;
                dettagli = `Cert. n. ${escapeHtml(data.numeroCertificato || '')}`;
                break;
            case 'Permesso':
                const permDate = data.data?.toDate();
                periodo = permDate ? permDate.toLocaleDateString('it-IT') : 'N/D';
                dettagli = `${data.oraInizio} - ${data.oraFine}`;
                if (data.motivazione) dettagli += ` (${escapeHtml(data.motivazione)})`;
                break;
        }
        
        const row = document.createElement('tr');
        const showEditButton = !appState.isAdmin && data.stato === 'In attesa';
        
        row.innerHTML = `
            <td data-label="Tipo">${escapeHtml(data.tipo)}</td>
            <td data-label="Nome">${escapeHtml(data.userName)}</td>
            <td data-label="Periodo">${escapeHtml(periodo)}</td>
            <td data-label="Dettagli">${dettagli}</td>
            <td data-label="Stato">
                <span class="status-badge ${data.stato.toLowerCase().replace(' ', '-')}">
                    ${escapeHtml(data.stato)}
                </span>
            </td>
            <td data-label="Azioni" class="actions-cell">
                ${renderActionsCell(doc.id, data, showEditButton)}
            </td>
        `;
        
        attachRequestEventListeners(row, doc.id, data);
        richiesteBody.appendChild(row);
    });
    updateTableDataLabels();
}

function renderActionsCell(requestId, data, showEditButton) {
    if (appState.isAdmin) {
        return `
            <select class="status-select" data-id="${requestId}">
                <option value="In attesa" ${data.stato === 'In attesa' ? 'selected' : ''}>In attesa</option>
                <option value="Approvato" ${data.stato === 'Approvato' ? 'selected' : ''}>Approvato</option>
                <option value="Rifiutato" ${data.stato === 'Rifiutato' ? 'selected' : ''}>Rifiutato</option>
            </select>
            <button class="btn-small save-status" data-id="${requestId}">Salva</button>
            <button class="btn-small btn-danger delete-request" data-id="${requestId}">Elimina</button>
        `;
    } else {
        let actions = '';
        if (showEditButton) {
            actions += `<button class="btn-small btn-edit edit-request" data-id="${requestId}" data-type="${data.tipo}">✏️ Modifica</button>`;
        }
        if (data.stato !== 'In attesa') {
            actions += `<span class="text-muted" style="font-size: 12px;">Non modificabile</span>`;
        }
        return actions;
    }
}

function attachRequestEventListeners(row, requestId, data) {
    if (appState.isAdmin) {
        const saveBtn = row.querySelector('.save-status');
        const deleteBtn = row.querySelector('.delete-request');
        const statusSelect = row.querySelector('.status-select');
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const newStatus = statusSelect.value;
                updateRequestStatus(requestId, newStatus);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                showConfirmation('Elimina Richiesta', 'Sei sicuro di voler eliminare questa richiesta?', () => deleteRequest(requestId));
            });
        }
    } else {
        const editBtn = row.querySelector('.edit-request');
        if (editBtn) {
            const newEditBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newEditBtn, editBtn);
            newEditBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                editRequest(requestId);
            });
        }
    }
}

async function updateRequestStatus(requestId, newStatus) {
    try {
        const requestDoc = await db.collection('richieste').doc(requestId).get();
        const requestData = requestDoc.data();
        const oldStatus = requestData.stato;
        
        // Calcola ore della richiesta
        let oreRichiesta = 0;
        if (requestData.tipo === 'Ferie' && requestData.dataInizio && requestData.dataFine) {
            oreRichiesta = calcolaOreFerie(requestData.dataInizio.toDate(), requestData.dataFine.toDate());
        } else if (requestData.tipo === 'Permesso' && requestData.oraInizio && requestData.oraFine) {
            oreRichiesta = calcolaOrePermesso(requestData.oraInizio, requestData.oraFine);
        }
        
        // Gestione aggiornamento contatori
        if (newStatus === 'Approvato' && oldStatus !== 'Approvato') {
            // Approvazione: sottrai le ore
            await aggiornaContatoreOre(requestData.userId, requestData.tipo, oreRichiesta, 'sottrai');
        } else if (newStatus !== 'Approvato' && oldStatus === 'Approvato') {
            // Revoca approvazione: restituisci le ore
            await aggiornaContatoreOre(requestData.userId, requestData.tipo, oreRichiesta, 'aggiungi');
        }
        
        // Aggiorna stato
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser?.uid,
            oreRichiesta: oreRichiesta
        });
        
        showFeedback('Successo', `Stato aggiornato a "${newStatus}"`);
        await loadRequests();
        if (appState.isAdmin && typeof loadCalendarData === 'function') loadCalendarData();
        
        // Aggiorna display ore residue se l'utente è il richiedente
        if (appState.currentUser && appState.currentUser.uid === requestData.userId) {
            await aggiornaDisplayOreResidue();
        }
        
    } catch (error) {
        handleError(error, 'updateRequestStatus');
    }
}

async function deleteRequest(requestId) {
    try {
        const requestDoc = await db.collection('richieste').doc(requestId).get();
        const requestData = requestDoc.data();
        
        // Se la richiesta era approvata, restituisci le ore
        if (requestData.stato === 'Approvato') {
            let oreRichiesta = 0;
            if (requestData.tipo === 'Ferie' && requestData.dataInizio && requestData.dataFine) {
                oreRichiesta = calcolaOreFerie(requestData.dataInizio.toDate(), requestData.dataFine.toDate());
            } else if (requestData.tipo === 'Permesso' && requestData.oraInizio && requestData.oraFine) {
                oreRichiesta = calcolaOrePermesso(requestData.oraInizio, requestData.oraFine);
            }
            await aggiornaContatoreOre(requestData.userId, requestData.tipo, oreRichiesta, 'aggiungi');
        }
        
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata con successo');
        await loadRequests();
        if (appState.isAdmin && typeof loadCalendarData === 'function') loadCalendarData();
        
        // Aggiorna display ore residue
        if (appState.currentUser && appState.currentUser.uid === requestData.userId) {
            await aggiornaDisplayOreResidue();
        }
        
    } catch (error) {
        handleError(error, 'deleteRequest');
    }
}
// ==================== FUNZIONI ADMIN PER GESTIONE ORE ====================

// Mostra modale per modificare ore di un dipendente
function showEditOreModal(employeeId, employeeName, currentData) {
    const annoCorrente = getAnnoCorrente();
    const modal = document.createElement('dialog');
    modal.id = 'editOreModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>✏️ Gestione Ore - ${escapeHtml(employeeName)}</h3>
            <form id="editOreForm">
                <div class="form-section">
                    <h4>📅 Anno Corrente ${annoCorrente}</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Ore Ferie Annuali</label>
                            <input type="number" id="editOreFerie" class="form-control" value="${currentData.oreFerieAnno}" step="1" min="0">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ore Permessi Annuali</label>
                            <input type="number" id="editOrePermessi" class="form-control" value="${currentData.orePermessiAnno}" step="1" min="0">
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4>📦 Residuo Anni Precedenti</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Ferie residue (può essere negativo)</label>
                            <input type="number" id="editOreFeriePrecedenti" class="form-control" value="${currentData.oreFeriePrecedenti}" step="1">
                            <small class="form-help">Valore negativo = ore da recuperare</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Permessi residui (può essere negativo)</label>
                            <input type="number" id="editOrePermessiPrecedenti" class="form-control" value="${currentData.orePermessiPrecedenti}" step="1">
                            <small class="form-help">Valore negativo = ore da recuperare</small>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4>📊 Anteprima Totali</h4>
                    <div class="anteprima-totali" id="anteprimaTotali">
                        <div>🏖️ Ferie totali: <span id="anteprimaFerie">0</span>h</div>
                        <div>⏰ Permessi totali: <span id="anteprimaPermessi">0</span>h</div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">💾 Salva</button>
                    <button type="button" id="closeOreModal" class="btn btn-secondary">Annulla</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.showModal();
   
  function updateAnteprima() {
        const oreFerie = parseInt(document.getElementById('editOreFerie').value) || 0;
        const orePermessi = parseInt(document.getElementById('editOrePermessi').value) || 0;
        const feriePrec = parseInt(document.getElementById('editOreFeriePrecedenti').value) || 0;
        const permessiPrec = parseInt(document.getElementById('editOrePermessiPrecedenti').value) || 0;
        const utilizzateFerie = currentData.oreFerieUtilizzate || 0;
        const utilizzatePermessi = currentData.orePermessiUtilizzate || 0;
        
        const totaleFerie = (oreFerie - utilizzateFerie) + feriePrec;
        const totalePermessi = (orePermessi - utilizzatePermessi) + permessiPrec;
        
        document.getElementById('anteprimaFerie').textContent = totaleFerie;
        document.getElementById('anteprimaPermessi').textContent = totalePermessi;
        
        // Colore per valori negativi
        document.getElementById('anteprimaFerie').style.color = totaleFerie < 0 ? '#ef476f' : '#06d6a0';
        document.getElementById('anteprimaPermessi').style.color = totalePermessi < 0 ? '#ef476f' : '#06d6a0';
    }
    
    const form = document.getElementById('editOreForm');
    const closeBtn = document.getElementById('closeOreModal');
    
    // Aggiungi event listener per anteprima
    document.getElementById('editOreFerie').addEventListener('input', updateAnteprima);
    document.getElementById('editOrePermessi').addEventListener('input', updateAnteprima);
    document.getElementById('editOreFeriePrecedenti').addEventListener('input', updateAnteprima);
    document.getElementById('editOrePermessiPrecedenti').addEventListener('input', updateAnteprima);
    updateAnteprima();
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const oreFerie = parseInt(document.getElementById('editOreFerie').value);
        const orePermessi = parseInt(document.getElementById('editOrePermessi').value);
        const feriePrecedenti = parseInt(document.getElementById('editOreFeriePrecedenti').value);
        const permessiPrecedenti = parseInt(document.getElementById('editOrePermessiPrecedenti').value);
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '⏳ Salvataggio...';
        submitBtn.disabled = true;
        
        try {
            const updateData = {
                [getFieldName('oreFerie', annoCorrente)]: oreFerie,
                [getFieldName('orePermessi', annoCorrente)]: orePermessi,
                oreFeriePrecedenti: feriePrecedenti,
                orePermessiPrecedenti: permessiPrecedenti,
                oreUpdatedBy: appState.currentUser.uid,
                oreUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('users').doc(employeeId).update(updateData);
            
            modal.close();
            modal.remove();
            showToast(`✅ Ore aggiornate per ${employeeName}`, 'success');
            await refreshEmployeesList();
            
        } catch (error) {
            console.error('Errore salvataggio ore:', error);
            showFeedback('Errore', `Errore: ${error.message}`);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
    
    closeBtn.addEventListener('click', () => {
        modal.close();
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.close();
            modal.remove();
        }
    });
}

function initEmployeesPaginationEvents() {
    const prevPage = document.getElementById('prevEmployeesPage');
    const nextPage = document.getElementById('nextEmployeesPage');
    
    if (prevPage) {
        // Rimuovi eventuali listener vecchi
        const newPrev = prevPage.cloneNode(true);
        prevPage.parentNode.replaceChild(newPrev, prevPage);
        newPrev.addEventListener('click', goToPrevEmployeesPage);
    }
    
    if (nextPage) {
        const newNext = nextPage.cloneNode(true);
        nextPage.parentNode.replaceChild(newNext, nextPage);
        newNext.addEventListener('click', goToNextEmployeesPage);
    }
}
// Aggiungi colonna ore nella tabella dipendenti
function renderEmployeesPageWithOre() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    const start = (appState.employeesPage - 1) * appState.employeesPageSize;
    const pageEmployees = appState.allEmployees.slice(start, start + appState.employeesPageSize);
    
    employeesBody.innerHTML = '';
    
    if (pageEmployees.length === 0) {
        employeesBody.innerHTML = `<tr><td colspan="8" class="text-center">Nessun dipendente trovato</td></tr>`;
        return;
    }
    
    pageEmployees.forEach(employee => {
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === employee.id;
        const oreFerieResidue = (employee.oreFerie || CONSTANTS.ORE_FERIE_ANNUALI) - (employee.oreFerieUtilizzate || 0);
        const orePermessiResidue = (employee.orePermessi || CONSTANTS.ORE_PERMESSI_ANNUALI) - (employee.orePermessiUtilizzate || 0);
        
        const row = document.createElement('tr');
        if (isCurrentUser) row.classList.add('current-user');
        
        row.innerHTML = `
            <td>${escapeHtml(employee.name || 'N/D')}</td>
            <td>${escapeHtml(employee.email || '')}</td>
            <td>
                <select class="role-select form-control" data-id="${employee.id}" ${isCurrentUser ? 'disabled' : ''}>
                    <option value="dipendente" ${employee.role === 'dipendente' ? 'selected' : ''}>Dipendente</option>
                    <option value="admin" ${employee.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td class="ore-cell">
                <div class="ore-stats">
                    <span class="ore-ferie">🏖️ ${oreFerieResidue}h</span>
                    <span class="ore-permessi">⏰ ${orePermessiResidue}h</span>
                </div>
            </td>
            <td>
                <button class="btn-small btn-edit-ore" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}" 
                        data-ferie="${employee.oreFerie || CONSTANTS.ORE_FERIE_ANNUALI}" 
                        data-permessi="${employee.orePermessi || CONSTANTS.ORE_PERMESSI_ANNUALI}">
                    ✏️ Modifica Ore
                </button>
            </td>
            <td>${employee.temporaryPassword ? '<span class="status-badge rifiutato">⚠️ Temporanea</span>' : '<span class="status-badge approvato">✓ Definitiva</span>'}</td>
            <td class="actions-cell">
                ${!isCurrentUser ? `
                    <button class="btn-small reset-password" data-email="${escapeHtml(employee.email)}">🔄 Reset</button>
                    <button class="btn-small btn-danger delete-employee" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}">🗑️</button>
                ` : '<span class="text-muted">Utente corrente</span>'}
            </td>
        `;
        
        // Eventi per i nuovi bottoni
        const oreEditBtn = row.querySelector('.btn-edit-ore');
        if (oreEditBtn) {
            oreEditBtn.addEventListener('click', () => {
             showEditOreModal(oreEditBtn.dataset.id, oreEditBtn.dataset.name, {
    oreFerieAnno: parseInt(oreEditBtn.dataset.ferieAnno),
    orePermessiAnno: parseInt(oreEditBtn.dataset.permessiAnno),
    oreFerieUtilizzate: parseInt(oreEditBtn.dataset.ferieUtilizzate) || 0,
    orePermessiUtilizzate: parseInt(oreEditBtn.dataset.permessiUtilizzate) || 0,
    oreFeriePrecedenti: parseInt(oreEditBtn.dataset.feriePrecedenti) || 0,
    orePermessiPrecedenti: parseInt(oreEditBtn.dataset.permessiPrecedenti) || 0
});
            });
        }  
        employeesBody.appendChild(row);
    });
}


// ==================== REQUEST SUBMISSIONS ====================
async function handleFerieSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login');
        return;
    }
    
    const dataInizio = new Date(document.getElementById('ferieDataInizio').value);
    const dataFine = new Date(document.getElementById('ferieDataFine').value);
    const oggi = new Date();
    oggi.setHours(0, 0, 0);
    
    if (dataInizio < oggi) {
        showFeedback('Errore', 'Non puoi richiedere ferie per date passate');
        return;
    }
    
    if (dataFine < dataInizio) {
        showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
        return;
    }
    
    const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
    const oreRichiesta = giorni * CONSTANTS.ORE_GIORNO_LAVORATIVO;
    
    if (giorni <= 0) {
        showFeedback('Errore', 'Nessun giorno lavorativo nel periodo selezionato');
        return;
    }
    
    // VERIFICA ORE TOTALI (anno corrente + precedenti)
    const totali = await getOreTotali(appState.currentUser.uid);
    if (oreRichiesta > totali.ferie) {
        showFeedback('Errore', 
            `❌ Ore ferie insufficienti!\n\n` +
            `Richiedi: ${oreRichiesta}h\n` +
            `Disponibili: ${totali.ferie}h\n` +
            `📅 Anno corrente: ${totali.ferieAnnoCorrente}h\n` +
            `📦 Residuo precedente: ${totali.feriePrecedenti >= 0 ? '+' : ''}${totali.feriePrecedenti}h\n` +
            `Mancano: ${oreRichiesta - totali.ferie}h`, 
            true);
        return;
    }
    
    try {
        await db.collection('richieste').add({
            tipo: 'Ferie',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
            dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
            giorni: giorni,
            oreRichiesta: oreRichiesta,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('ferieForm').reset();
        document.getElementById('ferieGiorni').value = '';
        showFeedback('Successo', 
            `✅ Richiesta ferie inviata!\n\n` +
            `📅 Periodo: ${giorni} giorni\n` +
            `⏰ Ore richieste: ${oreRichiesta}h\n` +
            `📊 Ore residue dopo approvazione: ${totali.ferie - oreRichiesta}h`, 
            true);
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'handleFerieSubmit');
    }
}

async function handleMalattiaSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login');
        return;
    }
    
    const dataInizio = new Date(document.getElementById('malattiaDataInizio').value);
    const dataFine = new Date(document.getElementById('malattiaDataFine').value);
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato')?.value?.trim();
    const dataCertificato = document.getElementById('malattiaDataCertificato')?.value;
    const attachmentFile = document.getElementById('malattiaAttachment')?.files[0];
    
    if (dataFine < dataInizio) {
        showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
        return;
    }
    
    if (!numeroCertificato) {
        showFeedback('Errore', 'Il numero del certificato è obbligatorio');
        return;
    }
    
    if (!dataCertificato) {
        showFeedback('Errore', 'La data del certificato è obbligatoria');
        return;
    }
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        let attachmentData = null;
        if (attachmentFile && attachmentFile.type === 'application/pdf' && attachmentFile.size <= 5 * 1024 * 1024) {
            const reader = new FileReader();
            attachmentData = await new Promise((resolve, reject) => {
                reader.onload = function(e) {
                    resolve({
                        name: attachmentFile.name,
                        data: e.target.result,
                        size: attachmentFile.size,
                        type: attachmentFile.type,
                        uploadDate: new Date().toISOString()
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(attachmentFile);
            });
        } else if (attachmentFile) {
            showFeedback('Errore', 'Solo file PDF di max 5MB sono supportati');
            setLoadingState(submitBtn, false);
            return;
        }
        
        await db.collection('richieste').add({
            tipo: 'Malattia',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
            dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
            numeroCertificato: sanitizeInput(numeroCertificato),
            dataCertificato: firebase.firestore.Timestamp.fromDate(new Date(dataCertificato)),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            attachment: attachmentData
        });
        
        document.getElementById('malattiaForm').reset();
        const attachmentInfo = document.getElementById('attachmentInfo');
        if (attachmentInfo) attachmentInfo.textContent = '';
        showFeedback('Successo', 'Richiesta malattia inviata con successo!');
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'handleMalattiaSubmit');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

async function handlePermessiSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login');
        return;
    }
    
    const data = new Date(document.getElementById('permessiData').value);
    const oraInizio = document.getElementById('permessiOraInizio')?.value;
    const oraFine = document.getElementById('permessiOraFine')?.value;
    const motivazione = document.getElementById('permessiMotivazione')?.value?.trim();
    const oggi = new Date();
    oggi.setHours(0, 0, 0);
    
    if (data < oggi) {
        showFeedback('Errore', 'Non puoi richiedere un permesso per una data passata');
        return;
    }
    
    if (!oraInizio || !oraFine) {
        showFeedback('Errore', 'Le ore di inizio e fine sono obbligatorie');
        return;
    }
    
    if (oraInizio >= oraFine) {
        showFeedback('Errore', 'L\'ora di fine deve essere successiva all\'ora di inizio');
        return;
    }
    
    const oreRichiesta = calcolaOrePermesso(oraInizio, oraFine);
    
    // VERIFICA ORE TOTALI
    const totali = await getOreTotali(appState.currentUser.uid);
    if (oreRichiesta > totali.permessi) {
        showFeedback('Errore', 
            `❌ Ore permessi insufficienti!\n\n` +
            `Richiedi: ${oreRichiesta}h\n` +
            `Disponibili: ${totali.permessi}h\n` +
            `📅 Anno corrente: ${totali.permessiAnnoCorrente}h\n` +
            `📦 Residuo precedente: ${totali.permessiPrecedenti >= 0 ? '+' : ''}${totali.permessiPrecedenti}h\n` +
            `Mancano: ${(oreRichiesta - totali.permessi).toFixed(1)}h`, 
            true);
        return;
    }
    
    try {
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            data: firebase.firestore.Timestamp.fromDate(data),
            oraInizio: oraInizio,
            oraFine: oraFine,
            oreRichiesta: oreRichiesta,
            motivazione: sanitizeInput(motivazione) || '',
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('permessiForm').reset();
        showFeedback('Successo', 
            `✅ Richiesta permesso inviata!\n\n` +
            `📅 Data: ${data.toLocaleDateString('it-IT')}\n` +
            `⏰ Ore richieste: ${oreRichiesta}h\n` +
            `📊 Ore residue dopo approvazione: ${totali.permessi - oreRichiesta}h`, 
            true);
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'handlePermessiSubmit');
    }
}


// ==================== EDIT REQUEST ====================
async function editRequest(requestId) {
    console.log('🎯 Modifica richiesta:', requestId);
    
    try {
        const doc = await db.collection('richieste').doc(requestId).get();
        
        if (!doc.exists) {
            showFeedback('Errore', 'Richiesta non trovata');
            return;
        }
        
        const data = doc.data();
        
        if (data.userId !== appState.currentUser.uid) {
            showFeedback('Errore', 'Non hai i permessi per modificare questa richiesta');
            return;
        }
        
        if (data.stato !== 'In attesa') {
            showFeedback('Errore', 'Puoi modificare solo richieste in stato "In attesa"');
            return;
        }
        
        document.getElementById('editRequestId').value = requestId;
        document.getElementById('editRequestType').value = data.tipo;
        
        document.querySelectorAll('.edit-fields').forEach(field => {
            field.style.display = 'none';
        });
        
        const infoMessage = document.getElementById('editInfoMessage');
        if (infoMessage) infoMessage.style.display = 'block';
        
        if (data.tipo === 'Ferie') {
            document.getElementById('editFerieFields').style.display = 'block';
            const dataInizio = data.dataInizio?.toDate();
            const dataFine = data.dataFine?.toDate();
            document.getElementById('editFerieDataInizio').value = dataInizio?.toISOString().split('T')[0] || '';
            document.getElementById('editFerieDataFine').value = dataFine?.toISOString().split('T')[0] || '';
            document.getElementById('editFerieGiorni').value = data.giorni || 0;
        } else if (data.tipo === 'Malattia') {
            document.getElementById('editMalattiaFields').style.display = 'block';
            const dataInizio = data.dataInizio?.toDate();
            const dataFine = data.dataFine?.toDate();
            const dataCertificato = data.dataCertificato?.toDate();
            document.getElementById('editMalattiaDataInizio').value = dataInizio?.toISOString().split('T')[0] || '';
            document.getElementById('editMalattiaDataFine').value = dataFine?.toISOString().split('T')[0] || '';
            document.getElementById('editMalattiaNumeroCertificato').value = data.numeroCertificato || '';
            document.getElementById('editMalattiaDataCertificato').value = dataCertificato?.toISOString().split('T')[0] || '';
        } else if (data.tipo === 'Permesso') {
            document.getElementById('editPermessiFields').style.display = 'block';
            const dataPermesso = data.data?.toDate();
            document.getElementById('editPermessiData').value = dataPermesso?.toISOString().split('T')[0] || '';
            document.getElementById('editPermessiOraInizio').value = data.oraInizio || '';
            document.getElementById('editPermessiOraFine').value = data.oraFine || '';
            document.getElementById('editPermessiMotivazione').value = data.motivazione || '';
        }
        
        const dialog = document.getElementById('editRequestDialog');
        if (dialog) dialog.showModal();
        
    } catch (error) {
        console.error('Errore modifica:', error);
        showFeedback('Errore', 'Impossibile caricare la richiesta da modificare');
    }
}

async function handleEditRequestSubmit(e) {
    e.preventDefault();
    
    const requestId = document.getElementById('editRequestId').value;
    const requestType = document.getElementById('editRequestType').value;
    
    if (!requestId) {
        showFeedback('Errore', 'ID richiesta non valido');
        return;
    }
    
    try {
        let updateData = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser.uid,
            updatedByName: appState.currentUserData.name,
            stato: 'In attesa'
        };
        
        if (requestType === 'Ferie') {
            const dataInizio = new Date(document.getElementById('editFerieDataInizio').value);
            const dataFine = new Date(document.getElementById('editFerieDataFine').value);
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            if (dataInizio < oggi) {
                showFeedback('Errore', 'Non puoi modificare con date passate');
                return;
            }
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                return;
            }
            
            const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
            if (giorni <= 0) {
                showFeedback('Errore', 'Nessun giorno lavorativo nel periodo');
                return;
            }
            
            updateData.dataInizio = firebase.firestore.Timestamp.fromDate(dataInizio);
            updateData.dataFine = firebase.firestore.Timestamp.fromDate(dataFine);
            updateData.giorni = giorni;
            
        } else if (requestType === 'Malattia') {
            const dataInizio = new Date(document.getElementById('editMalattiaDataInizio').value);
            const dataFine = new Date(document.getElementById('editMalattiaDataFine').value);
            const numeroCertificato = document.getElementById('editMalattiaNumeroCertificato').value.trim();
            const dataCertificato = new Date(document.getElementById('editMalattiaDataCertificato').value);
            
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                return;
            }
            if (!numeroCertificato) {
                showFeedback('Errore', 'Il numero del certificato è obbligatorio');
                return;
            }
            
            updateData.dataInizio = firebase.firestore.Timestamp.fromDate(dataInizio);
            updateData.dataFine = firebase.firestore.Timestamp.fromDate(dataFine);
            updateData.numeroCertificato = sanitizeInput(numeroCertificato);
            updateData.dataCertificato = firebase.firestore.Timestamp.fromDate(dataCertificato);
            
        } else if (requestType === 'Permesso') {
            const data = new Date(document.getElementById('editPermessiData').value);
            const oraInizio = document.getElementById('editPermessiOraInizio').value;
            const oraFine = document.getElementById('editPermessiOraFine').value;
            const motivazione = document.getElementById('editPermessiMotivazione').value.trim();
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            if (data < oggi) {
                showFeedback('Errore', 'Non puoi modificare con una data passata');
                return;
            }
            if (!oraInizio || !oraFine) {
                showFeedback('Errore', 'Le ore di inizio e fine sono obbligatorie');
                return;
            }
            if (oraInizio >= oraFine) {
                showFeedback('Errore', 'L\'ora di fine deve essere successiva all\'ora di inizio');
                return;
            }
            
            updateData.data = firebase.firestore.Timestamp.fromDate(data);
            updateData.oraInizio = oraInizio;
            updateData.oraFine = oraFine;
            updateData.motivazione = sanitizeInput(motivazione) || '';
        }
        
        await db.collection('richieste').doc(requestId).update(updateData);
        
        const dialog = document.getElementById('editRequestDialog');
        if (dialog) dialog.close();
        
        showFeedback('Successo', '✅ Richiesta modificata con successo!');
        await loadRequests();
        
    } catch (error) {
        console.error('Errore modifica:', error);
        showFeedback('Errore', 'Errore durante la modifica: ' + error.message);
    }
}

function initializeEditModal() {
    const editForm = document.getElementById('editRequestForm');
    const closeBtn = document.getElementById('closeEditRequest');
    const editDialog = document.getElementById('editRequestDialog');
    
    if (editForm) {
        editForm.removeEventListener('submit', handleEditRequestSubmit);
        editForm.addEventListener('submit', handleEditRequestSubmit);
    }
    
    if (closeBtn) {
        closeBtn.removeEventListener('click', () => {
            if (editDialog) editDialog.close();
        });
        closeBtn.addEventListener('click', () => {
            if (editDialog) editDialog.close();
        });
    }
    
    if (editDialog) {
        editDialog.addEventListener('click', (e) => {
            if (e.target === editDialog) editDialog.close();
        });
    }
}

function setupEditDialogReset() {
    const dialog = document.getElementById('editRequestDialog');
    if (dialog) {
        dialog.addEventListener('close', () => {
            document.querySelectorAll('.edit-fields').forEach(field => {
                field.style.display = 'none';
            });
        });
    }
}

// ==================== PASSWORD MANAGEMENT ====================
async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    const currentValidation = validatePassword(currentPassword);
    if (!currentValidation.isValid) {
        showFeedback('Errore', currentValidation.errors[0]);
        return;
    }
    
    const newValidation = validatePassword(newPassword, true);
    if (!newValidation.isValid) {
        showFeedback('Errore', newValidation.errors.join('\n'));
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showFeedback('Errore', 'Le nuove password non coincidono');
        return;
    }
    
    if (newPassword === currentPassword) {
        showFeedback('Errore', 'La nuova password deve essere diversa da quella attuale');
        return;
    }
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        const user = auth.currentUser;
        if (!user) throw new Error('Utente non autenticato');
        
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);
        
        await db.collection('users').doc(user.uid).update({
            temporaryPassword: false,
            passwordUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (appState.currentUserData) {
            appState.currentUserData.temporaryPassword = false;
        }
        
        const dialog = document.getElementById('changePasswordDialog');
        if (dialog) dialog.close();
        
        showFeedback('Successo', 'Password cambiata con successo!');
        
        const passwordSection = document.getElementById('passwordSection');
        if (passwordSection) passwordSection.style.display = 'none';
        
        e.target.reset();
        
    } catch (error) {
        console.error('Change password error:', error);
        let errorMessage = 'Errore durante il cambio password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Password attuale non corretta';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La nuova password è troppo debole';
        }
        showFeedback('Errore', errorMessage);
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

function initPasswordStrengthChecker() {
    const newPasswordInput = document.getElementById('newPassword');
    if (!newPasswordInput) return;
    
    const strengthEl = document.getElementById('passwordStrength');
    
    newPasswordInput.addEventListener('input', (e) => {
        const strength = checkPasswordStrength(e.target.value);
        if (strengthEl) {
            if (e.target.value.length === 0) {
                strengthEl.textContent = '';
                strengthEl.className = 'password-strength';
                return;
            }
            strengthEl.textContent = `Forza password: ${strength.label}`;
            strengthEl.className = `password-strength ${strength.className}`;
        }
    });
}

function showPasswordSectionIfNeeded() {
    const passwordSection = document.getElementById('passwordSection');
    const isAdmin = appState.isAdmin;
    const hasTemporaryPassword = appState.currentUserData?.temporaryPassword === true;
    const shouldShow = !isAdmin && hasTemporaryPassword;
    
    if (passwordSection) {
        passwordSection.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) {
            announceToScreenReader('Attenzione: la tua password è temporanea. Cambiala per maggiore sicurezza.');
        }
    }
}

function initPasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.textContent = type === 'password' ? '👁️' : '🔒';
            toggleBtn.setAttribute('aria-pressed', type === 'text');
        });
    }
}

// ==================== ADMIN FUNCTIONS ====================
async function registerEmployee() {
    const name = prompt("Nome completo del dipendente:");
    if (!name?.trim()) {
        showFeedback('Errore', 'Il nome è obbligatorio');
        return;
    }
    
    const email = prompt("Email del dipendente:");
    if (!email) {
        showFeedback('Errore', 'L\'email è obbligatoria');
        return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFeedback('Errore', 'Inserisci un indirizzo email valido');
        return;
    }
    
    if (!appState.isAdmin) {
        showFeedback('Errore', 'Solo gli amministratori possono registrare dipendenti');
        return;
    }
    
    try {
        const submitBtn = document.getElementById('registerEmployeeBtn');
        setLoadingState(submitBtn, true);
        
        const userCredential = await auth.createUserWithEmailAndPassword(email, CONSTANTS.TEMP_PASSWORD);
        await userCredential.user.updateProfile({ displayName: name.trim() });
        
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name.trim(),
            email: email,
            role: 'dipendente',
            temporaryPassword: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: appState.currentUser.uid,
            createdByEmail: appState.currentUser.email,
            createdByName: appState.currentUserData.name
        });
        
        showFeedback('Successo', `✅ Dipendente registrato!<br><br>📧 Email: ${escapeHtml(email)}<br>🔑 Password: ${CONSTANTS.TEMP_PASSWORD}`, true);
        
        const employeesList = document.getElementById('employeesList');
        if (employeesList?.style.display === 'block') {
            await loadEmployeesList();
        }
        
    } catch (error) {
        console.error('Register error:', error);
        showFeedback('Errore', error.code === 'auth/email-already-in-use' ? 'Email già registrata' : error.message);
    } finally {
        const submitBtn = document.getElementById('registerEmployeeBtn');
        setLoadingState(submitBtn, false);
    }
}

async function loadEmployeesList() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    employeesBody.innerHTML = `<tr><td colspan="8">Caricamento...</td></tr>`;
    
    try {
        // IMPORTANTE: Recupera TUTTI i dati aggiornati, inclusi i nuovi campi ore
        const snapshot = await db.collection('users').orderBy('name').get();
        
        appState.allEmployees = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Salta admin (tranne l'admin corrente che può vedersi)
            if (data.role === 'admin' && doc.id !== appState.currentUser?.uid) continue;
            
            // Assicurati che i campi ore esistano (per backward compatibility)
            const oreFerie = data.oreFerie || CONSTANTS.ORE_FERIE_ANNUALI;
            const orePermessi = data.orePermessi || CONSTANTS.ORE_PERMESSI_ANNUALI;
            const oreFerieUtilizzate = data.oreFerieUtilizzate || 0;
            const orePermessiUtilizzate = data.orePermessiUtilizzate || 0;
            
            appState.allEmployees.push({ 
                id: doc.id, 
                ...data,
                oreFerie: oreFerie,
                orePermessi: orePermessi,
                oreFerieUtilizzate: oreFerieUtilizzate,
                orePermessiUtilizzate: orePermessiUtilizzate,
                oreFerieResidue: oreFerie - oreFerieUtilizzate,
                orePermessiResidue: orePermessi - orePermessiUtilizzate
            });
        }
        
        appState.totalEmployees = appState.allEmployees.length;
        updateEmployeesPagination();
        renderEmployeesPage(); // Chiama la funzione corretta
        
    } catch (error) {
        console.error('Errore loadEmployeesList:', error);
        handleError(error, 'loadEmployeesList');
        employeesBody.innerHTML = `<tr><td colspan="8" class="error">Errore nel caricamento: ${error.message}</td></tr>`;
    }
}

function renderEmployeesPage() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    const start = (appState.employeesPage - 1) * appState.employeesPageSize;
    const pageEmployees = appState.allEmployees.slice(start, start + appState.employeesPageSize);
    
    employeesBody.innerHTML = '';
    
    if (pageEmployees.length === 0) {
        employeesBody.innerHTML = `<td><td colspan="8" class="text-center">Nessun dipendente trovato</td></tr>`;
        return;
    }
    
    pageEmployees.forEach(employee => {
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === employee.id;
        const annoCorrente = getAnnoCorrente();
        
        // Calcola totali
        const oreFerieAnno = employee[getFieldName('oreFerie', annoCorrente)] || CONSTANTS.ORE_FERIE_ANNUALI;
        const orePermessiAnno = employee[getFieldName('orePermessi', annoCorrente)] || CONSTANTS.ORE_PERMESSI_ANNUALI;
        const ferieUtilizzate = employee[getFieldName('oreFerieUtilizzate', annoCorrente)] || 0;
        const permessiUtilizzate = employee[getFieldName('orePermessiUtilizzate', annoCorrente)] || 0;
        const feriePrecedenti = employee.oreFeriePrecedenti || 0;
        const permessiPrecedenti = employee.orePermessiPrecedenti || 0;
        
        const totaleFerie = (oreFerieAnno - ferieUtilizzate) + feriePrecedenti;
        const totalePermessi = (orePermessiAnno - permessiUtilizzate) + permessiPrecedenti;
        
        const ferieClass = totaleFerie < 40 ? 'ore-basse' : (totaleFerie < 0 ? 'ore-negative' : '');
        const permessiClass = totalePermessi < 20 ? 'ore-basse' : (totalePermessi < 0 ? 'ore-negative' : '');
        
        const row = document.createElement('tr');
        if (isCurrentUser) row.classList.add('current-user');
        
        row.innerHTML = `
            <td data-label="Nome">${escapeHtml(employee.name || 'N/D')}</td>
            <td data-label="Email">${escapeHtml(employee.email || '')}</td>
            <td data-label="Ruolo">
                <select class="role-select form-control" data-id="${employee.id}" ${isCurrentUser ? 'disabled' : ''}>
                    <option value="dipendente" ${employee.role === 'dipendente' ? 'selected' : ''}>Dipendente</option>
                    <option value="admin" ${employee.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td data-label="Ore Totali" class="ore-cell">
                <div class="ore-stats">
                    <span class="ore-ferie ${ferieClass}">🏖️ Ferie: ${totaleFerie}h</span>
                    <span class="ore-permessi ${permessiClass}">⏰ Permessi: ${totalePermessi}h</span>
                </div>
                <div class="ore-dettaglio-small">
                    <small>📅 Anno: ${oreFerieAnno - ferieUtilizzate}h</small>
                    ${feriePrecedenti !== 0 ? `<small>📦 Residuo: ${feriePrecedenti >= 0 ? '+' : ''}${feriePrecedenti}h</small>` : ''}
                </div>
            </td>
            <td data-label="Gestione Ore">
                <button class="btn-small btn-edit-ore" 
                        data-id="${employee.id}" 
                        data-name="${escapeHtml(employee.name)}"
                        data-ferie-anno="${oreFerieAnno}"
                        data-permessi-anno="${orePermessiAnno}"
                        data-ferie-utilizzate="${ferieUtilizzate}"
                        data-permessi-utilizzate="${permessiUtilizzate}"
                        data-ferie-precedenti="${feriePrecedenti}"
                        data-permessi-precedenti="${permessiPrecedenti}">
                    ✏️ Modifica Ore
                </button>
            </td>
            <td data-label="Stato Password">
                ${employee.temporaryPassword ? '<span class="status-badge rifiutato">⚠️ Temporanea</span>' : '<span class="status-badge approvato">✓ Definitiva</span>'}
            </td>
            <td data-label="Azioni" class="actions-cell">
                ${!isCurrentUser ? `
                    <button class="btn-small reset-password" data-email="${escapeHtml(employee.email)}">🔄 Reset</button>
                    <button class="btn-small btn-danger delete-employee" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}">🗑️</button>
                ` : '<span class="text-muted">Utente corrente</span>'}
            </td>
        `;
        const deleteBtn = row.querySelector('.delete-employee');
if (deleteBtn) {
    // Rimuovi eventuali listener vecchi clonando il bottone
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    
    newDeleteBtn.addEventListener('click', () => {
        const userId = newDeleteBtn.getAttribute('data-id');
        const userName = newDeleteBtn.getAttribute('data-name');
        deleteEmployee(userId, userName);
    });
}
        // Eventi
        const oreEditBtn = row.querySelector('.btn-edit-ore');
        if (oreEditBtn) {
            oreEditBtn.addEventListener('click', () => {
                showEditOreModal(
                    oreEditBtn.dataset.id,
                    oreEditBtn.dataset.name,
                    {
                        oreFerieAnno: parseInt(oreEditBtn.dataset.ferieAnno),
                        orePermessiAnno: parseInt(oreEditBtn.dataset.permessiAnno),
                        oreFerieUtilizzate: parseInt(oreEditBtn.dataset.ferieUtilizzate),
                        orePermessiUtilizzate: parseInt(oreEditBtn.dataset.permessiUtilizzate),
                        oreFeriePrecedenti: parseInt(oreEditBtn.dataset.feriePrecedenti),
                        orePermessiPrecedenti: parseInt(oreEditBtn.dataset.permessiPrecedenti)
                    }
                );
            });
        }
        
        employeesBody.appendChild(row);
    });
 
}
function updateTableDataLabelsEmployees() {
    const headers = document.querySelectorAll('#employeesList .requests-table th');
    const headerTexts = Array.from(headers).map(th => th.textContent.trim());
    
    document.querySelectorAll('#employeesList .requests-table tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            if (headerTexts[index]) {
                cell.setAttribute('data-label', headerTexts[index]);
            }
        });
    });
}

async function updateEmployeeRole(userId, newRole) {
    showConfirmation('Cambio Ruolo', `Sei sicuro di voler cambiare il ruolo a "${newRole}"?`, async () => {
        try {
            await db.collection('users').doc(userId).update({ role: newRole });
            showFeedback('Successo', 'Ruolo aggiornato!');
            await loadEmployeesList();
            if (appState.currentUser && appState.currentUser.uid === userId) {
                appState.currentUserData.role = newRole;
                appState.isAdmin = newRole === 'admin';
                setupUI();
            }
        } catch (error) {
            handleError(error, 'updateEmployeeRole');
        }
    });
}

async function resetEmployeePassword(email) {
    showConfirmation('Reset Password', `Reset password per ${email}? La password temporanea sarà: ${CONSTANTS.TEMP_PASSWORD}`, async () => {
        try {
            await auth.sendPasswordResetEmail(email);
            const usersSnapshot = await db.collection('users').where('email', '==', email).get();
            if (!usersSnapshot.empty) {
                await db.collection('users').doc(usersSnapshot.docs[0].id).update({ temporaryPassword: true });
            }
            showFeedback('Successo', `Email di reset inviata a ${email}`);
        } catch (error) {
            handleError(error, 'resetEmployeePassword');
        }
    });
}

// ==================== ELIMINA DIPENDENTE (VERSIONE SICURA) ====================
async function deleteEmployee(userId, name) {
    // Conferma con dettagli
    showConfirmation(
        '🗑️ Elimina Dipendente', 
        `Sei sicuro di voler eliminare ${name}?\n\n⚠️ Verranno eliminati:\n- Tutti i dati del dipendente\n- Tutte le sue richieste (ferie, malattia, permessi)\n\nQuesta operazione è IRREVERSIBILE!`,
        async () => {
            const confirmBtn = document.querySelector('#confirmationDialog .btn-danger');
            if (confirmBtn) {
                confirmBtn.textContent = '⏳ Eliminazione in corso...';
                confirmBtn.disabled = true;
            }
            
            // Mostra loading
            const loadingToast = showLoadingToast('Eliminazione in corso...');
            
            try {
                // 1. Recupera TUTTE le richieste del dipendente
                const requestsSnapshot = await db.collection('richieste')
                    .where('userId', '==', userId)
                    .get();
                
                const totalRequests = requestsSnapshot.size;
                console.log(`📊 Trovate ${totalRequests} richieste per ${name}`);
                
                // 2. Elimina le richieste UNA PER UNA (per evitare problemi di permessi batch)
                let deletedCount = 0;
                let errorCount = 0;
                
                for (const doc of requestsSnapshot.docs) {
                    try {
                        await db.collection('richieste').doc(doc.id).delete();
                        deletedCount++;
                        
                        // Aggiorna progresso ogni 10 richieste
                        if (deletedCount % 10 === 0) {
                            updateLoadingToast(loadingToast, `Eliminazione richieste: ${deletedCount}/${totalRequests}`);
                        }
                    } catch (err) {
                        console.error(`Errore eliminazione richiesta ${doc.id}:`, err);
                        errorCount++;
                    }
                }
                
                updateLoadingToast(loadingToast, `Eliminazione profilo utente...`);
                
                // 3. Elimina il documento utente
                await db.collection('users').doc(userId).delete();
                
                // 4. Log dell'operazione (opzionale, se hai permessi)
                try {
                    await db.collection('auditLog').add({
                        action: 'delete_employee',
                        userId: userId,
                        userName: name,
                        deletedBy: appState.currentUser?.uid,
                        deletedByName: appState.currentUserData?.name,
                        requestsDeleted: deletedCount,
                        errorsCount: errorCount,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (logError) {
                    console.warn('Impossibile salvare audit log:', logError);
                }
                
                // Chiudi loading
                closeLoadingToast(loadingToast);
                
                showFeedback('Successo', `✅ Dipendente ${name} eliminato con successo!\n\n📊 Richieste eliminate: ${deletedCount}${errorCount > 0 ? `\n⚠️ Errori: ${errorCount}` : ''}`);
                showToast(`Dipendente ${name} eliminato`, 'success');
                
                // 5. Aggiorna la lista
                await loadEmployeesList();
                
            } catch (error) {
                console.error('Errore eliminazione:', error);
                closeLoadingToast(loadingToast);
                
                if (error.code === 'permission-denied') {
                    showFeedback('Errore', `❌ Permessi insufficienti per eliminare il dipendente.\n\nContatta l'amministratore del database per abilitare l'eliminazione.`, true);
                } else {
                    handleError(error, 'deleteEmployee');
                }
            } finally {
                if (confirmBtn) {
                    confirmBtn.textContent = 'Conferma';
                    confirmBtn.disabled = false;
                }
                const dialog = document.getElementById('confirmationDialog');
                if (dialog) dialog.close();
            }
        }
    );
}

// ==================== FUNZIONI DI SUPPORTO PER LOADING ====================
function showLoadingToast(message) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return null;
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.style.position = 'relative';
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="loading-spinner" style="width: 20px; height: 20px;"></div>
            <span>${message}</span>
        </div>
    `;
    toastContainer.appendChild(toast);
    
    return toast;
}

function updateLoadingToast(toast, message) {
    if (toast && toast.querySelector('span')) {
        toast.querySelector('span').textContent = message;
    }
}

function closeLoadingToast(toast) {
    if (toast) {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }
}

// Funzione helper per log di sistema
function addSystemLog(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Opzionale: mostra anche nella console
}

function toggleEmployeesList() {
    const employeesList = document.getElementById('employeesList');
    const showBtn = document.getElementById('showEmployeesBtn');
    
    if (employeesList) {
        const isVisible = employeesList.style.display === 'block';
        employeesList.style.display = isVisible ? 'none' : 'block';
        if (showBtn) showBtn.setAttribute('aria-expanded', (!isVisible).toString());
        if (!isVisible) {
            appState.employeesPage = 1;
            loadEmployeesList();
        }
    }
}

// ==================== PAGINATION ====================
function updatePagination() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    const pageInfo = document.getElementById('pageInfo');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const paginationControls = document.getElementById('paginationControls');
    
    if (pageInfo) pageInfo.textContent = `Pagina ${appState.currentPage} di ${total || 1}`;
    if (prevPage) prevPage.disabled = appState.currentPage <= 1;
    if (nextPage) nextPage.disabled = appState.currentPage >= total;
    if (paginationControls) paginationControls.style.display = total > 1 ? 'flex' : 'none';
}

function goToPreviousPage() {
    if (appState.currentPage > 1) {
        appState.currentPage--;
        loadRequests();
    }
}

function goToNextPage() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    if (appState.currentPage < total) {
        appState.currentPage++;
        loadRequests();
    }
}

function updateEmployeesPagination() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    const pageInfo = document.getElementById('employeesPageInfo');
    const prevPage = document.getElementById('prevEmployeesPage');
    const nextPage = document.getElementById('nextEmployeesPage');
    const pagination = document.getElementById('employeesPagination');
    
    if (pageInfo) pageInfo.textContent = `Pagina ${appState.employeesPage} di ${totalPages || 1}`;
    if (prevPage) prevPage.disabled = appState.employeesPage <= 1;
    if (nextPage) nextPage.disabled = appState.employeesPage >= totalPages;
    if (pagination) pagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

function goToPrevEmployeesPage() {
    if (appState.employeesPage > 1) {
        appState.employeesPage--;
        renderEmployeesPage(); // Ricarica solo la pagina corrente (usa dati già in memoria)
        updateEmployeesPagination();
    }
}

function goToNextEmployeesPage() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    if (appState.employeesPage < totalPages) {
        appState.employeesPage++;
        renderEmployeesPage(); // Ricarica solo la pagina corrente
        updateEmployeesPagination();
    }
}
async function refreshEmployeesList() {
    const snapshot = await db.collection('users').orderBy('name').get();
    
    appState.allEmployees = [];
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.role === 'admin' && doc.id !== appState.currentUser?.uid) continue;
        appState.allEmployees.push({ id: doc.id, ...data });
    }
    
    appState.totalEmployees = appState.allEmployees.length;
    updateEmployeesPagination();
    renderEmployeesPage();
}
// ==================== FILTERS ====================
function applyFilters() {
    // Recupera i valori dei filtri
    const filterType = document.getElementById('filterType')?.value || '';
    const filterEmployee = document.getElementById('filterEmployee')?.value || '';
    const filterYear = document.getElementById('filterYear')?.value || '';
    const filterMonth = document.getElementById('filterMonth')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    
    console.log('Applicazione filtri:', { filterType, filterEmployee, filterYear, filterMonth, filterStatus });
    
    // Aggiorna lo stato
    appState.filters = {
        type: filterType,
        employee: filterEmployee,
        year: filterYear,
        month: filterMonth,
        status: filterStatus
    };
    
    appState.currentPage = 1;
    loadRequests();
    
    // Mostra feedback
    const activeFilters = [];
    if (filterType) activeFilters.push(`Tipo: ${filterType}`);
    if (filterEmployee) activeFilters.push(`Dipendente: ${filterEmployee}`);
    if (filterYear) activeFilters.push(`Anno: ${filterYear}`);
    if (filterMonth) activeFilters.push(`Mese: ${parseInt(filterMonth)}`);
    if (filterStatus) activeFilters.push(`Stato: ${filterStatus}`);
    
    if (activeFilters.length > 0) {
        showToast(`Filtri applicati: ${activeFilters.join(', ')}`, 'info');
    } else {
        showToast('Tutti i filtri rimossi', 'info');
    }
}

function resetFilters() {
    const filterType = document.getElementById('filterType');
    const filterEmployee = document.getElementById('filterEmployee');
    const filterYear = document.getElementById('filterYear');
    const filterMonth = document.getElementById('filterMonth');
    const filterStatus = document.getElementById('filterStatus');
    
    if (filterType) filterType.value = '';
    if (filterEmployee) filterEmployee.value = '';
    if (filterYear) filterYear.value = '';
    if (filterMonth) filterMonth.value = '';
    if (filterStatus) filterStatus.value = '';
    
    appState.filters = { type: '', employee: '', year: '', month: '', status: '' };
    appState.currentPage = 1;
    loadRequests();
    
    showToast('Filtri resettati', 'info');
}

// ==================== EXPORT FUNCTIONS ====================
async function exportToPDF() {
    try {
        showToast('Generazione PDF in corso...', 'info');
        
        // Mostra loading
        const exportBtn = document.getElementById('exportPDF');
        const originalText = exportBtn?.innerHTML;
        if (exportBtn) exportBtn.innerHTML = '<span class="loading-spinner"></span> Generazione...';
        
        // Recupera TUTTI i dati filtrati (non solo pagina corrente)
        const allData = await getAllFilteredRequests();
        
        if (allData.length === 0) {
            showFeedback('Info', 'Nessuna richiesta da esportare');
            if (exportBtn) exportBtn.innerHTML = originalText;
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        
        // Intestazione
        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.text('Gestione Richieste Union14', 14, 15);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const dateStr = new Date().toLocaleDateString('it-IT', { 
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        doc.text(`Data esportazione: ${dateStr}`, 14, 25);
        
        // Filtri attivi
        let filterText = getActiveFiltersText();
        if (filterText) {
            doc.setFontSize(9);
            doc.setTextColor(150, 150, 150);
            doc.text(`Filtri applicati: ${filterText}`, 14, 32);
        }
        
        // Prepara dati per tabella
        const headers = [['Tipo', 'Dipendente', 'Periodo', 'Dettagli', 'Stato', 'Data Richiesta']];
        const rows = [];
        
        allData.forEach(item => {
            rows.push([
                item.tipo,
                item.userName,
                item.periodo,
                item.dettagli.length > 40 ? item.dettagli.substring(0, 37) + '...' : item.dettagli,
                item.stato,
                item.dataRichiesta
            ]);
        });
        
        // Calcola altezza tabella
        const startY = filterText ? 38 : 32;
        
        doc.autoTable({
            head: headers,
            body: rows,
            startY: startY,
            styles: { 
                fontSize: 8,
                cellPadding: 3,
                overflow: 'linebreak'
            },
            headStyles: { 
                fillColor: [41, 128, 185],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: 10, right: 10 }
        });
        
        // Aggiungi riepilogo
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Totale richieste: ${allData.length}`, 14, finalY);
        
        // Riepilogo per stato
        const statoCount = {};
        allData.forEach(item => {
            statoCount[item.stato] = (statoCount[item.stato] || 0) + 1;
        });
        
        let summaryText = 'Riepilogo: ';
        for (const [stato, count] of Object.entries(statoCount)) {
            summaryText += `${stato}: ${count}  `;
        }
        doc.text(summaryText, 14, finalY + 7);
        
        // Salva PDF
        const filename = `richieste_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
        doc.save(filename);
        
        showToast(`PDF generato con successo (${allData.length} richieste)`, 'success');
        
        if (exportBtn) exportBtn.innerHTML = originalText;
        
    } catch (error) {
        console.error('Errore export PDF:', error);
        handleError(error, 'exportToPDF');
        const exportBtn = document.getElementById('exportPDF');
        if (exportBtn) exportBtn.innerHTML = 'Esporta in PDF';
    }
}

function exportToExcel() {
    try {
        showToast('Generazione Excel in corso...', 'info');
        
        // Raccogli TUTTI i dati dalla tabella corrente (inclusi quelli fuori pagina)
        // Usiamo la stessa funzione di getAllFilteredRequests per consistenza
        getAllFilteredRequests().then(allData => {
            if (allData.length === 0) {
                showFeedback('Info', 'Nessuna richiesta da esportare');
                return;
            }
            
            // Intestazioni CSV
            const headers = ['Tipo', 'Dipendente', 'Periodo', 'Dettagli', 'Stato', 'Data Richiesta'];
            
            // Prepara righe
            const rows = [headers];
            allData.forEach(item => {
                rows.push([
                    item.tipo,
                    item.userName,
                    item.periodo,
                    item.dettagli,
                    item.stato,
                    item.dataRichiesta
                ]);
            });
            
            // Converti in CSV
            const csv = rows.map(row => 
                row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
            ).join('\n');
            
            // Aggiungi BOM per UTF-8
            const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.href = url;
            link.download = `richieste_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast(`Esportazione completata (${allData.length} richieste)`, 'success');
        }).catch(error => {
            console.error('Errore export Excel:', error);
            handleError(error, 'exportToExcel');
        });
        
    } catch (error) {
        console.error('Errore export Excel:', error);
        handleError(error, 'exportToExcel');
    }
}

// ==================== FUNZIONE PER RECUPERARE TUTTI I DATI FILTRATI ====================
async function getAllFilteredRequests() {
    try {
        // Costruisci query base
        let query = db.collection('richieste');
        
        // Filtri Firestore (solo tipo e stato che possono essere filtrati a livello DB)
        if (appState.isAdmin) {
            if (appState.filters.type && appState.filters.type !== '') {
                query = query.where('tipo', '==', appState.filters.type);
            }
            if (appState.filters.status && appState.filters.status !== '') {
                query = query.where('stato', '==', appState.filters.status);
            }
        } else {
            query = query.where('userId', '==', appState.currentUser.uid);
        }
        
        // Ordina per data creazione
        query = query.orderBy('createdAt', 'desc');
        
        const snapshot = await query.get();
        let allDocs = snapshot.docs;
        
        // Filtri lato client
        if (appState.isAdmin && appState.filters.employee && appState.filters.employee !== '') {
            const searchTerm = sanitizeInput(appState.filters.employee).toLowerCase();
            allDocs = allDocs.filter(doc => 
                doc.data().userName?.toLowerCase().includes(searchTerm)
            );
        }
        
        // Filtro per data (anno/mese)
        if (appState.filters.year || appState.filters.month) {
            const year = appState.filters.year ? parseInt(appState.filters.year) : null;
            const month = appState.filters.month ? parseInt(appState.filters.month) : null;
            
            allDocs = allDocs.filter(doc => {
                const data = doc.data();
                
                // Permessi (singolo giorno)
                if (data.tipo === 'Permesso') {
                    const docDate = data.data?.toDate();
                    if (!docDate) return false;
                    
                    if (year && docDate.getFullYear() !== year) return false;
                    if (month && (docDate.getMonth() + 1) !== month) return false;
                    return true;
                }
                
                // Ferie e Malattia (periodi)
                const startDate = data.dataInizio?.toDate();
                const endDate = data.dataFine?.toDate();
                if (!startDate || !endDate) return false;
                
                if (!year && !month) return true;
                
                let filterStartDate, filterEndDate;
                
                if (year && month) {
                    filterStartDate = new Date(year, month - 1, 1);
                    filterEndDate = new Date(year, month, 0);
                } else if (year && !month) {
                    filterStartDate = new Date(year, 0, 1);
                    filterEndDate = new Date(year, 11, 31);
                } else {
                    return true;
                }
                
                return (startDate <= filterEndDate && endDate >= filterStartDate);
            });
        }
        
        // Converti in formato leggibile per export
        const exportData = [];
        for (const doc of allDocs) {
            const data = doc.data();
            let periodo = '', dettagli = '';
            
            switch (data.tipo) {
                case 'Ferie':
                    const start = data.dataInizio?.toDate();
                    const end = data.dataFine?.toDate();
                    periodo = `${start?.toLocaleDateString('it-IT') || 'N/D'} - ${end?.toLocaleDateString('it-IT') || 'N/D'}`;
                    dettagli = `${data.giorni || 0} giorni`;
                    break;
                case 'Malattia':
                    const malStart = data.dataInizio?.toDate();
                    const malEnd = data.dataFine?.toDate();
                    periodo = `${malStart?.toLocaleDateString('it-IT') || 'N/D'} - ${malEnd?.toLocaleDateString('it-IT') || 'N/D'}`;
                    dettagli = `Cert. n. ${data.numeroCertificato || ''}`;
                    break;
                case 'Permesso':
                    const permDate = data.data?.toDate();
                    periodo = permDate?.toLocaleDateString('it-IT') || 'N/D';
                    dettagli = `${data.oraInizio || ''} - ${data.oraFine || ''}`;
                    if (data.motivazione) dettagli += ` (${data.motivazione})`;
                    break;
            }
            
            exportData.push({
                tipo: data.tipo,
                userName: data.userName,
                periodo: periodo,
                dettagli: dettagli,
                stato: data.stato,
                dataRichiesta: data.createdAt?.toDate()?.toLocaleDateString('it-IT') || 'N/D'
            });
        }
        
        return exportData;
        
    } catch (error) {
        console.error('Errore recupero dati:', error);
        return [];
    }
}

function getActiveFiltersText() {
    const filters = [];
    if (appState.filters.type) filters.push(`Tipo: ${appState.filters.type}`);
    if (appState.filters.employee) filters.push(`Dipendente: ${appState.filters.employee}`);
    if (appState.filters.year) filters.push(`Anno: ${appState.filters.year}`);
    if (appState.filters.month) {
        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        filters.push(`Mese: ${monthNames[parseInt(appState.filters.month) - 1]}`);
    }
    if (appState.filters.status) filters.push(`Stato: ${appState.filters.status}`);
    return filters.join(', ');
}
function updateTableDataLabels() {
    const headers = document.querySelectorAll('.requests-table th');
    const headerTexts = Array.from(headers).map(th => th.textContent.trim());
    
    document.querySelectorAll('.requests-table tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            if (headerTexts[index]) {
                cell.setAttribute('data-label', headerTexts[index]);
            }
        });
    });
}
// ==================== UI SETUP ====================
function setupUI() {
    console.log('🎯 setupUI chiamata');
    
    const userData = appState.currentUserData;
    const isAdmin = appState.isAdmin;
    
    if (!userData) {
        console.error('userData non disponibile');
        return;
    }
    
    const loggedInUser = document.getElementById('loggedInUser');
    if (loggedInUser) {
        loggedInUser.textContent = `${escapeHtml(userData.name)}${isAdmin ? ' (Admin)' : ''}`;
    }
    
    const adminControls = document.getElementById('adminControls');
    if (adminControls) {
        adminControls.style.display = isAdmin ? 'block' : 'none';
        if (isAdmin) {
            addResetButtonToAdminPanel(); // Aggiungi bottone reset
        }
    }
    
    const requestForms = document.getElementById('requestForms');
    if (requestForms) {
        requestForms.style.display = isAdmin ? 'none' : 'block';
    }
    
    showPasswordSectionIfNeeded();
    
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = userData.name;
    });
    
    const loginContainer = document.getElementById('loginContainer');
    const mainContainer = document.getElementById('mainContainer');
    if (loginContainer) loginContainer.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    
    // Aggiorna display ore residue
    if (!isAdmin) {
        aggiornaDisplayOreResidue();
    }
    
    loadRequests();
    setupRealtimeListener();
    
    addAttachmentFieldToMalattiaForm();
    
    const calendarSection = document.getElementById('calendarSection');
    if (calendarSection) {
        if (isAdmin) {
            calendarSection.style.display = 'block';
            if (typeof loadCalendarData === 'function') loadCalendarData();
            if (typeof initNotifications === 'function') initNotifications();
        } else {
            calendarSection.style.display = 'none';
        }
    }
    
    // Verifica reset automatico (solo per admin all'avvio)
    if (isAdmin) {
        verificaResetAutomatico();
    }
    
    announceToScreenReader(`Accesso effettuato come ${userData.name}`);
}

function addAttachmentFieldToMalattiaForm() {
    const malattiaForm = document.getElementById('malattiaForm');
    if (!malattiaForm) return;
    
    // Evita duplicati
    if (document.getElementById('malattiaAttachment')) return;
    
    const dataCertGroup = document.querySelector('#malattiaForm .form-row:last-child');
    if (dataCertGroup) {
        const attachmentGroup = document.createElement('div');
        attachmentGroup.className = 'form-group file-upload-group';
        attachmentGroup.innerHTML = `
            <label class="form-label">Certificato Medico (PDF)</label>
            <label class="file-upload-label">
                📎 Seleziona PDF
                <input type="file" id="malattiaAttachment" class="file-upload-input" accept=".pdf" />
            </label>
            <div class="attachment-info" id="attachmentInfo"></div>
            <small class="form-help">Max 5MB, solo PDF</small>
        `;
        
        dataCertGroup.parentNode.insertBefore(attachmentGroup, dataCertGroup.nextSibling);
        
        const fileInput = document.getElementById('malattiaAttachment');
        const infoDiv = document.getElementById('attachmentInfo');
        
        if (fileInput && infoDiv) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    if (file.type === 'application/pdf' && file.size <= 5 * 1024 * 1024) {
                        infoDiv.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                        infoDiv.style.color = '#27ae60';
                    } else {
                        infoDiv.textContent = '❌ File non valido (max 5MB, PDF)';
                        infoDiv.style.color = '#e74c3c';
                        fileInput.value = '';
                    }
                } else {
                    infoDiv.textContent = '';
                }
            });
        }
    }
}

function setupRealtimeListener() {
    if (appState.realtimeListener) {
        appState.realtimeListener();
    }
    
    let query = db.collection('richieste');
    
    if (!appState.isAdmin && appState.currentUser) {
        query = query.where('userId', '==', appState.currentUser.uid);
    }
    
    appState.realtimeListener = query.onSnapshot((snapshot) => {
        if (appState.currentUser) {
            loadRequests();
        }
    }, (error) => {
        console.error("Realtime listener error:", error);
    });
}

// ==================== CALENDARIO ASSENZE ====================
async function loadCalendarData() {
    if (!appState.isAdmin) return;
    
    try {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        
        const snapshot = await db.collection('richieste')
            .where('stato', '==', 'Approvato')
            .get();
        
        allAbsences = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            if (data.tipo === 'Permesso') {
                const date = data.data?.toDate();
                if (date && date.getMonth() === month && date.getFullYear() === year) {
                    allAbsences.push({
                        date: date,
                        type: data.tipo,
                        userName: data.userName,
                        details: `${data.oraInizio}-${data.oraFine}`,
                        requestId: doc.id
                    });
                }
            } else if (data.tipo === 'Ferie' || data.tipo === 'Malattia') {
                const start = data.dataInizio?.toDate();
                const end = data.dataFine?.toDate();
                if (start && end) {
                    let current = new Date(start);
                    while (current <= end) {
                        if (current.getMonth() === month && current.getFullYear() === year) {
                            const dayOfWeek = current.getDay();
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                allAbsences.push({
                                    date: new Date(current),
                                    type: data.tipo,
                                    userName: data.userName,
                                    details: data.tipo === 'Malattia' ? 
                                        `Cert. ${data.numeroCertificato || 'N/D'}` : 
                                        `${data.giorni || 1} giorni`,
                                    requestId: doc.id,
                                    attachment: data.attachment || null
                                });
                            }
                        }
                        current.setDate(current.getDate() + 1);
                    }
                }
            }
        });
        
        renderCalendar();
        checkTodayAbsences();
        
    } catch (error) {
        console.error('Errore caricamento calendario:', error);
    }
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    
    const daysInMonth = lastDay.getDate();
    const daysFromPrevMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const currentMonthSpan = document.getElementById('currentMonthYear');
    if (currentMonthSpan) {
        currentMonthSpan.textContent = `${monthNames[month]} ${year}`;
    }
    
    const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    calendarGrid.innerHTML = weekDays.map(day => 
        `<div class="calendar-weekday">${day}</div>`
    ).join('');
    
    // Giorni mese precedente
    const prevMonthDate = new Date(year, month, 0);
    const prevMonthDays = prevMonthDate.getDate();
    for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
        const dayNum = prevMonthDays - i;
        const date = new Date(year, month - 1, dayNum);
        calendarGrid.appendChild(createCalendarDay(date, dayNum, true));
    }
    
    // Giorni mese corrente
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        calendarGrid.appendChild(createCalendarDay(date, i, false));
    }
    
    // Giorni mese successivo
    const totalCells = Math.ceil((daysFromPrevMonth + daysInMonth) / 7) * 7;
    const remainingCells = totalCells - (daysFromPrevMonth + daysInMonth);
    for (let i = 1; i <= remainingCells; i++) {
        const date = new Date(year, month + 1, i);
        calendarGrid.appendChild(createCalendarDay(date, i, true));
    }
}

function createCalendarDay(date, dayNum, isOtherMonth) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    if (isOtherMonth) dayDiv.classList.add('other-month');
    
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        dayDiv.classList.add('today');
    }
    
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = dayNum;
    dayDiv.appendChild(dayNumber);
    
    const absencesOnDay = allAbsences.filter(absence => 
        absence.date.toDateString() === date.toDateString()
    );
    
    absencesOnDay.forEach(absence => {
        const badge = document.createElement('span');
        badge.className = `absence-badge ${absence.type.toLowerCase()}`;
        badge.textContent = `${absence.userName.split(' ')[0]}`;
        badge.title = `${absence.userName} - ${absence.type}`;
        badge.onclick = (e) => {
            e.stopPropagation();
            showAbsenceDetails(date, absencesOnDay);
        };
        dayDiv.appendChild(badge);
    });
    
    dayDiv.onclick = () => {
        if (absencesOnDay.length > 0) {
            showAbsenceDetails(date, absencesOnDay);
        }
    };
    
    return dayDiv;
}

function showAbsenceDetails(date, absences) {
    const detailsDiv = document.getElementById('absenceDetails');
    const absenceList = document.getElementById('absenceList');
    
    if (!detailsDiv || !absenceList) return;
    
    absenceList.innerHTML = '';
    absences.forEach(absence => {
        const item = document.createElement('div');
        item.className = 'absence-item';
        item.innerHTML = `
            <strong>${escapeHtml(absence.userName)}</strong>
            <span class="absence-type ${absence.type.toLowerCase()}">${absence.type}</span>
            <span>${absence.details || ''}</span>
            ${absence.attachment ? 
                `<button class="btn-small download-attachment" data-attachment='${JSON.stringify(absence.attachment)}'>📎 Scarica</button>` : 
                ''}
        `;
        absenceList.appendChild(item);
    });
    
    absenceList.querySelectorAll('.download-attachment').forEach(btn => {
        btn.addEventListener('click', () => {
            const att = JSON.parse(btn.getAttribute('data-attachment'));
            if (att && att.data) {
                const link = document.createElement('a');
                link.href = att.data;
                link.download = att.name || 'certificato.pdf';
                link.click();
            }
        });
    });
    
    detailsDiv.style.display = 'block';
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    loadCalendarData();
}

function goToToday() {
    currentCalendarDate = new Date();
    loadCalendarData();
}

function initCalendarEvents() {
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
}

function checkTodayAbsences() {
    if (!appState.isAdmin) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAbsences = allAbsences.filter(absence => 
        absence.date && absence.date.toDateString() === today.toDateString()
    );
    
    if (todayAbsences.length > 0) {
        const message = `📋 Oggi ${todayAbsences.length} assenze: ${todayAbsences.map(a => a.userName).join(', ')}`;
        showToast(message, 'warning');
        announceToScreenReader(message);
        
        if (notificationsEnabled && Notification.permission === 'granted') {
            new Notification('📅 Assenze Oggi', {
                body: message,
                tag: 'daily-absences'
            });
        }
    }
}

function initNotifications() {
    if (!('Notification' in window)) return;
    
    const banner = document.getElementById('notificationPermission');
    if (!banner) return;
    
    if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        banner.style.display = 'none';
    } else if (Notification.permission !== 'denied') {
        banner.style.display = 'flex';
        
        const enableBtn = document.getElementById('enableNotifications');
        if (enableBtn) {
            enableBtn.addEventListener('click', async () => {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    notificationsEnabled = true;
                    banner.style.display = 'none';
                    showToast('Notifiche attivate!', 'success');
                }
            });
        }
    }
}

// ==================== EVENT LISTENERS ====================
function initializeEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const resetLink = document.getElementById('resetPasswordLink');
    if (resetLink) resetLink.addEventListener('click', handlePasswordReset);
    
    const ferieForm = document.getElementById('ferieForm');
    if (ferieForm) ferieForm.addEventListener('submit', handleFerieSubmit);
    
    const malattiaForm = document.getElementById('malattiaForm');
    if (malattiaForm) malattiaForm.addEventListener('submit', handleMalattiaSubmit);
    
    const permessiForm = document.getElementById('permessiForm');
    if (permessiForm) permessiForm.addEventListener('submit', handlePermessiSubmit);
    
    const exportPDF = document.getElementById('exportPDF');
    if (exportPDF) exportPDF.addEventListener('click', exportToPDF);
    
    const exportExcel = document.getElementById('exportExcel');
    if (exportExcel) exportExcel.addEventListener('click', exportToExcel);
    
    const registerBtn = document.getElementById('registerEmployeeBtn');
    if (registerBtn) registerBtn.addEventListener('click', registerEmployee);
    
    const showEmployeesBtn = document.getElementById('showEmployeesBtn');
    if (showEmployeesBtn) showEmployeesBtn.addEventListener('click', toggleEmployeesList);
    
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
    
    const resetFiltersBtn = document.getElementById('resetFilters');
    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
    
    const prevPage = document.getElementById('prevPage');
    if (prevPage) prevPage.addEventListener('click', goToPreviousPage);
    
    const nextPage = document.getElementById('nextPage');
    if (nextPage) nextPage.addEventListener('click', goToNextPage);
    
    const prevEmployeesPage = document.getElementById('prevEmployeesPage');
    if (prevEmployeesPage) prevEmployeesPage.addEventListener('click', goToPrevEmployeesPage);
    
    const nextEmployeesPage = document.getElementById('nextEmployeesPage');
    if (nextEmployeesPage) nextEmployeesPage.addEventListener('click', goToNextEmployeesPage);
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        });
    });
    
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    if (ferieDataInizio) ferieDataInizio.addEventListener('change', calcolaGiorniFerie);
    if (ferieDataFine) ferieDataFine.addEventListener('change', calcolaGiorniFerie);
    
    const filterEmployee = document.getElementById('filterEmployee');
    if (filterEmployee) {
        filterEmployee.addEventListener('input', debounce(() => {
            appState.currentPage = 1;
            applyFilters();
        }, CONSTANTS.DEBOUNCE_DELAY));
    }
    
    const today = new Date().toISOString().split('T')[0];
    ['ferieDataInizio', 'ferieDataFine', 'malattiaDataInizio', 'malattiaDataFine', 'permessiData'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });
    
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            const dialog = document.getElementById('changePasswordDialog');
            if (dialog) dialog.showModal();
        });
    }
    
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePassword);
    
    const closeChangePassword = document.getElementById('closeChangePassword');
    if (closeChangePassword) {
        closeChangePassword.addEventListener('click', () => {
            const dialog = document.getElementById('changePasswordDialog');
            if (dialog) dialog.close();
        });
    }
    const currentMonthFilter = document.getElementById('currentMonthFilter');
if (currentMonthFilter) {
    currentMonthFilter.addEventListener('click', () => {
        const now = new Date();
        const yearFilter = document.getElementById('filterYear');
        const monthFilter = document.getElementById('filterMonth');
        if (yearFilter) yearFilter.value = now.getFullYear();
        if (monthFilter) monthFilter.value = now.getMonth() + 1;
        applyFilters();
    });
}

const currentYearFilter = document.getElementById('currentYearFilter');
if (currentYearFilter) {
    currentYearFilter.addEventListener('click', () => {
        const now = new Date();
        const yearFilter = document.getElementById('filterYear');
        const monthFilter = document.getElementById('filterMonth');
        if (yearFilter) yearFilter.value = now.getFullYear();
        if (monthFilter) monthFilter.value = '';
        applyFilters();
    });
}
}

function initializeModals() {
    const confirmDialog = document.getElementById('confirmationDialog');
    const cancelAction = document.getElementById('cancelAction');
    const feedbackDialog = document.getElementById('feedbackDialog');
    const closeFeedback = document.getElementById('closeFeedback');
    
    if (confirmDialog) {
        confirmDialog.addEventListener('click', (e) => {
            if (e.target === confirmDialog) confirmDialog.close();
        });
    }
    
    if (cancelAction) {
        cancelAction.addEventListener('click', () => {
            if (confirmDialog) confirmDialog.close();
        });
    }
    
    if (feedbackDialog) {
        feedbackDialog.addEventListener('click', (e) => {
            if (e.target === feedbackDialog) feedbackDialog.close();
        });
    }
    
    if (closeFeedback) {
        closeFeedback.addEventListener('click', () => {
            if (feedbackDialog) feedbackDialog.close();
        });
    }
}

function setupFirebaseAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user && !appState.currentUser) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                
                if (userDoc.exists) {
                    appState.currentUser = user;
                    appState.currentUserData = userDoc.data();
                    appState.isAdmin = userDoc.data().role === 'admin';
                    setupUI();
                } else {
                    await auth.signOut();
                    showLogin();
                }
            } catch (error) {
                console.error("Auth state error:", error);
                await auth.signOut();
                showLogin();
            }
        } else if (!user) {
            showLogin();
        }
    });
}
// ==================== RESET AUTOMATICO ANNUALE ====================

// Funzione principale per il reset di fine anno
async function resetAnnoPerDipendente(userId, annoCorrente) {
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        
        const prossimoAnno = annoCorrente + 1;
        
        // Calcola il residuo dell'anno corrente (ore non utilizzate)
        const oreFerieAnno = userData[getFieldName('oreFerie', annoCorrente)] || CONSTANTS.ORE_FERIE_ANNUALI;
        const orePermessiAnno = userData[getFieldName('orePermessi', annoCorrente)] || CONSTANTS.ORE_PERMESSI_ANNUALI;
        const ferieUtilizzate = userData[getFieldName('oreFerieUtilizzate', annoCorrente)] || 0;
        const permessiUtilizzate = userData[getFieldName('orePermessiUtilizzate', annoCorrente)] || 0;
        
        // Residuo dell'anno corrente (può essere negativo se hanno usato più del dovuto)
        let residuoFerie = (oreFerieAnno - ferieUtilizzate);
        let residuoPermessi = (orePermessiAnno - permessiUtilizzate);
        
        // Limite massimo di ore riportabili (es. max 80 ore, opzionale)
        const MAX_CARRYOVER_FERIE = 80;  // Max 10 giorni
        const MAX_CARRYOVER_PERMESSI = 40; // Max 5 giorni
        
        const carryoverFerie = Math.min(Math.max(residuoFerie, -40), MAX_CARRYOVER_FERIE); // Min -40h, Max +80h
        const carryoverPermessi = Math.min(Math.max(residuoPermessi, -20), MAX_CARRYOVER_PERMESSI); // Min -20h, Max +40h
        
        // Prepara i dati per il nuovo anno
        const updateData = {
            // Salva il residuo come "precedenti" per il prossimo anno
            oreFeriePrecedenti: (userData.oreFeriePrecedenti || 0) + carryoverFerie,
            orePermessiPrecedenti: (userData.orePermessiPrecedenti || 0) + carryoverPermessi,
            
            // Inizializza i campi del nuovo anno
            [getFieldName('oreFerie', prossimoAnno)]: CONSTANTS.ORE_FERIE_ANNUALI,
            [getFieldName('orePermessi', prossimoAnno)]: CONSTANTS.ORE_PERMESSI_ANNUALI,
            [getFieldName('oreFerieUtilizzate', prossimoAnno)]: 0,
            [getFieldName('orePermessiUtilizzate', prossimoAnno)]: 0,
            
            // Marca l'anno corrente come archiviato
            [`${getFieldName('oreFerie', annoCorrente)}_archived`]: true,
            [`${getFieldName('orePermessi', annoCorrente)}_archived`]: true,
            
            // Data dell'ultimo reset
            lastResetAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastResetYear: annoCorrente
        };
        
        // Log del reset
        const resetLog = {
            userId: userId,
            userName: userData.name,
            anno: annoCorrente,
            prossimoAnno: prossimoAnno,
            residuoFerie: residuoFerie,
            residuoPermessi: residuoPermessi,
            carryoverFerie: carryoverFerie,
            carryoverPermessi: carryoverPermessi,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            eseguitoDa: appState.currentUser?.uid || 'system'
        };
        
        // Salva il log in una collezione separata
        await db.collection('resetLog').add(resetLog);
        
        // Aggiorna il documento utente
        await userRef.update(updateData);
        
        return {
            success: true,
            residuoFerie: residuoFerie,
            residuoPermessi: residuoPermessi,
            carryoverFerie: carryoverFerie,
            carryoverPermessi: carryoverPermessi
        };
        
    } catch (error) {
        console.error(`Errore reset anno per ${userId}:`, error);
        return { success: false, error: error.message };
    }
}

// Funzione per eseguire il reset su TUTTI i dipendenti
async function resetAnnoPerTuttiDipendenti(annoCorrente) {
    console.log(`🚀 Avvio reset annuale per l'anno ${annoCorrente}...`);
    
    const risultati = {
        totale: 0,
        successi: 0,
        errori: 0,
        dettagli: []
    };
    
    try {
        // Recupera tutti i dipendenti (non admin)
        const usersSnapshot = await db.collection('users')
            .where('role', '==', 'dipendente')
            .get();
        
        risultati.totale = usersSnapshot.size;
        
        for (const userDoc of usersSnapshot.docs) {
            const result = await resetAnnoPerDipendente(userDoc.id, annoCorrente);
            
            if (result.success) {
                risultati.successi++;
                risultati.dettagli.push({
                    nome: userDoc.data().name,
                    residuoFerie: result.residuoFerie,
                    residuoPermessi: result.residuoPermessi,
                    carryoverFerie: result.carryoverFerie,
                    carryoverPermessi: result.carryoverPermessi
                });
            } else {
                risultati.errori++;
                risultati.dettagli.push({
                    nome: userDoc.data().name,
                    errore: result.error
                });
            }
        }
        
        // Salva il log generale
        await db.collection('systemLogs').add({
            tipo: 'reset_annuale',
            anno: annoCorrente,
            risultati: risultati,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            eseguitoDa: appState.currentUser?.uid || 'system'
        });
        
        return risultati;
        
    } catch (error) {
        console.error('Errore reset generale:', error);
        throw error;
    }
}

// Funzione per verificare e eseguire automaticamente il reset a inizio anno
async function verificaResetAutomatico() {
    const oggi = new Date();
    const annoCorrente = oggi.getFullYear();
    const mese = oggi.getMonth(); // 0 = Gennaio, 11 = Dicembre
    
    // Controlla se siamo a Gennaio (mese 0) e se il reset non è stato ancora fatto
    if (mese === 0) {
        // Verifica se il reset per l'anno scorso è già stato fatto
        const resetLogs = await db.collection('systemLogs')
            .where('tipo', '==', 'reset_annuale')
            .where('anno', '==', annoCorrente - 1)
            .limit(1)
            .get();
        
        if (resetLogs.empty) {
            console.log(`🔄 Reset automatico per l'anno ${annoCorrente - 1} non eseguito. Avvio...`);
            await resetAnnoPerTuttiDipendenti(annoCorrente - 1);
            showToast(`✅ Reset annuale completato per l'anno ${annoCorrente - 1}`, 'success');
        }
    }
}

// ==================== FUNZIONI ADMIN PER RESET MANUALE ====================

// Mostra interfaccia per reset manuale
function showResetInterface() {
    const annoCorrente = getAnnoCorrente();
    const annoScorso = annoCorrente - 1;
    
    const modal = document.createElement('dialog');
    modal.id = 'resetModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>🔄 Reset Annuale Ore</h3>
            <p>Questa operazione trasferirà le ore residue dell'anno <strong>${annoScorso}</strong> nell'anno <strong>${annoCorrente}</strong>.</p>
            
            <div class="reset-info">
                <div class="info-box">
                    <strong>⚠️ Cosa succederà:</strong>
                    <ul>
                        <li>Le ore non utilizzate di ${annoScorso} verranno sommate al residuo precedente</li>
                        <li>Le ore utilizzate in eccesso (negativo) verranno sottratte</li>
                        <li>I nuovi anni avranno automaticamente 160h ferie e 103h permessi</li>
                        <li>Le richieste già approvate rimarranno invariate</li>
                    </ul>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Limite massimo riporto ferie (ore)</label>
                <input type="number" id="maxCarryoverFerie" class="form-control" value="80" step="10">
                <small>0 = nessun riporto, 80 = max 10 giorni</small>
            </div>
            
            <div class="form-group">
                <label class="form-label">Limite massimo riporto permessi (ore)</label>
                <input type="number" id="maxCarryoverPermessi" class="form-control" value="40" step="5">
                <small>0 = nessun riporto, 40 = max 5 giorni</small>
            </div>
            
            <div class="modal-actions">
                <button id="confirmResetBtn" class="btn btn-warning">🔄 Esegui Reset</button>
                <button id="cancelResetBtn" class="btn btn-secondary">Annulla</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.showModal();
    
    const confirmBtn = document.getElementById('confirmResetBtn');
    const cancelBtn = document.getElementById('cancelResetBtn');
    
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Reset in corso...';
        
        try {
            const maxFerie = parseInt(document.getElementById('maxCarryoverFerie').value) || 80;
            const maxPermessi = parseInt(document.getElementById('maxCarryoverPermessi').value) || 40;
            
            // Aggiorna costanti temporaneamente
            const originalMaxFerie = window.MAX_CARRYOVER_FERIE;
            const originalMaxPermessi = window.MAX_CARRYOVER_PERMESSI;
            window.MAX_CARRYOVER_FERIE = maxFerie;
            window.MAX_CARRYOVER_PERMESSI = maxPermessi;
            
            const risultati = await resetAnnoPerTuttiDipendenti(annoScorso);
            
            // Ripristina costanti
            window.MAX_CARRYOVER_FERIE = originalMaxFerie;
            window.MAX_CARRYOVER_PERMESSI = originalMaxPermessi;
            
            // Mostra risultati
            let message = `✅ Reset completato!\n\n`;
            message += `📊 Dipendenti processati: ${risultati.totale}\n`;
            message += `✅ Successi: ${risultati.successi}\n`;
            message += `❌ Errori: ${risultati.errori}\n\n`;
            
            if (risultati.dettagli.length > 0 && risultati.successi > 0) {
                message += `📋 Riepilogo (primi 5):\n`;
                risultati.dettagli.slice(0, 5).forEach(d => {
                    if (d.carryoverFerie !== undefined) {
                        message += `- ${d.nome}: Ferie ${d.carryoverFerie >= 0 ? '+' : ''}${d.carryoverFerie}h, Permessi ${d.carryoverPermessi >= 0 ? '+' : ''}${d.carryoverPermessi}h\n`;
                    }
                });
            }
            
            showFeedback('Reset Annuale', message, true);
            
            modal.close();
            modal.remove();
            
            // Aggiorna la tabella
            await refreshEmployeesList();
            
        } catch (error) {
            showFeedback('Errore', `Reset fallito: ${error.message}`);
        } finally {
            confirmBtn.disabled = false;
        }
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.close();
        modal.remove();
    });
}

// ==================== PANNELLO ADMIN CON BOTTONE RESET ====================

// Aggiungi questo bottone nella sezione admin (nell'HTML)
function addResetButtonToAdminPanel() {
    const adminActions = document.querySelector('.admin-actions');
    if (adminActions && !document.getElementById('resetYearBtn')) {
        const resetBtn = document.createElement('button');
        resetBtn.id = 'resetYearBtn';
        resetBtn.className = 'btn btn-warning';
        resetBtn.innerHTML = '🔄 Reset Annuale Ore';
        resetBtn.addEventListener('click', showResetInterface);
        adminActions.appendChild(resetBtn);
    }
}
// ==================== FUNZIONE PER VISUALIZZARE STORICO RESET ====================

async function showResetHistory() {
    const resetLogs = await db.collection('resetLog')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
    
    if (resetLogs.empty) {
        showFeedback('Storico Reset', 'Nessun reset effettuato');
        return;
    }
    
    let historyHtml = '<div style="max-height: 400px; overflow-y: auto;">';
    historyHtml += '<table style="width: 100%; border-collapse: collapse;">';
    historyHtml += '<tr><th>Data</th><th>Dipendente</th><th>Residuo Ferie</th><th>Riportato</th></tr>';
    
    resetLogs.forEach(doc => {
        const log = doc.data();
        const data = log.timestamp?.toDate().toLocaleDateString('it-IT') || 'N/D';
        historyHtml += `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${data}</td>
                <td style="padding: 8px;">${log.userName}</td>
                <td style="padding: 8px;">${log.residuoFerie}h</td>
                <td style="padding: 8px;">${log.carryoverFerie >= 0 ? '+' : ''}${log.carryoverFerie}h</td>
            </tr>
        `;
    });
    
    historyHtml += '</table></div>';
    
    showFeedback('📋 Storico Reset Annuale', historyHtml, true);
}
// ==================== INITIALIZATION ====================
function initializeApp() {
    console.log('🚀 Avvio applicazione...');
    
    initializeModals();
    initializeEditModal();
    setupEditDialogReset();
    initializeEventListeners();
    initPasswordToggle();
    initPasswordStrengthChecker();
    setupFirebaseAuth();
    initCalendarEvents();
    
    if (!document.getElementById('dynamic-calendar-styles')) {
        const style = document.createElement('style');
        style.id = 'dynamic-calendar-styles';
        style.textContent = `
            .btn-small.download-attachment {
                background: #4CAF50;
                color: white;
                border: none;
                padding: 2px 8px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 0.7rem;
                margin-left: 5px;
            }
            .absence-details {
                max-height: 400px;
                overflow-y: auto;
            }
        `;
        document.head.appendChild(style);
    }
    
    console.log('✅ Applicazione avviata');
}

// Avvio applicazione
document.addEventListener('DOMContentLoaded', initializeApp);
