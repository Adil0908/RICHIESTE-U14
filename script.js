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
    listeners: new Map()
};

// ==================== VARIABILI CALENDARIO ====================
let currentCalendarDate = new Date();
let allAbsences = [];
let notificationsEnabled = false;

// ==================== UTILITY FUNCTIONS ====================
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
        let query = db.collection('richieste');
        
        if (!appState.isAdmin && appState.currentUser) {
            query = query.where('userId', '==', appState.currentUser.uid);
        } else if (appState.isAdmin) {
            if (appState.filters.type) {
                query = query.where('tipo', '==', appState.filters.type);
            }
            if (appState.filters.status) {
                query = query.where('stato', '==', appState.filters.status);
            }
        }
        
        if (appState.filters.year || appState.filters.month) {
            const year = appState.filters.year ? parseInt(appState.filters.year) : new Date().getFullYear();
            const month = appState.filters.month ? parseInt(appState.filters.month) - 1 : 0;
            const startDate = new Date(year, month, 1);
            const endDate = appState.filters.month ? new Date(year, month + 1, 1) : new Date(year + 1, 0, 1);
            const dateField = appState.filters.type === 'Permesso' ? 'data' : 'dataInizio';
            
            query = query.orderBy(dateField, 'desc').where(dateField, '>=', startDate).where(dateField, '<', endDate);
        } else {
            query = query.orderBy('createdAt', 'desc');
        }
        
        const snapshot = await query.get();
        let docs = snapshot.docs;
        
        if (appState.isAdmin && appState.filters.employee) {
            const searchTerm = sanitizeInput(appState.filters.employee).toLowerCase();
            docs = docs.filter(doc => doc.data().userName?.toLowerCase().includes(searchTerm));
        }
        
        appState.totalRequests = docs.length;
        updatePagination();
        
        const start = (appState.currentPage - 1) * appState.pageSize;
        const paginated = docs.slice(start, start + appState.pageSize);
        renderRequests(paginated);
        
    } catch (error) {
        handleError(error, 'loadRequests');
        richiesteBody.innerHTML = `<tr><td colspan="6" class="error text-center">Errore nel caricamento delle richieste</td></tr>`;
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
        
        const downloadBtn = row.querySelector('.download-attachment');
        if (downloadBtn && data.attachment && data.attachment.data) {
            downloadBtn.addEventListener('click', () => {
                const attachmentData = data.attachment;
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
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: appState.currentUser?.uid
        });
        
        showFeedback('Successo', `Stato aggiornato a "${newStatus}"`);
        await loadRequests();
        if (appState.isAdmin && typeof loadCalendarData === 'function') loadCalendarData();
    } catch (error) {
        handleError(error, 'updateRequestStatus');
    }
}

async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata con successo');
        await loadRequests();
        if (appState.isAdmin && typeof loadCalendarData === 'function') loadCalendarData();
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
        
        showFeedback('Successo', `✅ Dipendente registrato!<br><br>📧 Email: ${escapeHtml(email)}<br>🔑 Password: ${CONSTANTS.TEMPASSWORD}`, true);
        
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
    
    employeesBody.innerHTML = `<tr><td colspan="6">Caricamento...</td></tr>`;
    
    try {
        const snapshot = await db.collection('users').orderBy('name').get();
        
        appState.allEmployees = [];
        snapshot.forEach(doc => {
            appState.allEmployees.push({ id: doc.id, ...doc.data() });
        });
        
        appState.totalEmployees = appState.allEmployees.length;
        updateEmployeesPagination();
        renderEmployeesPage();
        
    } catch (error) {
        handleError(error, 'loadEmployeesList');
        employeesBody.innerHTML = `<tr><td colspan="6" class="error">Errore nel caricamento</td></tr>`;
    }
}

function renderEmployeesPage() {
    const employeesBody = document.getElementById('employeesBody');
    if (!employeesBody) return;
    
    const start = (appState.employeesPage - 1) * appState.employeesPageSize;
    const pageEmployees = appState.allEmployees.slice(start, start + appState.employeesPageSize);
    
    employeesBody.innerHTML = '';
    
    if (pageEmployees.length === 0) {
        employeesBody.innerHTML = `<tr><td colspan="6" class="text-center">Nessun dipendente trovato</td></tr>`;
        return;
    }
    
    pageEmployees.forEach(employee => {
        const createdAt = employee.createdAt?.toDate ? employee.createdAt.toDate() : new Date();
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === employee.id;
        
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
            <td>${createdAt.toLocaleDateString('it-IT')}</td>
            <td>${employee.temporaryPassword ? '<span class="status-badge rifiutato">⚠️ Temporanea</span>' : '<span class="status-badge approvato">✓ Definitiva</span>'}</td>
            <td class="actions-cell">
                ${!isCurrentUser ? `
                    <button class="btn-small reset-password" data-email="${escapeHtml(employee.email)}">🔄 Reset</button>
                    <button class="btn-small btn-danger delete-employee" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}">🗑️</button>
                ` : '<span class="text-muted">Utente corrente</span>'}
            </td>
        `;
        
        if (!isCurrentUser) {
            const roleSelect = row.querySelector('.role-select');
            const resetBtn = row.querySelector('.reset-password');
            const deleteBtn = row.querySelector('.delete-employee');
            
            if (roleSelect) {
                roleSelect.addEventListener('change', () => updateEmployeeRole(employee.id, roleSelect.value));
            }
            if (resetBtn) {
                resetBtn.addEventListener('click', () => resetEmployeePassword(resetBtn.getAttribute('data-email')));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => deleteEmployee(employee.id, deleteBtn.getAttribute('data-name')));
            }
        }
        
        employeesBody.appendChild(row);
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

async function deleteEmployee(userId, name) {
    showConfirmation('Elimina Dipendente', `Eliminare ${name} e tutte le sue richieste?`, async () => {
        try {
            const requests = await db.collection('richieste').where('userId', '==', userId).get();
            const batch = db.batch();
            requests.forEach(doc => batch.delete(doc.ref));
            batch.delete(db.collection('users').doc(userId));
            await batch.commit();
            showFeedback('Successo', `Dipendente eliminato`);
            await loadEmployeesList();
        } catch (error) {
            handleError(error, 'deleteEmployee');
        }
    });
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
        renderEmployeesPage();
        updateEmployeesPagination();
    }
}

function goToNextEmployeesPage() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    if (appState.employeesPage < totalPages) {
        appState.employeesPage++;
        renderEmployeesPage();
        updateEmployeesPagination();
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
        
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.href = url;
        link.download = `richieste_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('Esportazione completata', 'success');
    } catch (error) {
        handleError(error, 'exportToExcel');
    }
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
    
    loadRequests();
    setupRealtimeListener();
    
    // Aggiungi campo allegato al form malattia
    addAttachmentFieldToMalattiaForm();
    
    // Mostra calendario per admin
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
