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

// Configurazione EmailJS - DA SPOSTARE IN VARIABILI D'AMBIENTE
const EMAILJS_CONFIG = {
    // In produzione, usa: import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    publicKey: 'YOUR_PUBLIC_KEY', // Da configurare tramite variabili d'ambiente
    serviceId: 'YOUR_SERVICE_ID',
    templateId: 'YOUR_TEMPLATE_ID'
};

// ==================== COSTANTI ====================
const CONSTANTS = {
    TEMP_PASSWORD: 'union14.it', // Da modificare al primo deploy
    PASSWORD_MIN_LENGTH: 8,
    PAGE_SIZE_DEFAULT: 10,
    EMPLOYEES_PAGE_SIZE: 5,
    TOAST_DURATION: 3000,
    DEBOUNCE_DELAY: 300
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
    listeners: new Map() // Per tracciare event listener
};

// ==================== UTILITY FUNCTIONS ====================
// Sanitizzazione HTML (XSS Prevention)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sanitizzazione per input SQL/NoSQL
function sanitizeInput(input) {
    if (!input) return '';
    return String(input).trim().replace(/[<>]/g, '');
}

// Debounce per ottimizzazione performance
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

// Gestione errori centralizzata
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

// Validazione password più robusta
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

// Calcolo forza password migliorato
function checkPasswordStrength(password) {
    if (!password) return { score: 0, label: '', class: '', suggestions: [] };
    
    let score = 0;
    const suggestions = [];
    
    // Lunghezza
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length < 8) suggestions.push('Usa almeno 8 caratteri');
    
    // Lettere maiuscole
    if (/[A-Z]/.test(password)) score++;
    else suggestions.push('Aggiungi lettere maiuscole');
    
    // Lettere minuscole
    if (/[a-z]/.test(password)) score++;
    
    // Numeri
    if (/[0-9]/.test(password)) score++;
    else suggestions.push('Aggiungi numeri');
    
    // Caratteri speciali
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

// ==================== UI MANAGEMENT ====================
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

// ==================== AUTHENTICATION ====================
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email')?.value?.trim().toLowerCase() || '';
    const password = document.getElementById('password')?.value || '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Validazione
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
        
        // Login con Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Recupera dati utente
        let userDoc = await db.collection('users').doc(user.uid).get();
        
        // Se non trova, cerca per email (migrazione)
        if (!userDoc.exists) {
            const querySnapshot = await db.collection('users').where('email', '==', email).get();
            
            if (!querySnapshot.empty) {
                userDoc = querySnapshot.docs[0];
                // Migra documento
                await db.collection('users').doc(user.uid).set(userDoc.data());
                await db.collection('users').doc(userDoc.id).delete();
                userDoc = await db.collection('users').doc(user.uid).get();
            }
        }
        
        // Crea automaticamente se non esiste
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
        
        // Aggiorna stato
        appState.currentUser = user;
        appState.currentUserData = userData;
        appState.isAdmin = userData.role === 'admin';
        
        // Setup UI
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
        // Pulizia listener
        if (appState.realtimeListener) {
            appState.realtimeListener();
            appState.realtimeListener = null;
        }
        
        // Pulizia event listeners
        appState.listeners.forEach((listener, element) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(listener.event, listener.handler);
            }
        });
        appState.listeners.clear();
        
        await auth.signOut();
        
        // Reset state
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

// ==================== PASSWORD MANAGEMENT ====================
async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    // Validazioni
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
        
        // Re-autenticazione
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        
        // Aggiorna password
        await user.updatePassword(newPassword);
        
        // Aggiorna Firestore
        await db.collection('users').doc(user.uid).update({
            temporaryPassword: false,
            passwordUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            passwordVersion: firebase.firestore.FieldValue.increment(1)
        });
        
        // Aggiorna stato locale
        if (appState.currentUserData) {
            appState.currentUserData.temporaryPassword = false;
        }
        
        // Chiudi modale
        const dialog = document.getElementById('changePasswordDialog');
        if (dialog) dialog.close();
        
        showFeedback('Successo', 'Password cambiata con successo!');
        showToast('Password aggiornata!', 'success');
        
        // Nascondi sezione password temporanea
        const passwordSection = document.getElementById('passwordSection');
        if (passwordSection) {
            passwordSection.style.display = 'none';
        }
        
        // Resetta form
        e.target.reset();
        const strengthEl = document.getElementById('passwordStrength');
        if (strengthEl) {
            strengthEl.textContent = '';
            strengthEl.className = 'password-strength';
        }
        
    } catch (error) {
        console.error('Change password error:', error);
        
        let errorMessage = 'Errore durante il cambio password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Password attuale non corretta';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La nuova password è troppo debole';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Per sicurezza, effettua di nuovo il login prima di cambiare password';
            setTimeout(() => handleLogout(), 3000);
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
            
            let message = `Forza password: ${strength.label}`;
            if (strength.suggestions.length > 0 && strength.label === 'Debole') {
                message += ` - ${strength.suggestions[0]}`;
            }
            
            strengthEl.textContent = message;
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
        if (shouldShow) {
            passwordSection.style.display = 'block';
            announceToScreenReader('Attenzione: la tua password è temporanea. Cambiala per maggiore sicurezza.');
            showToast('⚠️ Password temporanea! Cambiala subito.', 'warning');
        } else {
            passwordSection.style.display = 'none';
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
    
    richiesteBody.innerHTML = `
        <tr><td colspan="6" class="text-center">
            <div class="loading-spinner"></div> Caricamento...
        </td></tr>
    `;
    
    try {
        let query = db.collection('richieste');
        
        // Filtri per non-admin
        if (!appState.isAdmin && appState.currentUser) {
            query = query.where('userId', '==', appState.currentUser.uid);
        } else if (appState.isAdmin) {
            // Filtri admin
            if (appState.filters.type) {
                query = query.where('tipo', '==', appState.filters.type);
            }
            if (appState.filters.status) {
                query = query.where('stato', '==', appState.filters.status);
            }
        }
        
        // Filtri temporali
        if (appState.filters.year || appState.filters.month) {
            const year = appState.filters.year ? parseInt(appState.filters.year) : new Date().getFullYear();
            const month = appState.filters.month ? parseInt(appState.filters.month) - 1 : 0;
            const startDate = new Date(year, month, 1);
            const endDate = appState.filters.month ? new Date(year, month + 1, 1) : new Date(year + 1, 0, 1);
            const dateField = appState.filters.type === 'Permesso' ? 'data' : 'dataInizio';
            
            query = query
                .orderBy(dateField, 'desc')
                .where(dateField, '>=', startDate)
                .where(dateField, '<', endDate);
        } else {
            query = query.orderBy('createdAt', 'desc');
        }
        
        const snapshot = await query.get();
        let docs = snapshot.docs;
        
        // Filtro per dipendente (lato client)
        if (appState.isAdmin && appState.filters.employee) {
            const searchTerm = sanitizeInput(appState.filters.employee).toLowerCase();
            docs = docs.filter(doc => 
                doc.data().userName?.toLowerCase().includes(searchTerm)
            );
        }
        
        appState.totalRequests = docs.length;
        updatePagination();
        
        const start = (appState.currentPage - 1) * appState.pageSize;
        const paginated = docs.slice(start, start + appState.pageSize);
        renderRequests(paginated);
        
    } catch (error) {
        handleError(error, 'loadRequests');
        richiesteBody.innerHTML = `
            <tr><td colspan="6" class="error text-center">
                Errore nel caricamento delle richieste
            </td></tr>
        `;
    }
}

function renderRequestsWithAttachments(docs) {
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
                periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
                dettagli = `${data.giorni} giorni`;
                break;
            case 'Malattia':
                periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
                dettagli = `Cert. n. ${escapeHtml(data.numeroCertificato || '')}`;
                if (data.attachment) {
                    dettagli += ` <button class="btn-small download-attachment" data-attachment='${JSON.stringify(data.attachment)}'>📎 Scarica PDF</button>`;
                }
                break;
            case 'Permesso':
                periodo = formatDate(data.data);
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
        
        // Listener per download allegati
        const downloadBtn = row.querySelector('.download-attachment');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const attachmentData = JSON.parse(downloadBtn.getAttribute('data-attachment'));
                if (attachmentData && attachmentData.data) {
                    const link = document.createElement('a');
                    link.href = attachmentData.data;
                    link.download = attachmentData.name || 'certificato.pdf';
                    link.click();
                }
            });
        }
        
        attachRequestEventListeners(row, doc.id, data);
        richiesteBody.appendChild(row);
    });
}


