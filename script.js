// Configurazione Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAVlSo3W578ClzYE4z2qLQfaNaDIk41USI",
    authDomain: "richieste-u14.firebaseapp.com",
    projectId: "richieste-u14",
    storageBucket: "richieste-u14.appspot.com",
    messagingSenderId: "219335255474",
    appId: "1:219335255474:web:b2c411230db39031bf30ab",
    measurementId: "G-0ZP39RC7HL"
};

// Inizializza Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Stato applicazione centrale
const appState = {
    currentUser: null,
    userRole: null,
    userData: null,
    filters: {
        type: '',
        employee: '',
        year: '',
        month: '',
        status: ''
    },
    isLoading: false,
    currentPage: 1,
    pageSize: 10,
    totalRequests: 0,
    realtimeListener: null
};

// Festività italiane
const FESTIVITA_ITALIANE = [
    '01-01', '01-06', '04-25', '05-01', '06-02',
    '08-15', '11-01', '12-08', '12-25', '12-26'
];

// Elementi UI
const elements = {
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    ferieForm: document.getElementById('ferieForm'),
    malattiaForm: document.getElementById('malattiaForm'),
    permessiForm: document.getElementById('permessiForm'),
    loginContainer: document.getElementById('loginContainer'),
    mainContainer: document.getElementById('mainContainer'),
    richiesteDiv: document.getElementById('richiesteInviate'),
    adminControls: document.getElementById('adminControls'),
    requestForms: document.getElementById('requestForms'),
    adminFilters: document.getElementById('adminFilters'),
    employeesList: document.getElementById('employeesList'),
    logoutBtn: document.getElementById('logoutBtn'),
    registerLink: document.getElementById('registerLink'),
    loginLink: document.getElementById('loginLink'),
    resetPasswordLink: document.getElementById('resetPasswordLink'),
    exportPDF: document.getElementById('exportPDF'),
    exportExcel: document.getElementById('exportExcel'),
    registerEmployeeBtn: document.getElementById('registerEmployeeBtn'),
    showEmployeesBtn: document.getElementById('showEmployeesBtn'),
    applyFilters: document.getElementById('applyFilters'),
    resetFilters: document.getElementById('resetFilters'),
    richiesteBody: document.getElementById('richiesteBody'),
    employeesBody: document.getElementById('employeesBody'),
    loginError: document.getElementById('loginError'),
    loggedInUser: document.getElementById('loggedInUser'),
    confirmationDialog: document.getElementById('confirmationDialog'),
    feedbackDialog: document.getElementById('feedbackDialog'),
    paginationControls: document.getElementById('paginationControls'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    srAnnouncement: document.getElementById('srAnnouncement')
};

// ========== FUNZIONI DI UTILITY ==========
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function calcolaGiorniLavorativi(dataInizio, dataFine) {
    let giorniLavorativi = 0;
    const dataCorrente = new Date(dataInizio);
    const fine = new Date(dataFine);
    
    dataCorrente.setHours(0, 0, 0, 0);
    fine.setHours(0, 0, 0, 0);
    
    while (dataCorrente <= fine) {
        const giornoSettimana = dataCorrente.getDay();
        const dataKey = `${String(dataCorrente.getMonth() + 1).padStart(2, '0')}-${String(dataCorrente.getDate()).padStart(2, '0')}`;
        const isWeekend = giornoSettimana === 0 || giornoSettimana === 6;
        const isFestivita = FESTIVITA_ITALIANE.includes(dataKey);
        
        if (!isWeekend && !isFestivita) giorniLavorativi++;
        dataCorrente.setDate(dataCorrente.getDate() + 1);
    }
    return giorniLavorativi;
}

function calcolaGiorni() {
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    const ferieGiorni = document.getElementById('ferieGiorni');
    const giorniHelp = document.getElementById('ferieGiorniHelp');
    
    if (ferieDataInizio?.value && ferieDataFine?.value) {
        const inizio = new Date(ferieDataInizio.value);
        const fine = new Date(ferieDataFine.value);
        
        if (fine < inizio) {
            showFeedback('Errore', "La data di fine non può essere precedente alla data di inizio");
            ferieDataFine.value = '';
            ferieGiorni.value = '';
            return;
        }
        
        const giorniLavorativi = calcolaGiorniLavorativi(inizio, fine);
        ferieGiorni.value = giorniLavorativi;
        
        if (giorniHelp) {
            const giorniTotali = Math.ceil((fine - inizio) / (1000 * 60 * 60 * 24)) + 1;
            giorniHelp.textContent = `${giorniLavorativi} giorni lavorativi (esclusi ${giorniTotali - giorniLavorativi} giorni di weekend/festività)`;
        }
    }
}

async function checkOverlappingRequests(userId, type, startDate, endDate) {
    try {
        const snapshot = await db.collection('richieste')
            .where('userId', '==', userId)
            .where('stato', '==', 'Approvato')
            .get();
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.dataInizio && data.dataFine) {
                const existingStart = data.dataInizio.toDate();
                const existingEnd = data.dataFine.toDate();
                if (startDate <= existingEnd && endDate >= existingStart) {
                    return { overlapping: true, existingRequest: data };
                }
            }
        }
        return { overlapping: false };
    } catch (error) {
        console.error("Errore controllo sovrapposizioni:", error);
        return { overlapping: false };
    }
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function getAuthErrorMessage(error) {
    const errors = {
        'auth/invalid-email': 'Email non valida',
        'auth/user-disabled': 'Account disabilitato',
        'auth/user-not-found': 'Utente non trovato',
        'auth/wrong-password': 'Password errata',
        'auth/email-already-in-use': 'Email già registrata',
        'auth/weak-password': 'Password troppo debole (minimo 6 caratteri)',
        'auth/network-request-failed': 'Errore di rete. Controlla la connessione',
        'auth/invalid-login-credentials': 'Email o password non validi'
    };
    return errors[error.code] || `Errore: ${error.message}`;
}