// Funzione helper per renderizzare le azioni
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

// Funzione helper per attaccare gli event listeners
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
                showConfirmation(
                    'Elimina Richiesta',
                    'Sei sicuro di voler eliminare questa richiesta? L\'operazione è irreversibile.',
                    () => deleteRequest(requestId)
                );
            });
        }
    } else {
        const editBtn = row.querySelector('.edit-request');
        if (editBtn) {
            // Clona per rimuovere eventuali listener esistenti
            const newEditBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newEditBtn, editBtn);
            
            newEditBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const requestIdAttr = newEditBtn.getAttribute('data-id');
                if (requestIdAttr) {
                    console.log('🖱️ Click modifica per richiesta:', requestIdAttr);
                    editRequest(requestIdAttr);
                }
            });
        }
    }
}
    



// CORREZIONE: Aggiungi questa funzione completa (sostituisci quella esistente)
function initializeEditModal() {
    const editDialog = document.getElementById('editRequestDialog');
    const editForm = document.getElementById('editRequestForm');
    const closeBtn = document.getElementById('closeEditRequest');
    
    console.log('🔧 Inizializzazione modal modifica...');
    
    if (editForm) {
        // Rimuovi eventuali listener esistenti per evitare duplicati
        editForm.removeEventListener('submit', handleEditRequestSubmit);
        editForm.addEventListener('submit', handleEditRequestSubmit);
        console.log('✅ Event listener form aggiunto');
    } else {
        console.error('❌ Form editRequestForm non trovato');
    }
    
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeEditModal);
        closeBtn.addEventListener('click', closeEditModal);
        console.log('✅ Event listener close aggiunto');
    }
    
    if (editDialog) {
        editDialog.removeEventListener('click', closeEditModalOnClickOutside);
        editDialog.addEventListener('click', closeEditModalOnClickOutside);
        console.log('✅ Event listener dialog aggiunto');
    }
}

// Assicurati che resetEditForm sia definita
function resetEditForm() {
    const form = document.getElementById('editRequestForm');
    if (form) {
        form.reset();
        console.log('🔄 Form modifica resettato');
    }
    
    // Resetta campi specifici
    const editFerieGiorni = document.getElementById('editFerieGiorni');
    if (editFerieGiorni) editFerieGiorni.value = '';
    
    // Nascondi tutti i campi
    document.querySelectorAll('.edit-fields').forEach(field => {
        field.style.display = 'none';
    });
    
    // Nascondi messaggio informativo
    const infoMessage = document.getElementById('editInfoMessage');
    if (infoMessage) infoMessage.style.display = 'none';
}
// Funzione di debug per verificare lo stato del modal
function debugEditModal() {
    console.log('🔍 DEBUG MODALE MODIFICA:');
    
    const dialog = document.getElementById('editRequestDialog');
    const form = document.getElementById('editRequestForm');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    
    console.log('- Dialog esiste:', !!dialog);
    console.log('- Form esiste:', !!form);
    console.log('- Submit button esiste:', !!submitBtn);
    console.log('- Dialog visibile:', dialog ? dialog.open : false);
    
    if (form) {
        console.log('- Form ha event listener?', form._listeners || 'non tracciato');
    }
    
    return { dialog, form, submitBtn };
}

// Esponi per debug in console
window.debugEditModal = debugEditModal;
function closeEditModal() {
    const dialog = document.getElementById('editRequestDialog');
    if (dialog) dialog.close();
    console.log('🔒 Modale chiuso');
}

function closeEditModalOnClickOutside(e) {
    const dialog = document.getElementById('editRequestDialog');
    if (e.target === dialog) {
        dialog.close();
        console.log('🔒 Modale chiuso (click outside)');
    }
}
function resetEditForm() {
    const form = document.getElementById('editRequestForm');
    if (form) form.reset();
    
    // Resetta campi specifici
    const editFerieGiorni = document.getElementById('editFerieGiorni');
    if (editFerieGiorni) editFerieGiorni.value = '';
    
    console.log('🔄 Form modifica resettato');
}
// Assicurati che il dialog venga resettato quando viene aperto
function setupEditDialogReset() {
    const dialog = document.getElementById('editRequestDialog');
    if (dialog) {
        dialog.addEventListener('close', () => {
            resetEditForm();
        });
    }
}
async function updateRequestStatus(requestId, newStatus) {
    try {
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser?.uid
        });
        
        showFeedback('Successo', `Stato aggiornato a "${newStatus}"`);
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'updateRequestStatus');
    }
}

async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata con successo');
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'deleteRequest');
    }
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
    
    // Validazioni
    if (dataInizio < oggi) {
        showFeedback('Errore', 'Non puoi richiedere ferie per date passate');
        return;
    }
    
    if (dataFine < dataInizio) {
        showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
        return;
    }
    
    const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
    if (giorni <= 0) {
        showFeedback('Errore', 'Nessun giorno lavorativo nel periodo selezionato');
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
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('ferieForm').reset();
        showFeedback('Successo', `Richiesta ferie inviata! ${giorni} giorni richiesti.`);
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
        if (attachmentFile) {
            try {
                attachmentData = await uploadAttachment(attachmentFile, 'Malattia');
                showToast('Certificato caricato con successo', 'success');
            } catch (uploadError) {
                showFeedback('Errore', uploadError.message);
                setLoadingState(submitBtn, false);
                return;
            }
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
        showFeedback('Successo', 'Richiesta malattia inviata con successo!');
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'handleMalattiaSubmit');
    } finally {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

// Aggiungi campo file al form malattia nell'HTML (aggiungi dopo data certificato)
function addAttachmentFieldToMalattiaForm() {
    const malattiaForm = document.getElementById('malattiaForm');
    if (!malattiaForm) return;
    
    const dataCertGroup = document.querySelector('#malattiaForm .form-row:last-child');
    if (dataCertGroup && !document.getElementById('malattiaAttachment')) {
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
                    infoDiv.textContent = `📄 ${e.target.files[0].name} (${(e.target.files[0].size / 1024).toFixed(1)} KB)`;
                    infoDiv.style.color = '#27ae60';
                } else {
                    infoDiv.textContent = '';
                }
            });
        }
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
    
    try {
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            data: firebase.firestore.Timestamp.fromDate(data),
            oraInizio: oraInizio,
            oraFine: oraFine,
            motivazione: sanitizeInput(motivazione) || '',
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('permessiForm').reset();
        showFeedback('Successo', 'Richiesta permesso inviata con successo!');
        await loadRequests();
        
    } catch (error) {
        handleError(error, 'handlePermessiSubmit');
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
        
        // Crea utente Firebase
        const userCredential = await auth.createUserWithEmailAndPassword(email, CONSTANTS.TEMP_PASSWORD);
        
        // Aggiorna profilo
        await userCredential.user.updateProfile({ displayName: name.trim() });
        
        // Crea documento Firestore
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
        
        showFeedback(
            'Successo',
            `✅ Dipendente registrato con successo!<br><br>` +
            `📧 Email: ${escapeHtml(email)}<br>` +
            `🔑 Password temporanea: ${CONSTANTS.TEMP_PASSWORD}<br><br>` +
            `⚠️ Il dipendente dovrà cambiare password al primo accesso.`,
            true
        );
        
        // Ricarica lista se visibile
        const employeesList = document.getElementById('employeesList');
        if (employeesList?.style.display === 'block') {
            await loadEmployeesList();
        }
        
    } catch (error) {
        console.error('Register error:', error);
        
        let errorMessage = '';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Questa email è già registrata. Usa un\'altra email o recupera l\'account esistente.';
        } else if (error.code === 'permission-denied') {
            errorMessage = 'Errore di permessi. Verifica le regole di sicurezza Firestore.';
        } else {
            errorMessage = error.message;
        }
        
        showFeedback('Errore', errorMessage);
    } finally {
        const submitBtn = document.getElementById('registerEmployeeBtn');
        setLoadingState(submitBtn, false);
    }
}