// ========== GESTIONE STATI UI ==========
function setLoadingState(element, isLoading) {
    if (!element) return;
    if (isLoading) {
        element.disabled = true;
        const loadingEl = element.querySelector('.btn-loading');
        if (loadingEl) {
            loadingEl.style.display = 'inline-flex';
            const textSpan = element.querySelector('.btn-text');
            if (textSpan) textSpan.style.display = 'none';
        } else {
            element.textContent = 'Caricamento...';
        }
        element.style.opacity = '0.7';
    } else {
        element.disabled = false;
        const loadingEl = element.querySelector('.btn-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            const textSpan = element.querySelector('.btn-text');
            if (textSpan) textSpan.style.display = 'inline';
        } else if (element.dataset.originalText) {
            element.textContent = element.dataset.originalText;
        }
        element.style.opacity = '1';
    }
}

function showTableLoading(tableBody) {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center"><div class="loading-spinner"></div> Caricamento in corso...</td></tr>`;
}

function showTableError(tableBody, error) {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="6" class="error text-center">❌ Errore: ${error.message}<br><button onclick="location.reload()" class="btn btn-retry">Riprova</button></td></tr>`;
}

function announceToScreenReader(message) {
    if (elements.srAnnouncement) {
        elements.srAnnouncement.textContent = message;
        setTimeout(() => { elements.srAnnouncement.textContent = ''; }, 3000);
    }
}

function closeModal(modal) {
    if (modal?.close) modal.close();
}

function showConfirmation(title, message, onConfirm) {
    const titleEl = document.getElementById('confirmationTitle');
    const messageEl = document.getElementById('confirmationMessage');
    const confirmBtn = document.getElementById('confirmAction');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            closeModal(elements.confirmationDialog);
            if (onConfirm) onConfirm();
        };
    }
    if (elements.confirmationDialog) elements.confirmationDialog.showModal();
}

function showFeedback(title, message) {
    const titleEl = document.getElementById('feedbackTitle');
    const messageEl = document.getElementById('feedbackMessage');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (elements.feedbackDialog) elements.feedbackDialog.showModal();
    showToast(message, title === 'Errore' ? 'error' : 'success');
}

function showError(message) {
    if (elements.loginError) {
        elements.loginError.textContent = message;
        elements.loginError.style.display = message ? 'block' : 'none';
    }
}

// ========== AUTHENTICATION ==========
async function handleLogin(e) {
    e.preventDefault();
    
    let email = document.getElementById('email')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const submitBtn = elements.loginForm?.querySelector('button[type="submit"]');
    
    email = email.replace(/\s/g, '').toLowerCase();
    
    if (!validateEmail(email)) {
        showError('Inserisci un indirizzo email valido');
        return;
    }

    try {
        setLoadingState(submitBtn, true);
        await auth.signInWithEmailAndPassword(email, password);
        showError('');
    } catch (error) {
        console.error("Errore login:", error);
        showError(getAuthErrorMessage(error));
        showToast(getAuthErrorMessage(error), 'error');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value;
    const password = document.getElementById('regPassword')?.value;
    const submitBtn = elements.registerForm?.querySelector('button[type="submit"]');
    
    if (!name || name.length < 2) {
        showError('Il nome deve contenere almeno 2 caratteri');
        return;
    }
    if (!validateEmail(email)) {
        showError('Inserisci un indirizzo email valido');
        return;
    }
    if (password.length < 6) {
        showError('La password deve essere di almeno 6 caratteri');
        return;
    }

    try {
        setLoadingState(submitBtn, true);
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await userCredential.user.updateProfile({ displayName: name });
        
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name, email: email, role: 'dipendente',
            temporaryPassword: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showError('');
        if (elements.registerForm) elements.registerForm.reset();
        showFeedback('Successo', 'Registrazione completata con successo!');
    } catch (error) {
        console.error("Errore registrazione:", error);
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
        await auth.signOut();
        appState.currentUser = null;
        appState.userRole = null;
        appState.userData = null;
        showLogin();
        showToast('Logout effettuato con successo', 'success');
    } catch (error) {
        console.error("Errore logout:", error);
        showFeedback('Errore', 'Errore durante il logout');
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();
    const email = prompt("Inserisci la tua email per reimpostare la password:");
    if (!email) return;
    if (!validateEmail(email)) {
        alert("Inserisci un indirizzo email valido");
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        showFeedback('Successo', 'Email di reset inviata! Controlla la tua casella.');
    } catch (error) {
        showFeedback('Errore', getAuthErrorMessage(error));
    }
}

function showLogin() {
    if (elements.loginContainer) elements.loginContainer.style.display = 'flex';
    if (elements.mainContainer) elements.mainContainer.style.display = 'none';
    if (elements.loginForm) elements.loginForm.style.display = 'block';
    if (elements.registerForm) elements.registerForm.style.display = 'none';
    showError('');
}

function showRegisterForm(e) {
    e.preventDefault();
    if (elements.loginForm) elements.loginForm.style.display = 'none';
    if (elements.registerForm) elements.registerForm.style.display = 'block';
    showError('');
}

function showLoginForm(e) {
    e.preventDefault();
    if (elements.registerForm) elements.registerForm.style.display = 'none';
    if (elements.loginForm) elements.loginForm.style.display = 'block';
    showError('');
}

async function createMissingUserDocument(user) {
    await db.collection('users').doc(user.uid).set({
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        role: 'dipendente',
        temporaryPassword: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function handleUserAuthentication(user) {
    try {
        setAppLoadingState(true);
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            await createMissingUserDocument(user);
            location.reload();
            return;
        }
        
        const userData = userDoc.data();
        appState.currentUser = user;
        appState.userData = userData;
        appState.userRole = userData.role;
        
        await setupUI(user, userData);
        announceToScreenReader(`Accesso effettuato come ${userData.name || user.email}`);
        setupRealtimeListener();
    } catch (error) {
        console.error("Errore gestione utente:", error);
        throw error;
    } finally {
        setAppLoadingState(false);
    }
}

function setAppLoadingState(isLoading) {
    appState.isLoading = isLoading;
    document.body.style.opacity = isLoading ? '0.7' : '1';
    document.body.style.pointerEvents = isLoading ? 'none' : 'auto';
}

// ========== TOGGLE PASSWORD ==========
function initPasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.textContent = type === 'password' ? '👁️' : '🔒';
        });
    }
}

function initRegisterPasswordToggle() {
    const toggleBtn = document.getElementById('toggleRegPassword');
    const passwordInput = document.getElementById('regPassword');
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.textContent = type === 'password' ? '👁️' : '🔒';
        });
    }
}

// ========== REAL-TIME LISTENER ==========
function setupRealtimeListener() {
    if (appState.realtimeListener) appState.realtimeListener();
    
    const isAdmin = appState.userRole === 'admin';
    let query = db.collection('richieste');
    if (!isAdmin && appState.currentUser) {
        query = query.where('userId', '==', appState.currentUser.uid);
    }
    
    appState.realtimeListener = query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const data = change.doc.data();
                const oldStatus = change.doc.data().stato;
                if (oldStatus !== data.stato) {
                    announceToScreenReader(`La richiesta ${data.tipo} è stata ${data.stato.toLowerCase()}`);
                    showToast(`Richiesta ${data.tipo}: ${data.stato}`, 
                             data.stato === 'Approvato' ? 'success' : data.stato === 'Rifiutato' ? 'error' : 'info');
                }
            }
        });
        if (appState.currentUser) loadRequests(appState.currentUser, isAdmin, true);
    }, (error) => console.error("Errore real-time:", error));
}

// ========== SETUP UI ==========
async function setupUI(user, userData) {
    const isAdmin = userData.role === 'admin';
    
    if (elements.adminControls) elements.adminControls.style.display = isAdmin ? 'block' : 'none';
    if (elements.requestForms) elements.requestForms.style.display = isAdmin ? 'none' : 'block';
    if (elements.adminFilters) elements.adminFilters.style.display = isAdmin ? 'block' : 'none';
    
    if (elements.loggedInUser) {
        elements.loggedInUser.textContent = `Benvenuto, ${userData.name || user.email}`;
    }
    
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = userData.name || user.email;
    });
    
    if (isAdmin) initFilters();
    
    if (elements.loginContainer) elements.loginContainer.style.display = 'none';
    if (elements.mainContainer) elements.mainContainer.style.display = 'block';
    if (elements.richiesteDiv) elements.richiesteDiv.style.display = 'block';
    
    await loadRequests(user, isAdmin);
}

// ========== FILTERS ==========
function initFilters() {
    const ids = ['filterType', 'filterEmployee', 'filterYear', 'filterMonth', 'filterStatus'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function applyFilters() {
    appState.filters = {
        type: document.getElementById('filterType')?.value || '',
        employee: document.getElementById('filterEmployee')?.value.trim() || '',
        year: document.getElementById('filterYear')?.value || '',
        month: document.getElementById('filterMonth')?.value || '',
        status: document.getElementById('filterStatus')?.value || ''
    };
    
    if (appState.filters.month && !appState.filters.year) {
        appState.filters.year = new Date().getFullYear().toString();
        const yearInput = document.getElementById('filterYear');
        if (yearInput) yearInput.value = appState.filters.year;
    }
    
    appState.currentPage = 1;
    if (appState.currentUser) loadRequests(appState.currentUser, appState.userRole === 'admin');
}

function resetFilters() {
    initFilters();
    appState.filters = { type: '', employee: '', year: '', month: '', status: '' };
    appState.currentPage = 1;
    if (appState.currentUser) loadRequests(appState.currentUser, appState.userRole === 'admin');
}

// ========== LOAD REQUESTS ==========
async function loadRequests(user, isAdmin, forceRefresh = false) {
    if (!elements.richiesteBody) return;
    showTableLoading(elements.richiesteBody);
    
    try {
        let query = db.collection('richieste');
        if (!isAdmin) {
            query = query.where('userId', '==', user.uid);
        } else {
            if (appState.filters.type) query = query.where('tipo', '==', appState.filters.type);
            if (appState.filters.status) query = query.where('stato', '==', appState.filters.status);
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
        
        if (isAdmin && appState.filters.employee) {
            const searchTerm = appState.filters.employee.toLowerCase();
            docs = docs.filter(doc => doc.data().userName?.toLowerCase().includes(searchTerm));
        }
        
        appState.totalRequests = docs.length;
        updatePaginationControls();
        
        const start = (appState.currentPage - 1) * appState.pageSize;
        const paginated = docs.slice(start, start + appState.pageSize);
        renderRequests(paginated, isAdmin);
    } catch (error) {
        console.error("Errore caricamento richieste:", error);
        showTableError(elements.richiesteBody, error);
    }
}

function renderRequests(docs, isAdmin) {
    if (!elements.richiesteBody) return;
    elements.richiesteBody.innerHTML = '';
    
    if (docs.length === 0) {
        elements.richiesteBody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 5}" class="text-center">Nessuna richiesta trovata</td></tr>`;
        return;
    }
    
    docs.forEach(doc => {
        elements.richiesteBody.appendChild(createRequestRow(doc.id, doc.data(), isAdmin));
    });
    
    const azioniHeader = document.getElementById('azioniHeader');
    if (azioniHeader) azioniHeader.style.display = isAdmin ? 'table-cell' : 'none';
}