async function loadEmployeesList() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    // Skeleton loading
    employeesBody.innerHTML = `
        <tr><td colspan="6">
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
        </td></tr>
    `;
    
    try {
        const snapshot = await db.collection('users')
            .orderBy('name')
            .get();
        
        appState.allEmployees = [];
        snapshot.forEach(doc => {
            appState.allEmployees.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        appState.totalEmployees = appState.allEmployees.length;
        updateEmployeesPagination();
        renderEmployeesPage();
        
    } catch (error) {
        handleError(error, 'loadEmployeesList');
        employeesBody.innerHTML = `
             hilab<td colspan="6" class="error text-center">
                Errore nel caricamento dei dipendenti
             </td></tr>
        `;
    }
}

function renderEmployeesPage() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    const start = (appState.employeesPage - 1) * appState.employeesPageSize;
    const end = start + appState.employeesPageSize;
    const pageEmployees = appState.allEmployees.slice(start, end);
    
    employeesBody.innerHTML = '';
    
    if (pageEmployees.length === 0) {
        employeesBody.innerHTML = `
            <tr><td colspan="6" class="text-center">Nessun dipendente trovato</td></tr>
        `;
        return;
    }
    
    pageEmployees.forEach(employee => {
        const createdAt = employee.createdAt?.toDate ? employee.createdAt.toDate() : new Date();
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === employee.id;
        
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
            <td data-label="Data Registrazione">${createdAt.toLocaleDateString('it-IT')}</td>
            <td data-label="Stato Password">
                ${employee.temporaryPassword ? 
                    '<span class="status-badge rifiutato">⚠️ Temporanea</span>' : 
                    '<span class="status-badge approvato">✓ Definitiva</span>'}
            </td>
            <td data-label="Azioni" class="actions-cell">
                ${!isCurrentUser ? `
                    <button class="btn-small reset-password" data-email="${escapeHtml(employee.email)}" data-name="${escapeHtml(employee.name)}">
                        🔄 Reset Password
                    </button>
                    <button class="btn-small btn-danger delete-employee" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}">
                        🗑️ Elimina
                    </button>
                ` : '<span class="text-muted">(Utente corrente)</span>'}
            </td>
        `;
        
        if (!isCurrentUser) {
            const roleSelect = row.querySelector('.role-select');
            const resetBtn = row.querySelector('.reset-password');
            const deleteBtn = row.querySelector('.delete-employee');
            
            if (roleSelect) {
                roleSelect.addEventListener('change', () => {
                    updateEmployeeRole(employee.id, roleSelect.value);
                });
            }
            
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    const email = resetBtn.getAttribute('data-email');
                    if (email) resetEmployeePassword(email);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    const name = deleteBtn.getAttribute('data-name');
                    deleteEmployee(employee.id, name);
                });
            }
        }
        
        employeesBody.appendChild(row);
    });
}

async function updateEmployeeRole(userId, newRole) {
    showConfirmation(
        'Cambio Ruolo',
        `Sei sicuro di voler cambiare il ruolo a "${newRole}"?`,
        async () => {
            try {
                await db.collection('users').doc(userId).update({
                    role: newRole,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: appState.currentUser?.uid
                });
                
                showFeedback('Successo', 'Ruolo aggiornato con successo!');
                await loadEmployeesList();
                
                // Aggiorna UI se è l'utente corrente
                if (appState.currentUser && appState.currentUser.uid === userId) {
                    appState.currentUserData.role = newRole;
                    appState.isAdmin = newRole === 'admin';
                    setupUI();
                }
                
            } catch (error) {
                handleError(error, 'updateEmployeeRole');
            }
        }
    );
}

async function resetEmployeePassword(email) {
    if (!email) {
        showFeedback('Errore', 'Email non valida');
        return;
    }
    
    showConfirmation(
        'Reset Password',
        `⚠️ RESET PASSWORD ⚠️\n\n` +
        `Dipendente: ${email}\n\n` +
        `La nuova password temporanea sarà: ${CONSTANTS.TEMP_PASSWORD}\n\n` +
        `Il dipendente dovrà cambiarla al prossimo accesso.\n\n` +
        `Procedere?`,
        async () => {
            try {
                // Invia email di reset Firebase
                await auth.sendPasswordResetEmail(email);
                
                // Aggiorna Firestore
                const usersSnapshot = await db.collection('users').where('email', '==', email).get();
                
                if (!usersSnapshot.empty) {
                    const userDoc = usersSnapshot.docs[0];
                    await db.collection('users').doc(userDoc.id).update({
                        temporaryPassword: true,
                        passwordResetAt: firebase.firestore.FieldValue.serverTimestamp(),
                        passwordResetBy: appState.currentUser?.email,
                        passwordResetByName: appState.currentUserData?.name
                    });
                }
                
                showFeedback(
                    '✅ Reset Password Inviato',
                    `Email di reset inviata a: ${email}\n\n` +
                    `🔑 PASSWORD TEMPORANEA: ${CONSTANTS.TEMP_PASSWORD}\n\n` +
                    `📌 ISTRUZIONI:\n` +
                    `1. Controlla l'email (anche nello spam)\n` +
                    `2. Clicca sul link ricevuto\n` +
                    `3. Usa la password temporanea\n` +
                    `4. Imposta una nuova password personale`,
                    true
                );
                
                // Ricarica lista
                setTimeout(() => {
                    if (document.getElementById('employeesList')?.style.display === 'block') {
                        loadEmployeesList();
                    }
                }, 1500);
                
            } catch (error) {
                handleError(error, 'resetEmployeePassword');
            }
        }
    );
}

async function deleteEmployee(userId, name) {
    showConfirmation(
        'Elimina Dipendente',
        `⚠️ OPERAZIONE IRREVERSIBILE ⚠️\n\n` +
        `Stai per eliminare: ${name}\n\n` +
        `Tutte le richieste associate verranno eliminate definitivamente.\n\n` +
        `Sei assolutamente sicuro?`,
        async () => {
            try {
                // Elimina tutte le richieste del dipendente
                const requests = await db.collection('richieste').where('userId', '==', userId).get();
                const batch = db.batch();
                
                requests.forEach(doc => batch.delete(doc.ref));
                batch.delete(db.collection('users').doc(userId));
                
                await batch.commit();
                
                showFeedback('Successo', `Dipendente "${name}" eliminato con successo`);
                await loadEmployeesList();
                
            } catch (error) {
                handleError(error, 'deleteEmployee');
            }
        }
    );
}