function createRequestRow(requestId, data, isAdmin) {
    let periodo = '', dettagli = '';
    
    if (data.tipo === 'Ferie') {
        periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
        dettagli = `${data.giorni} giorni lavorativi`;
    } else if (data.tipo === 'Malattia') {
        periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
        dettagli = `Cert. n. ${data.numeroCertificato} del ${formatDate(data.dataCertificato)}`;
    } else if (data.tipo === 'Permesso') {
        periodo = formatDate(data.data);
        dettagli = `${data.oraInizio} - ${data.oraFine}${data.motivazione ? ` (${data.motivazione})` : ''}`;
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${data.tipo}</td>
        <td>${data.userName}</td>
        <td>${periodo}</td>
        <td>${dettagli}</td>
        <td><span class="status-badge ${data.stato.toLowerCase().replace(' ', '-')}">${data.stato}</span></td>
        ${isAdmin ? `
        <td class="actions-cell">
            <select class="status-select form-control" data-request-id="${requestId}">
                <option value="In attesa" ${data.stato === 'In attesa' ? 'selected' : ''}>In attesa</option>
                <option value="Approvato" ${data.stato === 'Approvato' ? 'selected' : ''}>Approvato</option>
                <option value="Rifiutato" ${data.stato === 'Rifiutato' ? 'selected' : ''}>Rifiutato</option>
            </select>
            <button class="btn btn-small save-status-btn" data-request-id="${requestId}">Salva</button>
            <button class="btn btn-small btn-danger delete-request-btn" data-request-id="${requestId}">Elimina</button>
        </td>
        ` : ''}
    `;
    
    if (isAdmin) {
        row.querySelector('.save-status-btn')?.addEventListener('click', () => {
            updateRequestStatus(requestId, row.querySelector('.status-select').value);
        });
        row.querySelector('.delete-request-btn')?.addEventListener('click', () => {
            showConfirmation('Elimina Richiesta', 'Sei sicuro?', () => deleteRequest(requestId));
        });
    }
    return row;
}

async function updateRequestStatus(requestId, newStatus) {
    try {
        await db.collection('richieste').doc(requestId).update({ stato: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showFeedback('Successo', 'Stato aggiornato!');
        await loadRequests(appState.currentUser, true, true);
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'aggiornamento');
    }
}

async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata!');
        await loadRequests(appState.currentUser, true, true);
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'eliminazione');
    }
}

// ========== SUBMIT REQUESTS ==========
async function handleFerieSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const dataInizio = new Date(document.getElementById('ferieDataInizio').value);
    const dataFine = new Date(document.getElementById('ferieDataFine').value);
    const submitBtn = elements.ferieForm?.querySelector('button[type="submit"]');
    const oggi = new Date(); oggi.setHours(0,0,0,0);
    
    if (dataInizio < oggi) { showFeedback('Errore', 'Non puoi richiedere ferie per date passate'); return; }
    if (dataFine < dataInizio) { showFeedback('Errore', 'Data fine precedente a data inizio'); return; }
    
    const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
    if (giorni <= 0) { showFeedback('Errore', 'Nessun giorno lavorativo nel periodo'); return; }
    if (giorni > 20) { showFeedback('Errore', 'Massimo 20 giorni per richiesta'); return; }
    
    const overlapping = await checkOverlappingRequests(appState.currentUser.uid, 'Ferie', dataInizio, dataFine);
    if (overlapping.overlapping) { showFeedback('Errore', 'Periodo già coperto da altra richiesta approvata'); return; }
    
    try {
        setLoadingState(submitBtn, true);
        await db.collection('richieste').add({
            tipo: 'Ferie', userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio, dataFine, giorni, stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (elements.ferieForm) elements.ferieForm.reset();
        showFeedback('Successo', `Richiesta ferie inviata! Giorni: ${giorni}`);
        await loadRequests(appState.currentUser, false);
    } catch (error) { showFeedback('Errore', 'Errore durante l\'invio'); }
    finally { setLoadingState(submitBtn, false); }
}

async function handleMalattiaSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const dataInizio = new Date(document.getElementById('malattiaDataInizio').value);
    const dataFine = new Date(document.getElementById('malattiaDataFine').value);
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato')?.value;
    const dataCertificato = document.getElementById('malattiaDataCertificato')?.value;
    const submitBtn = elements.malattiaForm?.querySelector('button[type="submit"]');
    
    if (dataFine < dataInizio) { showFeedback('Errore', 'Data fine precedente a data inizio'); return; }
    if (!numeroCertificato?.trim()) { showFeedback('Errore', 'Numero certificato obbligatorio'); return; }
    if (!dataCertificato) { showFeedback('Errore', 'Data certificato obbligatoria'); return; }
    
    try {
        setLoadingState(submitBtn, true);
        await db.collection('richieste').add({
            tipo: 'Malattia', userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio, dataFine, numeroCertificato,
            dataCertificato: new Date(dataCertificato), stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (elements.malattiaForm) elements.malattiaForm.reset();
        showFeedback('Successo', 'Richiesta malattia inviata!');
        await loadRequests(appState.currentUser, false);
    } catch (error) { showFeedback('Errore', 'Errore durante l\'invio'); }
    finally { setLoadingState(submitBtn, false); }
}

async function handlePermessiSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const data = new Date(document.getElementById('permessiData').value);
    const oraInizio = document.getElementById('permessiOraInizio')?.value;
    const oraFine = document.getElementById('permessiOraFine')?.value;
    const motivazione = document.getElementById('permessiMotivazione')?.value;
    const submitBtn = elements.permessiForm?.querySelector('button[type="submit"]');
    const oggi = new Date(); oggi.setHours(0,0,0,0);
    
    if (data < oggi) { showFeedback('Errore', 'Non puoi richiedere un permesso per data passata'); return; }
    if (!oraInizio || !oraFine) { showFeedback('Errore', 'Ore obbligatorie'); return; }
    if (oraInizio >= oraFine) { showFeedback('Errore', 'Ora fine deve essere dopo ora inizio'); return; }
    
    try {
        setLoadingState(submitBtn, true);
        await db.collection('richieste').add({
            tipo: 'Permesso', userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            data, oraInizio, oraFine, motivazione: motivazione || '', stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (elements.permessiForm) elements.permessiForm.reset();
        showFeedback('Successo', 'Richiesta permesso inviata!');
        await loadRequests(appState.currentUser, false);
    } catch (error) { showFeedback('Errore', 'Errore durante l\'invio'); }
    finally { setLoadingState(submitBtn, false); }
}

// ========== EXPORT FUNCTIONS ==========
function generatePDF() {
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
            rows.push([cells[0].textContent, cells[1].textContent, cells[2].textContent, cells[3].textContent, cells[4].textContent]);
        }
    });
    
    doc.autoTable({ head: headers, body: rows, startY: 30, styles: { fontSize: 8 }, headStyles: { fillColor: [66, 133, 244] } });
    doc.save(`richieste_${new Date().toISOString().slice(0,10)}.pdf`);
}

function exportToPDF() { generatePDF(); }

function exportToExcel() {
    const rows = [['Tipo', 'Dipendente', 'Periodo', 'Dettagli', 'Stato']];
    document.querySelectorAll('#richiesteBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5 && !cells[0].textContent.includes('Nessuna')) {
            rows.push([cells[0].textContent, cells[1].textContent, cells[2].textContent, cells[3].textContent, cells[4].textContent]);
        }
    });
    
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `richieste_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Esportazione completata', 'success');
}

// ========== EMPLOYEE MANAGEMENT ==========
async function handleEmployeeRegistration() {
    const name = prompt("Nome completo dipendente:");
    if (!name?.trim()) { showFeedback('Errore', 'Nome obbligatorio'); return; }
    const email = prompt("Email dipendente:");
    if (!email || !validateEmail(email)) { showFeedback('Errore', 'Email non valida'); return; }
    
    try {
        setLoadingState(elements.registerEmployeeBtn, true);
        const userCred = await auth.createUserWithEmailAndPassword(email, "Union14.it");
        await userCred.user.updateProfile({ displayName: name });
        await db.collection('users').doc(userCred.user.uid).set({
            name, email, role: 'dipendente', temporaryPassword: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showFeedback('Successo', `Dipendente "${name}" registrato! Password: Union14.it`);
        if (elements.employeesList?.style.display === 'block') await loadEmployeesList();
    } catch (error) { showFeedback('Errore', getAuthErrorMessage(error)); }
    finally { setLoadingState(elements.registerEmployeeBtn, false); }
}

async function toggleEmployeesList() {
    if (!elements.employeesList || !elements.showEmployeesBtn) return;
    const btnText = elements.showEmployeesBtn.querySelector('.btn-text');
    if (elements.employeesList.style.display === 'none') {
        if (btnText) btnText.textContent = 'Nascondi Dipendenti';
        elements.employeesList.style.display = 'block';
        await loadEmployeesList();
    } else {
        if (btnText) btnText.textContent = 'Visualizza Dipendenti';
        elements.employeesList.style.display = 'none';
    }
}

async function loadEmployeesList() {
    if (!elements.employeesBody) return;
    elements.employeesBody.innerHTML = '<table><td colspan="6">Caricamento...</td></tr>';
    try {
        const snapshot = await db.collection('users').orderBy('name').get();
        elements.employeesBody.innerHTML = '';
        if (snapshot.empty) { elements.employeesBody.innerHTML = '<tr><td colspan="6">Nessun dipendente</td></tr>'; return; }
        snapshot.forEach(doc => { elements.employeesBody.appendChild(createEmployeeRow(doc.id, doc.data())); });
    } catch (error) { elements.employeesBody.innerHTML = '<tr><td colspan="6">Errore caricamento</td></tr>'; }
}

function createEmployeeRow(id, data) {
    const row = document.createElement('tr');
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    row.innerHTML = `
        <td>${data.name || 'N/D'}</td>
        <td>${data.email}</td>
        <td><select class="role-select" data-id="${id}"><option value="dipendente" ${data.role === 'dipendente' ? 'selected' : ''}>Dipendente</option><option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
        <td>${createdAt.toLocaleDateString('it-IT')}</td>
        <td>${data.temporaryPassword ? '<span class="status-badge rifiutato">Temporanea</span>' : '<span class="status-badge approvato">Definitiva</span>'}</td>
        <td><button class="btn-small update-role">Aggiorna</button> <button class="btn-small reset-pwd" data-email="${data.email}">Reset</button> ${data.role !== 'admin' ? '<button class="btn-small btn-danger delete-emp">Elimina</button>' : ''}</td>
    `;
    row.querySelector('.update-role')?.addEventListener('click', () => updateEmployeeRole(id, row.querySelector('.role-select').value));
    row.querySelector('.reset-pwd')?.addEventListener('click', () => resetEmployeePassword(data.email));
    row.querySelector('.delete-emp')?.addEventListener('click', () => deleteEmployee(id, data.name));
    if (appState.currentUser?.uid === id) row.classList.add('current-user');
    return row;
}

async function updateEmployeeRole(id, role) {
    showConfirmation('Cambio Ruolo', `Sei sicuro?`, async () => {
        await db.collection('users').doc(id).update({ role });
        showFeedback('Successo', 'Ruolo aggiornato');
        await loadEmployeesList();
        if (appState.currentUser?.uid === id) location.reload();
    });
}

async function resetEmployeePassword(email) {
    showConfirmation('Reset Password', `Inviare email a ${email}?`, async () => {
        await auth.sendPasswordResetEmail(email);
        showFeedback('Successo', 'Email inviata');
    });
}

async function deleteEmployee(id, name) {
    showConfirmation('Elimina Dipendente', `Eliminare "${name}"?`, async () => {
        const requests = await db.collection('richieste').where('userId', '==', id).get();
        const batch = db.batch();
        requests.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('users').doc(id));
        await batch.commit();
        showFeedback('Successo', 'Dipendente eliminato');
        await loadEmployeesList();
    });
}

// ========== PAGINATION ==========
function updatePaginationControls() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    if (elements.pageInfo) elements.pageInfo.textContent = `Pagina ${appState.currentPage} di ${total || 1}`;
    if (elements.prevPage) elements.prevPage.disabled = appState.currentPage <= 1;
    if (elements.nextPage) elements.nextPage.disabled = appState.currentPage >= total;
    if (elements.paginationControls) elements.paginationControls.style.display = total > 1 ? 'flex' : 'none';
}

function goToPreviousPage() {
    if (appState.currentPage > 1) {
        appState.currentPage--;
        loadRequests(appState.currentUser, appState.userRole === 'admin');
    }
}

function goToNextPage() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    if (appState.currentPage < total) {
        appState.currentPage++;
        loadRequests(appState.currentUser, appState.userRole === 'admin');
    }
}