function toggleEmployeesList() {
    const employeesList = document.getElementById('employeesList');
    const showBtn = document.getElementById('showEmployeesBtn');
    
    if (!employeesList) return;
    
    const isVisible = employeesList.style.display === 'block';
    employeesList.style.display = isVisible ? 'none' : 'block';
    
    if (showBtn) {
        showBtn.setAttribute('aria-expanded', (!isVisible).toString());
    }
    
    if (!isVisible) {
        appState.employeesPage = 1;
        loadEmployeesList();
    }
}

// ==================== PAGINATION ====================
function updatePagination() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    const pageInfo = document.getElementById('pageInfo');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const paginationControls = document.getElementById('paginationControls');
    
    if (pageInfo) {
        pageInfo.textContent = `Pagina ${appState.currentPage} di ${total || 1}`;
    }
    
    if (prevPage) prevPage.disabled = appState.currentPage <= 1;
    if (nextPage) nextPage.disabled = appState.currentPage >= total;
    if (paginationControls) {
        paginationControls.style.display = total > 1 ? 'flex' : 'none';
    }
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
    
    if (pageInfo) {
        pageInfo.textContent = `Pagina ${appState.employeesPage} di ${totalPages || 1}`;
    }
    
    if (prevPage) prevPage.disabled = appState.employeesPage <= 1;
    if (nextPage) nextPage.disabled = appState.employeesPage >= totalPages;
    
    if (pagination) {
        pagination.style.display = totalPages > 1 ? 'flex' : 'none';
    }
}

function goToPrevEmployeesPage() {
    if (appState.employeesPage > 1) {
        appState.employeesPage--;
        renderEmployeesPage();
        updateEmployeesPagination();
        
        const employeesList = document.getElementById('employeesList');
        employeesList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function goToNextEmployeesPage() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    if (appState.employeesPage < totalPages) {
        appState.employeesPage++;
        renderEmployeesPage();
        updateEmployeesPagination();
        
        const employeesList = document.getElementById('employeesList');
        employeesList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ==================== FILTERS ====================
function applyFilters() {
    appState.filters = {
        type: document.getElementById('filterType')?.value || '',
        employee: sanitizeInput(document.getElementById('filterEmployee')?.value || ''),
        year: document.getElementById('filterYear')?.value || '',
        month: document.getElementById('filterMonth')?.value || '',
        status: document.getElementById('filterStatus')?.value || ''
    };
    appState.currentPage = 1;
    loadRequests();
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
}

// ==================== EXPORT FUNCTIONS ====================
function exportToPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text('Elenco Richieste', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 14, 25);
        
        const headers = [["Tipo", "Dipendente", "Periodo", "Dettagli", "Stato"]];
        const rows = [];
        
        document.querySelectorAll('#richiesteBody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5 && !cells[0].textContent.includes('Nessuna')) {
                rows.push([
                    cells[0].textContent,
                    cells[1].textContent,
                    cells[2].textContent,
                    cells[3].textContent,
                    cells[4].textContent
                ]);
            }
        });
        
        if (rows.length === 0) {
            showFeedback('Info', 'Nessuna richiesta da esportare');
            return;
        }
        
        doc.autoTable({
            head: headers,
            body: rows,
            startY: 30,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [66, 133, 244] }
        });
        
        doc.save(`richieste_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF generato con successo', 'success');
        
    } catch (error) {
        handleError(error, 'exportToPDF');
    }
}

function exportToExcel() {
    try {
        const rows = [['Tipo', 'Dipendente', 'Periodo', 'Dettagli', 'Stato']];
        
        document.querySelectorAll('#richiesteBody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 5 && !cells[0].textContent.includes('Nessuna')) {
                rows.push([
                    cells[0].textContent,
                    cells[1].textContent,
                    cells[2].textContent,
                    cells[3].textContent,
                    cells[4].textContent
                ]);
            }
        });
        
        if (rows.length === 1) {
            showFeedback('Info', 'Nessuna richiesta da esportare');
            return;
        }
        
        const csv = rows.map(r => 
            r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.href = url;
        link.download = `richieste_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('Esportazione completata con successo', 'success');
        
    } catch (error) {
        handleError(error, 'exportToExcel');
    }
}

// ==================== UI SETUP ====================
function setupUIWithCalendar() {
    setupUI(); // Chiama la funzione originale
    
    const calendarSection = document.getElementById('calendarSection');
    if (calendarSection && appState.isAdmin) {
        calendarSection.style.display = 'block';
        loadCalendarData();
        initNotifications();
    } else if (calendarSection) {
        calendarSection.style.display = 'none';
    }
    
    addAttachmentFieldToMalattiaForm();
}

// Aggiungi event listener per calendario
function initCalendarEvents() {
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
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
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const data = change.doc.data();
                const oldData = change.doc.data();
                
                if (oldData.stato !== data.stato) {
                    const message = `La richiesta ${data.tipo} è stata ${data.stato.toLowerCase()}`;
                    announceToScreenReader(message);
                    showToast(message, data.stato === 'Approvato' ? 'success' : 
                                   data.stato === 'Rifiutato' ? 'error' : 'info');
                }
            }
        });
        
        if (appState.currentUser) {
            loadRequests();
        }
    }, (error) => {
        console.error("Realtime listener error:", error);
    });
}