function handleTabSwitch(e) {
    const tabId = this.dataset.tab;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// ========== INIZIALIZZAZIONE ==========
function initializeEventListeners() {
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.registerForm?.addEventListener('submit', handleRegister);
    elements.logoutBtn?.addEventListener('click', handleLogout);
    elements.registerLink?.addEventListener('click', showRegisterForm);
    elements.loginLink?.addEventListener('click', showLoginForm);
    elements.resetPasswordLink?.addEventListener('click', handlePasswordReset);
    elements.ferieForm?.addEventListener('submit', handleFerieSubmit);
    elements.malattiaForm?.addEventListener('submit', handleMalattiaSubmit);
    elements.permessiForm?.addEventListener('submit', handlePermessiSubmit);
    elements.exportPDF?.addEventListener('click', exportToPDF);
    elements.exportExcel?.addEventListener('click', exportToExcel);
    elements.registerEmployeeBtn?.addEventListener('click', handleEmployeeRegistration);
    elements.showEmployeesBtn?.addEventListener('click', toggleEmployeesList);
    elements.applyFilters?.addEventListener('click', applyFilters);
    elements.resetFilters?.addEventListener('click', resetFilters);
    elements.prevPage?.addEventListener('click', goToPreviousPage);
    elements.nextPage?.addEventListener('click', goToNextPage);
    
    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', handleTabSwitch));
    document.getElementById('ferieDataInizio')?.addEventListener('change', calcolaGiorni);
    document.getElementById('ferieDataFine')?.addEventListener('change', calcolaGiorni);
    document.getElementById('filterEmployee')?.addEventListener('input', debounce(() => { appState.currentPage = 1; applyFilters(); }, 300));
    
    const today = new Date().toISOString().split('T')[0];
    ['ferieDataInizio', 'ferieDataFine', 'malattiaDataInizio', 'malattiaDataFine', 'permessiData'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });
}