// ==================== EVENT LISTENERS ====================
function initializeEventListeners() {
    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Password reset
    const resetLink = document.getElementById('resetPasswordLink');
    if (resetLink) {
        resetLink.addEventListener('click', handlePasswordReset);
    }
    
    // Forms richieste
    const ferieForm = document.getElementById('ferieForm');
    if (ferieForm) ferieForm.addEventListener('submit', handleFerieSubmit);
    
    const malattiaForm = document.getElementById('malattiaForm');
    if (malattiaForm) malattiaForm.addEventListener('submit', handleMalattiaSubmit);
    
    const permessiForm = document.getElementById('permessiForm');
    if (permessiForm) permessiForm.addEventListener('submit', handlePermessiSubmit);
    
    // Export
    const exportPDF = document.getElementById('exportPDF');
    if (exportPDF) exportPDF.addEventListener('click', exportToPDF);
    
    const exportExcel = document.getElementById('exportExcel');
    if (exportExcel) exportExcel.addEventListener('click', exportToExcel);
    
    // Admin
    const registerBtn = document.getElementById('registerEmployeeBtn');
    if (registerBtn) registerBtn.addEventListener('click', registerEmployee);
    
    const showEmployeesBtn = document.getElementById('showEmployeesBtn');
    if (showEmployeesBtn) showEmployeesBtn.addEventListener('click', toggleEmployeesList);
    
    // Filtri
    const applyFiltersBtn = document.getElementById('applyFilters');
    if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
    
    const resetFiltersBtn = document.getElementById('resetFilters');
    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
    
    // Paginazione
    const prevPage = document.getElementById('prevPage');
    if (prevPage) prevPage.addEventListener('click', goToPreviousPage);
    
    const nextPage = document.getElementById('nextPage');
    if (nextPage) nextPage.addEventListener('click', goToNextPage);
    
    const prevEmployeesPage = document.getElementById('prevEmployeesPage');
    if (prevEmployeesPage) prevEmployeesPage.addEventListener('click', goToPrevEmployeesPage);
    
    const nextEmployeesPage = document.getElementById('nextEmployeesPage');
    if (nextEmployeesPage) nextEmployeesPage.addEventListener('click', goToNextEmployeesPage);
    
    // Tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', handleTabSwitch);
    });
    
    // Calcolo giorni ferie
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    if (ferieDataInizio) ferieDataInizio.addEventListener('change', calcolaGiorniFerie);
    if (ferieDataFine) ferieDataFine.addEventListener('change', calcolaGiorniFerie);
    
    // Filtro dipendente con debounce
    const filterEmployee = document.getElementById('filterEmployee');
    if (filterEmployee) {
        filterEmployee.addEventListener('input', debounce(() => {
            appState.currentPage = 1;
            applyFilters();
        }, CONSTANTS.DEBOUNCE_DELAY));
    }
    
    // Set date minime
    const today = new Date().toISOString().split('T')[0];
    ['ferieDataInizio', 'ferieDataFine', 'malattiaDataInizio', 'malattiaDataFine', 'permessiData'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });
    
    // Cambio password
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            const dialog = document.getElementById('changePasswordDialog');
            if (dialog) {
                const form = document.getElementById('changePasswordForm');
                if (form) form.reset();
                dialog.showModal();
            }
        });
    }
    
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }
    
    const closeChangePassword = document.getElementById('closeChangePassword');
    if (closeChangePassword) {
        closeChangePassword.addEventListener('click', () => {
            const dialog = document.getElementById('changePasswordDialog');
            if (dialog) dialog.close();
        });
    }
    
    // Chiusura modali click outside
    const changePasswordDialog = document.getElementById('changePasswordDialog');
    if (changePasswordDialog) {
        changePasswordDialog.addEventListener('click', (e) => {
            if (e.target === changePasswordDialog) {
                changePasswordDialog.close();
            }
        });
    }
    // Aggiungi listener per la modifica delle date nel modal di modifica
    const editFerieInizio = document.getElementById('editFerieDataInizio');
    const editFerieFine = document.getElementById('editFerieDataFine');
    
    if (editFerieInizio && editFerieFine) {
        const updateDays = () => {
            if (editFerieInizio.value && editFerieFine.value) {
                const giorni = calcolaGiorniLavorativi(editFerieInizio.value, editFerieFine.value);
                const giorniInput = document.getElementById('editFerieGiorni');
                if (giorniInput) giorniInput.value = giorni;
            }
        };
        editFerieInizio.addEventListener('change', updateDays);
        editFerieFine.addEventListener('change', updateDays);
    }
}