function initializeModals() {
    elements.confirmationDialog?.addEventListener('click', e => { if (e.target === elements.confirmationDialog) closeModal(elements.confirmationDialog); });
    document.getElementById('cancelAction')?.addEventListener('click', () => closeModal(elements.confirmationDialog));
    elements.feedbackDialog?.addEventListener('click', e => { if (e.target === elements.feedbackDialog) closeModal(elements.feedbackDialog); });
    document.getElementById('closeFeedback')?.addEventListener('click', () => closeModal(elements.feedbackDialog));
}

function setupFirebaseAuth() {
    auth.onAuthStateChanged(async (user) => {
        try {
            if (user) await handleUserAuthentication(user);
            else showLogin();
        } catch (error) {
            console.error("Errore auth:", error);
            showFeedback('Errore', 'Errore durante l\'accesso');
            showLogin();
        }
    });
}

function initializeApp() {
    initializeEventListeners();
    initializeModals();
    initPasswordToggle();
    initRegisterPasswordToggle();
    showLogin();
    setupFirebaseAuth();
    
    if (isMobileDevice()) {
        console.log('📱 Dispositivo mobile rilevato');
        document.body.classList.add('mobile-device');
    }
}

// Avvio applicazione
document.addEventListener('DOMContentLoaded', initializeApp);