function handleTabSwitch(e) {
    const tabId = this.dataset.tab;
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    this.classList.add('active');
    this.setAttribute('aria-selected', 'true');
    
    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');
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
// ==================== EDIT REQUEST FUNCTIONS ====================

// Variabile globale per tracciare se il form è inizializzato
let editFormInitialized = false;

async function editRequest(requestId) {
    console.log('🎯 Avvio modifica richiesta:', requestId);
    
    // Verifica che requestId sia valido
    if (!requestId) {
        console.error('❌ RequestId non valido');
        showFeedback('Errore', 'ID richiesta non valido');
        return;
    }
    
    try {
        // Recupera i dati della richiesta
        const doc = await db.collection('richieste').doc(requestId).get();
        
        if (!doc.exists) {
            console.error('❌ Richiesta non trovata:', requestId);
            showFeedback('Errore', 'Richiesta non trovata');
            return;
        }
        
        const data = doc.data();
        console.log('📋 Dati richiesta:', data);
        
        // Verifica che l'utente sia il proprietario
        if (data.userId !== appState.currentUser.uid) {
            console.error('❌ Utente non autorizzato');
            showFeedback('Errore', 'Non hai i permessi per modificare questa richiesta');
            return;
        }
        
        // Verifica che la richiesta sia in attesa
        if (data.stato !== 'In attesa') {
            console.error('❌ Richiesta non in attesa:', data.stato);
            showFeedback('Errore', 'Puoi modificare solo richieste in stato "In attesa"');
            return;
        }
        
        // IMPORTANTE: Imposta l'ID nel campo hidden PRIMA di tutto
        const editRequestIdInput = document.getElementById('editRequestId');
        const editRequestTypeInput = document.getElementById('editRequestType');
        
        if (!editRequestIdInput) {
            console.error('❌ Campo editRequestId non trovato nel DOM');
            showFeedback('Errore', 'Errore tecnico: campo ID non trovato');
            return;
        }
        
        if (!editRequestTypeInput) {
            console.error('❌ Campo editRequestType non trovato nel DOM');
            showFeedback('Errore', 'Errore tecnico: campo tipo non trovato');
            return;
        }
        
        // Imposta i valori
        editRequestIdInput.value = requestId;
        editRequestTypeInput.value = data.tipo;
        
        console.log('✅ ID richiesta impostato:', editRequestIdInput.value);
        console.log('✅ Tipo richiesta impostato:', editRequestTypeInput.value);
        
        // Rimuovi tutti gli attributi required
        removeRequiredAttributes();
        
        // Nascondi tutti i campi
        document.querySelectorAll('.edit-fields').forEach(field => {
            field.style.display = 'none';
        });
        
        // Mostra il messaggio informativo
        const infoMessage = document.getElementById('editInfoMessage');
        if (infoMessage) infoMessage.style.display = 'block';
        
        // Popola i campi in base al tipo
        if (data.tipo === 'Ferie') {
            console.log('📅 Modifica Ferie');
            const ferieFields = document.getElementById('editFerieFields');
            if (ferieFields) {
                ferieFields.style.display = 'block';
                addRequiredToVisibleFields('ferie');
            }
            
            const dataInizio = data.dataInizio?.toDate ? data.dataInizio.toDate() : new Date(data.dataInizio);
            const dataFine = data.dataFine?.toDate ? data.dataFine.toDate() : new Date(data.dataFine);
            
            const inizioInput = document.getElementById('editFerieDataInizio');
            const fineInput = document.getElementById('editFerieDataFine');
            const giorniInput = document.getElementById('editFerieGiorni');
            
            if (inizioInput) inizioInput.value = dataInizio.toISOString().split('T')[0];
            if (fineInput) fineInput.value = dataFine.toISOString().split('T')[0];
            if (giorniInput) giorniInput.value = data.giorni || 0;
            
            // Aggiorna giorni quando cambiano le date
            const updateDays = () => {
                if (inizioInput && inizioInput.value && fineInput && fineInput.value) {
                    const giorni = calcolaGiorniLavorativi(inizioInput.value, fineInput.value);
                    if (giorniInput) giorniInput.value = giorni;
                }
            };
            
            if (inizioInput) {
                inizioInput.removeEventListener('change', updateDays);
                inizioInput.addEventListener('change', updateDays);
            }
            if (fineInput) {
                fineInput.removeEventListener('change', updateDays);
                fineInput.addEventListener('change', updateDays);
            }
            
        } else if (data.tipo === 'Malattia') {
            console.log('🏥 Modifica Malattia');
            const malattiaFields = document.getElementById('editMalattiaFields');
            if (malattiaFields) {
                malattiaFields.style.display = 'block';
                addRequiredToVisibleFields('malattia');
            }
            
            const dataInizio = data.dataInizio?.toDate ? data.dataInizio.toDate() : new Date(data.dataInizio);
            const dataFine = data.dataFine?.toDate ? data.dataFine.toDate() : new Date(data.dataFine);
            const dataCertificato = data.dataCertificato?.toDate ? data.dataCertificato.toDate() : new Date(data.dataCertificato);
            
            const inizioInput = document.getElementById('editMalattiaDataInizio');
            const fineInput = document.getElementById('editMalattiaDataFine');
            const numeroInput = document.getElementById('editMalattiaNumeroCertificato');
            const dataCertInput = document.getElementById('editMalattiaDataCertificato');
            
            if (inizioInput) inizioInput.value = dataInizio.toISOString().split('T')[0];
            if (fineInput) fineInput.value = dataFine.toISOString().split('T')[0];
            if (numeroInput) numeroInput.value = data.numeroCertificato || '';
            if (dataCertInput) dataCertInput.value = dataCertificato.toISOString().split('T')[0];
            
        } else if (data.tipo === 'Permesso') {
            console.log('⏰ Modifica Permesso');
            const permessiFields = document.getElementById('editPermessiFields');
            if (permessiFields) {
                permessiFields.style.display = 'block';
                addRequiredToVisibleFields('permesso');
            }
            
            const dataPermesso = data.data?.toDate ? data.data.toDate() : new Date(data.data);
            
            const dataInput = document.getElementById('editPermessiData');
            const oraInizioInput = document.getElementById('editPermessiOraInizio');
            const oraFineInput = document.getElementById('editPermessiOraFine');
            const motivazioneInput = document.getElementById('editPermessiMotivazione');
            
            if (dataInput) dataInput.value = dataPermesso.toISOString().split('T')[0];
            if (oraInizioInput) oraInizioInput.value = data.oraInizio || '';
            if (oraFineInput) oraFineInput.value = data.oraFine || '';
            if (motivazioneInput) motivazioneInput.value = data.motivazione || '';
        }
        
        // Mostra il dialog
        const dialog = document.getElementById('editRequestDialog');
        if (dialog) {
            // Verifica che l'ID sia stato impostato prima di aprire
            console.log('🔍 Verifica finale - editRequestId.value:', document.getElementById('editRequestId').value);
            dialog.showModal();
            console.log('✅ Dialog modifica aperto');
        } else {
            console.error('❌ Dialog editRequestDialog non trovato');
        }
        
    } catch (error) {
        console.error('❌ Errore nel caricamento della richiesta:', error);
        showFeedback('Errore', 'Impossibile caricare la richiesta da modificare: ' + error.message);
    }
}

// Funzione per rimuovere tutti gli attributi required
function removeRequiredAttributes() {
    const allInputs = document.querySelectorAll('#editRequestForm input, #editRequestForm select, #editRequestForm textarea');
    allInputs.forEach(input => {
        input.removeAttribute('required');
    });
}

// Funzione per aggiungere required solo ai campi visibili
function addRequiredToVisibleFields(type) {
    const requiredFields = {
        ferie: ['editFerieDataInizio', 'editFerieDataFine'],
        malattia: ['editMalattiaDataInizio', 'editMalattiaDataFine', 'editMalattiaNumeroCertificato', 'editMalattiaDataCertificato'],
        permesso: ['editPermessiData', 'editPermessiOraInizio', 'editPermessiOraFine']
    };
    
    const fieldsToRequire = requiredFields[type] || [];
    fieldsToRequire.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.setAttribute('required', 'required');
        }
    });
}
async function handleEditRequestSubmit(e) {
    e.preventDefault();
    
    console.log('📝 Submit modifica richiesta - INIZIO');
    
    // Recupera l'ID dal campo hidden
    const editRequestIdInput = document.getElementById('editRequestId');
    const requestId = editRequestIdInput ? editRequestIdInput.value : null;
    const requestType = document.getElementById('editRequestType')?.value;
    
    console.log('🔍 Valori recuperati:');
    console.log('- editRequestId element:', editRequestIdInput);
    console.log('- requestId value:', requestId);
    console.log('- requestType:', requestType);
    
    if (!requestId) {
        console.error('❌ ID richiesta non valido - valore vuoto');
        showFeedback('Errore', 'ID richiesta non valido. Prova a ricaricare la pagina.');
        return;
    }
    
    if (!requestType) {
        console.error('❌ Tipo richiesta non valido');
        showFeedback('Errore', 'Tipo richiesta non valido');
        return;
    }
    
    // Validazione manuale dei campi visibili
    const visibleFields = document.querySelectorAll('#editRequestForm .edit-fields[style*="display: block"] input, #editRequestForm .edit-fields[style*="display: block"] select, #editRequestForm .edit-fields[style*="display: block"] textarea');
    let isValid = true;
    let firstInvalid = null;
    
    visibleFields.forEach(field => {
        if (field.hasAttribute('required') && !field.value.trim()) {
            isValid = false;
            if (!firstInvalid) firstInvalid = field;
            field.classList.add('invalid');
        } else {
            field.classList.remove('invalid');
        }
    });
    
    if (!isValid) {
        showFeedback('Errore', 'Compila tutti i campi obbligatori');
        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        let updateData = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser.uid,
            updatedByName: appState.currentUserData.name
        };
        
        // Raccogli i dati in base al tipo
        if (requestType === 'Ferie') {
            const inizioInput = document.getElementById('editFerieDataInizio');
            const fineInput = document.getElementById('editFerieDataFine');
            
            if (!inizioInput || !fineInput) {
                throw new Error('Campi non trovati');
            }
            
            const dataInizio = new Date(inizioInput.value);
            const dataFine = new Date(fineInput.value);
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            if (isNaN(dataInizio.getTime()) || isNaN(dataFine.getTime())) {
                showFeedback('Errore', 'Date non valide');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataInizio < oggi) {
                showFeedback('Errore', 'Non puoi modificare con date passate');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
            if (giorni <= 0) {
                showFeedback('Errore', 'Nessun giorno lavorativo nel periodo');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
                dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
                giorni: giorni,
                stato: 'In attesa'
            };
            
        } else if (requestType === 'Malattia') {
            const inizioInput = document.getElementById('editMalattiaDataInizio');
            const fineInput = document.getElementById('editMalattiaDataFine');
            const numeroInput = document.getElementById('editMalattiaNumeroCertificato');
            const dataCertInput = document.getElementById('editMalattiaDataCertificato');
            
            if (!inizioInput || !fineInput || !numeroInput || !dataCertInput) {
                throw new Error('Campi non trovati');
            }
            
            const dataInizio = new Date(inizioInput.value);
            const dataFine = new Date(fineInput.value);
            const numeroCertificato = numeroInput.value.trim();
            const dataCertificato = new Date(dataCertInput.value);
            
            if (isNaN(dataInizio.getTime()) || isNaN(dataFine.getTime()) || isNaN(dataCertificato.getTime())) {
                showFeedback('Errore', 'Date non valide');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (!numeroCertificato) {
                showFeedback('Errore', 'Il numero del certificato è obbligatorio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
                dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
                numeroCertificato: sanitizeInput(numeroCertificato),
                dataCertificato: firebase.firestore.Timestamp.fromDate(dataCertificato),
                stato: 'In attesa'
            };
            
        } else if (requestType === 'Permesso') {
            const dataInput = document.getElementById('editPermessiData');
            const oraInizioInput = document.getElementById('editPermessiOraInizio');
            const oraFineInput = document.getElementById('editPermessiOraFine');
            const motivazioneInput = document.getElementById('editPermessiMotivazione');
            
            if (!dataInput || !oraInizioInput || !oraFineInput) {
                throw new Error('Campi non trovati');
            }
            
            const data = new Date(dataInput.value);
            const oraInizio = oraInizioInput.value;
            const oraFine = oraFineInput.value;
            const motivazione = motivazioneInput ? motivazioneInput.value.trim() : '';
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            if (isNaN(data.getTime())) {
                showFeedback('Errore', 'Data non valida');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (data < oggi) {
                showFeedback('Errore', 'Non puoi modificare con una data passata');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (!oraInizio || !oraFine) {
                showFeedback('Errore', 'Le ore di inizio e fine sono obbligatorie');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (oraInizio >= oraFine) {
                showFeedback('Errore', 'L\'ora di fine deve essere successiva all\'ora di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                data: firebase.firestore.Timestamp.fromDate(data),
                oraInizio: oraInizio,
                oraFine: oraFine,
                motivazione: sanitizeInput(motivazione) || '',
                stato: 'In attesa'
            };
        }
        
        console.log('💾 Aggiornamento richiesta:', requestId, updateData);
        
        // Aggiorna la richiesta nel database
        await db.collection('richieste').doc(requestId).update(updateData);
        
        // Chiudi il dialog
        const dialog = document.getElementById('editRequestDialog');
        if (dialog) dialog.close();
        
        showFeedback('Successo', '✅ Richiesta modificata con successo!');
        showToast('Richiesta aggiornata e tornata in stato "In attesa"', 'success');
        
        // Resetta il form
        resetEditForm();
        
        // Ricarica la lista delle richieste
        await loadRequests();
        
        console.log('✅ Modifica completata con successo');
        
    } catch (error) {
        console.error('❌ Errore nella modifica:', error);
        showFeedback('Errore', 'Errore durante la modifica della richiesta: ' + error.message);
    } finally {
        const submitBtn = document.querySelector('#editRequestForm button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

// Funzione per resettare il form
function resetEditForm() {
    const form = document.getElementById('editRequestForm');
    if (form) form.reset();
    
    // Rimuovi required da tutti i campi
    removeRequiredAttributes();
    
    // Nascondi tutti i campi
    document.querySelectorAll('.edit-fields').forEach(field => {
        field.style.display = 'none';
    });
    
    // Nascondi messaggio informativo
    const infoMessage = document.getElementById('editInfoMessage');
    if (infoMessage) infoMessage.style.display = 'none';
    
    // Rimuovi classe invalid
    document.querySelectorAll('.invalid').forEach(field => {
        field.classList.remove('invalid');
    });
}
// CORREZIONE: Migliora la funzione handleEditRequestSubmit
async function handleEditRequestSubmit(e) {
    e.preventDefault();
    
    console.log('📝 Submit modifica richiesta - INIZIO');
    
    const requestId = document.getElementById('editRequestId').value;
    const requestType = document.getElementById('editRequestType').value;
    
    console.log('Request ID:', requestId);
    console.log('Request Type:', requestType);
    
    if (!requestId) {
        showFeedback('Errore', 'ID richiesta non valido');
        return;
    }
    
    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        let updateData = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser.uid,
            updatedByName: appState.currentUserData.name
        };
        
        // Raccogli i dati in base al tipo
        if (requestType === 'Ferie') {
            const inizioInput = document.getElementById('editFerieDataInizio');
            const fineInput = document.getElementById('editFerieDataFine');
            
            if (!inizioInput || !fineInput) {
                throw new Error('Campi non trovati');
            }
            
            const dataInizio = new Date(inizioInput.value);
            const dataFine = new Date(fineInput.value);
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            // Validazioni
            if (isNaN(dataInizio.getTime()) || isNaN(dataFine.getTime())) {
                showFeedback('Errore', 'Date non valide');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataInizio < oggi) {
                showFeedback('Errore', 'Non puoi modificare con date passate');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
            if (giorni <= 0) {
                showFeedback('Errore', 'Nessun giorno lavorativo nel periodo');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
                dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
                giorni: giorni,
                stato: 'In attesa'
            };
            
            console.log('📅 Aggiornamento Ferie:', updateData);
            
        } else if (requestType === 'Malattia') {
            const inizioInput = document.getElementById('editMalattiaDataInizio');
            const fineInput = document.getElementById('editMalattiaDataFine');
            const numeroInput = document.getElementById('editMalattiaNumeroCertificato');
            const dataCertInput = document.getElementById('editMalattiaDataCertificato');
            
            if (!inizioInput || !fineInput || !numeroInput || !dataCertInput) {
                throw new Error('Campi non trovati');
            }
            
            const dataInizio = new Date(inizioInput.value);
            const dataFine = new Date(fineInput.value);
            const numeroCertificato = numeroInput.value.trim();
            const dataCertificato = new Date(dataCertInput.value);
            
            if (isNaN(dataInizio.getTime()) || isNaN(dataFine.getTime()) || isNaN(dataCertificato.getTime())) {
                showFeedback('Errore', 'Date non valide');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (dataFine < dataInizio) {
                showFeedback('Errore', 'La data di fine non può essere precedente alla data di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (!numeroCertificato) {
                showFeedback('Errore', 'Il numero del certificato è obbligatorio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                dataInizio: firebase.firestore.Timestamp.fromDate(dataInizio),
                dataFine: firebase.firestore.Timestamp.fromDate(dataFine),
                numeroCertificato: sanitizeInput(numeroCertificato),
                dataCertificato: firebase.firestore.Timestamp.fromDate(dataCertificato),
                stato: 'In attesa'
            };
            
            console.log('🏥 Aggiornamento Malattia:', updateData);
            
        } else if (requestType === 'Permesso') {
            const dataInput = document.getElementById('editPermessiData');
            const oraInizioInput = document.getElementById('editPermessiOraInizio');
            const oraFineInput = document.getElementById('editPermessiOraFine');
            const motivazioneInput = document.getElementById('editPermessiMotivazione');
            
            if (!dataInput || !oraInizioInput || !oraFineInput) {
                throw new Error('Campi non trovati');
            }
            
            const data = new Date(dataInput.value);
            const oraInizio = oraInizioInput.value;
            const oraFine = oraFineInput.value;
            const motivazione = motivazioneInput ? motivazioneInput.value.trim() : '';
            const oggi = new Date();
            oggi.setHours(0, 0, 0);
            
            if (isNaN(data.getTime())) {
                showFeedback('Errore', 'Data non valida');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (data < oggi) {
                showFeedback('Errore', 'Non puoi modificare con una data passata');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (!oraInizio || !oraFine) {
                showFeedback('Errore', 'Le ore di inizio e fine sono obbligatorie');
                setLoadingState(submitBtn, false);
                return;
            }
            
            if (oraInizio >= oraFine) {
                showFeedback('Errore', 'L\'ora di fine deve essere successiva all\'ora di inizio');
                setLoadingState(submitBtn, false);
                return;
            }
            
            updateData = {
                ...updateData,
                data: firebase.firestore.Timestamp.fromDate(data),
                oraInizio: oraInizio,
                oraFine: oraFine,
                motivazione: sanitizeInput(motivazione) || '',
                stato: 'In attesa'
            };
            
            console.log('⏰ Aggiornamento Permesso:', updateData);
        }
        
        // Aggiorna la richiesta nel database
        console.log('💾 Salvataggio modifiche per richiesta:', requestId);
        await db.collection('richieste').doc(requestId).update(updateData);
        
        // Chiudi il dialog
        const dialog = document.getElementById('editRequestDialog');
        if (dialog) dialog.close();
        
        showFeedback('Successo', '✅ Richiesta modificata con successo!');
        showToast('Richiesta aggiornata e tornata in stato "In attesa"', 'success');
        
        // Ricarica la lista delle richieste
        await loadRequests();
        
        console.log('✅ Modifica completata con successo');
        
    } catch (error) {
        console.error('❌ Errore nella modifica:', error);
        showFeedback('Errore', 'Errore durante la modifica della richiesta: ' + error.message);
    } finally {
        const submitBtn = document.querySelector('#editRequestForm button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}
function highlightEditedRequest(requestId) {
    // Trova la riga nella tabella e aggiungi una classe di evidenziazione
    const rows = document.querySelectorAll('#richiesteBody tr');
    for (let row of rows) {
        const saveBtn = row.querySelector(`[data-id="${requestId}"]`);
        if (saveBtn || row.textContent.includes(requestId)) {
            row.classList.add('request-edited');
            setTimeout(() => {
                row.classList.remove('request-edited');
            }, 1000);
            break;
        }
    }
}
// ==================== CALENDARIO ASSENZE ====================
let currentCalendarDate = new Date();
let allAbsences = [];

async function loadCalendarData() {
    if (!appState.isAdmin) return;
    
    try {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 1);
        
        const snapshot = await db.collection('richieste')
            .where('stato', '==', 'Approvato')
            .get();
        
        allAbsences = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let absenceDays = [];
            
            if (data.tipo === 'Permesso') {
                const date = data.data?.toDate();
                if (date && date >= startDate && date < endDate) {
                    absenceDays.push({
                        date: date,
                        type: data.tipo,
                        userName: data.userName,
                        details: `${data.oraInizio}-${data.oraFine}`,
                        requestId: doc.id
                    });
                }
            } else {
                const start = data.dataInizio?.toDate();
                const end = data.dataFine?.toDate();
                if (start && end && end >= startDate && start < endDate) {
                    let current = new Date(Math.max(start, startDate));
                    const endLimit = new Date(Math.min(end, new Date(endDate - 1)));
                    
                    while (current <= endLimit) {
                        const dayOfWeek = current.getDay();
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            absenceDays.push({
                                date: new Date(current),
                                type: data.tipo,
                                userName: data.userName,
                                details: data.tipo === 'Malattia' ? 
                                    `Cert. ${data.numeroCertificato || 'N/D'}` : 
                                    `${data.giorni || 1} giorni`,
                                requestId: doc.id,
                                attachment: data.attachmentUrl || null
                            });
                        }
                        current.setDate(current.getDate() + 1);
                    }
                }
            }
            
            allAbsences.push(...absenceDays);
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
    
    // Aggiorna titolo mese
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const currentMonthSpan = document.getElementById('currentMonthYear');
    if (currentMonthSpan) {
        currentMonthSpan.textContent = `${monthNames[month]} ${year}`;
    }
    
    // Crea intestazione giorni
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
    
    // Aggiungi badge assenze
    const absencesOnDay = allAbsences.filter(absence => 
        absence.date.toDateString() === date.toDateString()
    );
    
    absencesOnDay.forEach(absence => {
        const badge = document.createElement('span');
        badge.className = `absence-badge ${absence.type.toLowerCase()}`;
        badge.textContent = `${absence.userName.split(' ')[0]}`;
        badge.title = `${absence.userName} - ${absence.type}${absence.details ? ` (${absence.details})` : ''}`;
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
                `<button class="btn-small download-attachment" data-url="${absence.attachment}">📎 Scarica Certificato</button>` : 
                ''}
        `;
        absenceList.appendChild(item);
    });
    
    // Aggiungi listener per download allegati
    absenceList.querySelectorAll('.download-attachment').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-url');
            if (url) window.open(url, '_blank');
        });
    });
    
    detailsDiv.style.display = 'block';
    detailsDiv.scrollIntoView({ behavior: 'smooth' });
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    loadCalendarData();
}

function goToToday() {
    currentCalendarDate = new Date();
    loadCalendarData();
}

// ==================== NOTIFICHE ASSENZE ====================
let notificationsEnabled = false;

async function checkTodayAbsences() {
    if (!appState.isAdmin) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAbsences = allAbsences.filter(absence => 
        absence.date.toDateString() === today.toDateString()
    );
    
    if (todayAbsences.length > 0) {
        const message = `📋 Oggi ci sono ${todayAbsences.length} assenze: ${todayAbsences.map(a => a.userName).join(', ')}`;
        
        // Mostra alert visivo
        showToast(message, 'warning');
        announceToScreenReader(message);
        
        // Notifica desktop
        if (notificationsEnabled && Notification.permission === 'granted') {
            new Notification('📅 Assenze Oggi', {
                body: message,
                icon: '/favicon.ico',
                tag: 'daily-absences'
            });
        }
        
        // Invia email notifica (opzionale - richiede EmailJS configurato)
        await sendAbsenceNotificationEmail(todayAbsences);
    }
}

async function sendAbsenceNotificationEmail(absences) {
    // Solo se EmailJS è configurato
    if (typeof emailjs === 'undefined' || EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY') {
        console.log('EmailJS non configurato - notifica email saltata');
        return;
    }
    
    try {
        const adminEmail = appState.currentUser?.email;
        if (!adminEmail) return;
        
        const absenceList = absences.map(a => 
            `- ${a.userName}: ${a.type}${a.details ? ` (${a.details})` : ''}`
        ).join('\n');
        
        const templateParams = {
            to_email: adminEmail,
            subject: `📅 Notifica Assenze - ${new Date().toLocaleDateString('it-IT')}`,
            message: `Sono state rilevate le seguenti assenze per oggi:\n\n${absenceList}\n\nAccedi al sistema per maggiori dettagli.`,
            date: new Date().toLocaleString('it-IT')
        };
        
        await emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            templateParams,
            EMAILJS_CONFIG.publicKey
        );
        
        console.log('Email notifica inviata');
    } catch (error) {
        console.error('Errore invio email notifica:', error);
    }
}

function initNotifications() {
    if (!('Notification' in window)) {
        console.log('Questo browser non supporta le notifiche');
        return;
    }
    
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
                    showToast('Notifiche attivate! Riceverai avvisi sulle assenze', 'success');
                }
            });
        }
    }
}

// ==================== ALLEGATI CERTIFICATI ====================
async function uploadAttachment(file, requestType) {
    if (requestType !== 'Malattia') return null;
    
    return new Promise((resolve, reject) => {
        if (!file || file.type !== 'application/pdf') {
            reject(new Error('Solo file PDF sono supportati'));
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            reject(new Error('Il file non può superare i 5MB'));
            return;
        }
        
        // Usa FileReader per convertire in base64 (alternativa a storage)
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve({
                name: file.name,
                data: e.target.result,
                size: file.size,
                type: file.type,
                uploadDate: new Date().toISOString()
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==================== INITIALIZATION ====================
function initializeAppWithFeatures() {
    // Chiama initializeApp originale
    if (typeof initializeApp === 'function') {
        initializeApp();
    } else {
        initializeModals();
        initializeEditModal();
        setupEditDialogReset();
        initializeEventListeners();
        initPasswordToggle();
        initPasswordStrengthChecker();
        setupFirebaseAuth();
    }
    
    // Aggiungi nuove funzionalità
    initCalendarEvents();
    
    // Override setupUI
    const originalSetupUI = window.setupUI;
    window.setupUI = setupUIWithCalendar;
    
    // Override renderRequests
    window.renderRequests = renderRequestsWithAttachments;
    
    // Override handleMalattiaSubmit
    window.handleMalattiaSubmit = handleMalattiaSubmit;
    
    // Aggiungi stili dinamici
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
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
        .btn-small.download-attachment:hover {
            background: #45a049;
        }
    `;
    document.head.appendChild(style);
}

// Avvio applicazione con nuove funzionalità
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppWithFeatures);
} else {
    initializeAppWithFeatures();
}

// Avvio applicazione
document.addEventListener('DOMContentLoaded', initializeApp);

