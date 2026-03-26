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

// Festività italiane (da espandere con anno corrente)
const FESTIVITA_ITALIANE = [
    '01-01', // Capodanno
    '01-06', // Epifania
    '04-25', // Liberazione
    '05-01', // Lavoro
    '06-02', // Repubblica
    '08-15', // Ferragosto
    '11-01', // Ognissanti
    '12-08', // Immacolata
    '12-25', // Natale
    '12-26'  // Santo Stefano
];

// Elementi UI
const elements = {
    // Forms
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    ferieForm: document.getElementById('ferieForm'),
    malattiaForm: document.getElementById('malattiaForm'),
    permessiForm: document.getElementById('permessiForm'),
    
    // Containers
    loginContainer: document.getElementById('loginContainer'),
    mainContainer: document.getElementById('mainContainer'),
    richiesteDiv: document.getElementById('richiesteInviate'),
    adminControls: document.getElementById('adminControls'),
    requestForms: document.getElementById('requestForms'),
    adminFilters: document.getElementById('adminFilters'),
    employeesList: document.getElementById('employeesList'),
    
    // Buttons
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
    
    // Tables
    richiesteBody: document.getElementById('richiesteBody'),
    employeesBody: document.getElementById('employeesBody'),
    
    // Messages
    loginError: document.getElementById('loginError'),
    loggedInUser: document.getElementById('loggedInUser'),
    
    // Modals
    confirmationDialog: document.getElementById('confirmationDialog'),
    feedbackDialog: document.getElementById('feedbackDialog'),
    
    // Pagination
    paginationControls: document.getElementById('paginationControls'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    
    // Screen Reader
    srAnnouncement: document.getElementById('srAnnouncement')
};

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== FUNZIONI DI UTILITY ==========

// Calcola giorni lavorativi (esclude weekend e festività)
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
        
        if (!isWeekend && !isFestivita) {
            giorniLavorativi++;
        }
        
        dataCorrente.setDate(dataCorrente.getDate() + 1);
    }
    
    return giorniLavorativi;
}

// Calcola giorni ferie e aggiorna campo
function calcolaGiorni() {
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    const ferieGiorni = document.getElementById('ferieGiorni');
    const giorniHelp = document.getElementById('ferieGiorniHelp');
    
    if (ferieDataInizio.value && ferieDataFine.value) {
        const inizio = new Date(ferieDataInizio.value);
        const fine = new Date(ferieDataFine.value);
        
        if (fine < inizio) {
            showFeedback('Errore', "La data di fine non può essere precedente alla data di inizio");
            ferieDataFine.value = '';
            ferieGiorni.value = '';
            if (giorniHelp) {
                giorniHelp.textContent = 'Calcolo automatico basato sulle date selezionate';
            }
            return;
        }
        
        const giorniLavorativi = calcolaGiorniLavorativi(inizio, fine);
        ferieGiorni.value = giorniLavorativi;
        
        if (giorniHelp) {
            const giorniTotali = Math.ceil((fine - inizio) / (1000 * 60 * 60 * 24)) + 1;
            const weekendDays = giorniTotali - giorniLavorativi;
            giorniHelp.textContent = `${giorniLavorativi} giorni lavorativi (esclusi ${weekendDays} giorni di weekend/festività)`;
        }
    } else {
        if (giorniHelp) {
            giorniHelp.textContent = 'Calcolo automatico basato sulle date selezionate';
        }
    }
}

// Controlla sovrapposizione richieste
async function checkOverlappingRequests(userId, type, startDate, endDate) {
    try {
        let query = db.collection('richieste')
            .where('userId', '==', userId)
            .where('stato', '==', 'Approvato');
        
        if (type === 'Ferie' || type === 'Malattia') {
            const snapshot = await query.get();
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data.dataInizio && data.dataFine) {
                    const existingStart = data.dataInizio.toDate();
                    const existingEnd = data.dataFine.toDate();
                    
                    if (startDate <= existingEnd && endDate >= existingStart) {
                        return {
                            overlapping: true,
                            existingRequest: data
                        };
                    }
                }
            }
        }
        
        return { overlapping: false };
    } catch (error) {
        console.error("Errore controllo sovrapposizioni:", error);
        return { overlapping: false };
    }
}

// Firestore con retry automatico
async function firestoreWithRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(`Tentativo ${i + 1} fallito:`, error);
            
            if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                continue;
            }
            throw error;
        }
    }
    
    throw lastError;
}

// Validazione email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Formatta data
function formatDate(dateValue) {
    if (!dateValue) return 'N/D';
    
    try {
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString('it-IT');
    } catch (e) {
        return 'N/D';
    }
}

// Debounce per ricerca
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

// ========== GESTIONE ERRORI AUTH ==========
function getAuthErrorMessage(error) {
    switch(error.code) {
        case 'auth/invalid-email':
            return 'Email non valida';
        case 'auth/user-disabled':
            return 'Account disabilitato';
        case 'auth/user-not-found':
            return 'Utente non trovato';
        case 'auth/wrong-password':
            return 'Password errata';
        case 'auth/email-already-in-use':
            return 'Email già registrata';
        case 'auth/weak-password':
            return 'Password troppo debole (minimo 6 caratteri)';
        case 'auth/operation-not-allowed':
            return 'Operazione non permessa';
        case 'auth/network-request-failed':
            return 'Errore di rete. Controlla la connessione';
        default:
            return `Errore: ${error.message}`;
    }
}

// ========== GESTIONE STATI UI ==========
function setLoadingState(element, isLoading) {
    if (!element) return;
    
    if (isLoading) {
        element.disabled = true;
        element.dataset.originalText = element.querySelector('.btn-text')?.textContent || element.textContent;
        
        const loadingEl = element.querySelector('.btn-loading');
        if (loadingEl) {
            loadingEl.style.display = 'inline-flex';
            if (element.querySelector('.btn-text')) {
                element.querySelector('.btn-text').style.display = 'none';
            }
        } else {
            element.textContent = 'Caricamento...';
        }
        
        element.style.opacity = '0.7';
    } else {
        element.disabled = false;
        
        const loadingEl = element.querySelector('.btn-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            if (element.querySelector('.btn-text')) {
                element.querySelector('.btn-text').style.display = 'inline';
            }
        } else {
            element.textContent = element.dataset.originalText || element.textContent;
        }
        
        element.style.opacity = '1';
    }
}

function setAppLoadingState(isLoading) {
    appState.isLoading = isLoading;
    document.body.style.opacity = isLoading ? '0.7' : '1';
    document.body.style.pointerEvents = isLoading ? 'none' : 'auto';
}

function showTableLoading(tableBody) {
    if (!tableBody) return;
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                <div class="loading-spinner"></div>
                Caricamento in corso...
            </td>
        </tr>`;
}

function showTableError(tableBody, error) {
    if (!tableBody) return;
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="error text-center">
                ❌ Errore nel caricamento: ${error.message}
                <button onclick="location.reload()" class="btn btn-retry">
                    Riprova
                </button>
            </td>
        </tr>`;
}

function announceToScreenReader(message) {
    if (elements.srAnnouncement) {
        elements.srAnnouncement.textContent = message;
        setTimeout(() => {
            elements.srAnnouncement.textContent = '';
        }, 3000);
    }
}

// ========== GESTIONE MODALI ==========
function closeModal(modal) {
    if (modal && modal.close) {
        modal.close();
    }
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
    
    if (elements.confirmationDialog) {
        elements.confirmationDialog.showModal();
    }
}

function showFeedback(title, message) {
    const titleEl = document.getElementById('feedbackTitle');
    const messageEl = document.getElementById('feedbackMessage');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    
    if (elements.feedbackDialog) {
        elements.feedbackDialog.showModal();
    }
    
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
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = elements.loginForm?.querySelector('button[type="submit"]');
    
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
            name: name,
            email: email,
            role: 'dipendente',
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
        // Rimuovi listener real-time
        if (appState.realtimeListener) {
            appState.realtimeListener();
            appState.realtimeListener = null;
        }
        
        await auth.signOut();
        appState.currentUser = null;
        appState.userRole = null;
        appState.userData = null;
        showLogin();
        announceToScreenReader('Logout effettuato con successo');
        showToast('Logout effettuato con successo', 'success');
    } catch (error) {
        console.error("Errore durante il logout:", error);
        showFeedback('Errore', 'Si è verificato un errore durante il logout');
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
        showFeedback('Successo', 'Email per il reset della password inviata! Controlla la tua casella di posta.');
    } catch (error) {
        console.error("Errore reset password:", error);
        showFeedback('Errore', getAuthErrorMessage(error));
    }
}

function showLogin() {
    if (elements.loginContainer) elements.loginContainer.style.display = 'flex';
    if (elements.mainContainer) elements.mainContainer.style.display = 'none';
    if (elements.richiesteDiv) elements.richiesteDiv.style.display = 'none';
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
    try {
        await db.collection('users').doc(user.uid).set({
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: 'dipendente',
            temporaryPassword: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Documento utente creato per", user.uid);
    } catch (error) {
        console.error("Errore creazione documento:", error);
        await auth.signOut();
        throw new Error("Impossibile completare la registrazione");
    }
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
        
        // Setup real-time listener
        setupRealtimeListener();
        
    } catch (error) {
        console.error("Errore gestione utente:", error);
        throw error;
    } finally {
        setAppLoadingState(false);
    }
}

// ========== REAL-TIME LISTENER ==========
function setupRealtimeListener() {
    if (appState.realtimeListener) {
        appState.realtimeListener();
    }
    
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
                const newStatus = data.stato;
                
                if (oldStatus !== newStatus) {
                    announceToScreenReader(`La richiesta ${data.tipo} è stata ${newStatus.toLowerCase()}`);
                    showToast(`Richiesta ${data.tipo}: ${newStatus}`, 
                             newStatus === 'Approvato' ? 'success' : 
                             newStatus === 'Rifiutato' ? 'error' : 'info');
                }
            }
        });
        
        // Ricarica le richieste per aggiornare la vista
        if (appState.currentUser) {
            loadRequests(appState.currentUser, isAdmin, true);
        }
    }, (error) => {
        console.error("Errore real-time listener:", error);
    });
}

// ========== SETUP UI ==========
async function setupUI(user, userData) {
    try {
        const isAdmin = userData.role === 'admin';
        
        if (elements.adminControls) {
            elements.adminControls.style.display = isAdmin ? 'block' : 'none';
        }
        if (elements.requestForms) {
            elements.requestForms.style.display = isAdmin ? 'none' : 'block';
        }
        if (elements.adminFilters) {
            elements.adminFilters.style.display = isAdmin ? 'block' : 'none';
        }
        
        const userName = userData.name || user.email;
        if (elements.loggedInUser) {
            elements.loggedInUser.textContent = `Benvenuto, ${userName}`;
        }
        
        setFormUserValues(userName);
        
        if (isAdmin) {
            initFilters();
        }
        
        showMainApp(user);
        await loadRequests(user, isAdmin);
        
    } catch (error) {
        console.error("Errore setup UI:", error);
        throw error;
    }
}

function setFormUserValues(userName) {
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = userName || '';
        }
    });
}

function showMainApp(user) {
    if (elements.loginContainer) elements.loginContainer.style.display = 'none';
    if (elements.mainContainer) elements.mainContainer.style.display = 'block';
    if (elements.richiesteDiv) elements.richiesteDiv.style.display = 'block';
    announceToScreenReader('Accesso effettuato con successo');
}

// ========== FILTERS ==========
function initFilters() {
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
    if (appState.currentUser) {
        loadRequests(appState.currentUser, appState.userRole === 'admin');
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
    
    appState.filters = {
        type: '',
        employee: '',
        year: '',
        month: '',
        status: ''
    };
    
    appState.currentPage = 1;
    if (appState.currentUser) {
        loadRequests(appState.currentUser, appState.userRole === 'admin');
    }
}

// ========== LOAD REQUESTS ==========
async function loadRequests(user, isAdmin, forceRefresh = false) {
    const richiesteBody = elements.richiesteBody;
    if (!richiesteBody) return;
    
    showTableLoading(richiesteBody);
    
    try {
        let query = db.collection('richieste');
        
        if (!isAdmin) {
            query = query.where('userId', '==', user.uid);
        } else {
            if (appState.filters.type) {
                query = query.where('tipo', '==', appState.filters.type);
            }
            if (appState.filters.status) {
                query = query.where('stato', '==', appState.filters.status);
            }
        }
        
        // Gestione filtri temporali
        if (appState.filters.year || appState.filters.month) {
            const year = appState.filters.year ? parseInt(appState.filters.year) : new Date().getFullYear();
            const month = appState.filters.month ? parseInt(appState.filters.month) - 1 : 0;
            
            const startDate = new Date(year, month, 1);
            const endDate = appState.filters.month 
                ? new Date(year, month + 1, 1) 
                : new Date(year + 1, 0, 1);
            
            const dateField = appState.filters.type === 'Permesso' ? 'data' : 'dataInizio';
            
            query = query.orderBy(dateField, 'desc')
                         .where(dateField, '>=', startDate)
                         .where(dateField, '<', endDate);
        } else {
            query = query.orderBy('createdAt', 'desc');
        }
        
        const options = forceRefresh ? { source: 'server' } : {};
        const snapshot = await firestoreWithRetry(() => query.get(options));
        
        let filteredDocs = snapshot.docs;
        if (isAdmin && appState.filters.employee) {
            const searchTerm = appState.filters.employee.toLowerCase();
            filteredDocs = filteredDocs.filter(doc => {
                const data = doc.data();
                const userName = data.userName?.toLowerCase() || '';
                return userName.includes(searchTerm);
            });
        }
        
        appState.totalRequests = filteredDocs.length;
        updatePaginationControls();
        
        const startIndex = (appState.currentPage - 1) * appState.pageSize;
        const endIndex = startIndex + appState.pageSize;
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        renderRequests(paginatedDocs, isAdmin);
        
    } catch (error) {
        console.error("Errore caricamento richieste:", error);
        showTableError(richiesteBody, error);
    }
}

function renderRequests(docs, isAdmin) {
    const richiesteBody = elements.richiesteBody;
    if (!richiesteBody) return;
    
    richiesteBody.innerHTML = '';
    
    if (docs.length === 0) {
        richiesteBody.innerHTML = `
            <tr>
                <td colspan="${isAdmin ? 6 : 5}" class="text-center">
                    Nessuna richiesta trovata
                 </td>
             </tr>`;
        return;
    }
    
    docs.forEach(doc => {
        const row = createRequestRow(doc.id, doc.data(), isAdmin);
        richiesteBody.appendChild(row);
    });
    
    const azioniHeader = document.getElementById('azioniHeader');
    if (azioniHeader) {
        azioniHeader.style.display = isAdmin ? 'table-cell' : 'none';
    }
}

function createRequestRow(requestId, data, isAdmin) {
    let periodo = '';
    let dettagli = '';
    
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
        <td>
            <span class="status-badge ${data.stato.toLowerCase().replace(' ', '-')}">
                ${data.stato}
            </span>
        </td>
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
        const saveBtn = row.querySelector('.save-status-btn');
        const deleteBtn = row.querySelector('.delete-request-btn');
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const newStatus = row.querySelector('.status-select').value;
                updateRequestStatus(requestId, newStatus);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                showConfirmation(
                    'Elimina Richiesta',
                    'Sei sicuro di voler eliminare definitivamente questa richiesta?',
                    () => deleteRequest(requestId)
                );
            });
        }
    }
    
    return row;
}

async function updateRequestStatus(requestId, newStatus) {
    try {
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showFeedback('Successo', 'Stato aggiornato con successo!');
        await loadRequests(appState.currentUser, true, true);
        
    } catch (error) {
        console.error("Errore durante l'aggiornamento:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'aggiornamento');
    }
}

async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata con successo!');
        await loadRequests(appState.currentUser, true, true);
    } catch (error) {
        console.error("Errore durante l'eliminazione:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'eliminazione');
    }
}

// ========== SUBMIT REQUESTS ==========
async function handleFerieSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizioInput = document.getElementById('ferieDataInizio');
    const dataFineInput = document.getElementById('ferieDataFine');
    const giorniInput = document.getElementById('ferieGiorni');
    const submitBtn = elements.ferieForm?.querySelector('button[type="submit"]');
    
    if (!dataInizioInput || !dataFineInput) return;
    
    const dataInizio = new Date(dataInizioInput.value);
    const dataFine = new Date(dataFineInput.value);
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    
    // Controllo date passate
    if (dataInizio < oggi) {
        showFeedback('Errore', 'Non puoi richiedere ferie per date passate');
        return;
    }
    
    if (dataFine < dataInizio) {
        showFeedback('Errore', "La data di fine non può essere precedente alla data di inizio");
        return;
    }
    
    const giorniLavorativi = calcolaGiorniLavorativi(dataInizio, dataFine);
    
    if (giorniLavorativi <= 0) {
        showFeedback('Errore', "Il periodo selezionato non contiene giorni lavorativi");
        return;
    }
    
    if (giorniLavorativi > 20) {
        showFeedback('Errore', 'Il massimo di giorni richiedibili per volta è 20');
        return;
    }
    
    // Controllo sovrapposizioni
    const overlapping = await checkOverlappingRequests(
        appState.currentUser.uid,
        'Ferie',
        dataInizio,
        dataFine
    );
    
    if (overlapping.overlapping) {
        showFeedback('Errore', `Periodo già coperto da una richiesta ${overlapping.existingRequest.tipo} approvata`);
        return;
    }

    try {
        if (submitBtn) setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Ferie',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio: dataInizio,
            dataFine: dataFine,
            giorni: giorniLavorativi,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (elements.ferieForm) elements.ferieForm.reset();
        showFeedback('Successo', `Richiesta ferie inviata con successo! Giorni richiesti: ${giorniLavorativi}`);
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        if (submitBtn) setLoadingState(submitBtn, false);
    }
}

async function handleMalattiaSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizioInput = document.getElementById('malattiaDataInizio');
    const dataFineInput = document.getElementById('malattiaDataFine');
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato')?.value;
    const dataCertificato = document.getElementById('malattiaDataCertificato')?.value;
    const submitBtn = elements.malattiaForm?.querySelector('button[type="submit"]');
    
    if (!dataInizioInput || !dataFineInput) return;
    
    const dataInizio = new Date(dataInizioInput.value);
    const dataFine = new Date(dataFineInput.value);
    
    if (dataFine < dataInizio) {
        showFeedback('Errore', "La data di fine non può essere precedente alla data di inizio");
        return;
    }
    
    if (!numeroCertificato?.trim()) {
        showFeedback('Errore', "Il numero di certificato è obbligatorio");
        return;
    }
    
    if (!dataCertificato) {
        showFeedback('Errore', "La data del certificato è obbligatoria");
        return;
    }

    try {
        if (submitBtn) setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Malattia',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio: dataInizio,
            dataFine: dataFine,
            numeroCertificato: numeroCertificato,
            dataCertificato: new Date(dataCertificato),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (elements.malattiaForm) elements.malattiaForm.reset();
        showFeedback('Successo', 'Richiesta malattia inviata con successo!');
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        if (submitBtn) setLoadingState(submitBtn, false);
    }
}

async function handlePermessiSubmit(e) {
    e.preventDefault();

    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }

    const dataInput = document.getElementById('permessiData');
    const oraInizio = document.getElementById('permessiOraInizio')?.value;
    const oraFine = document.getElementById('permessiOraFine')?.value;
    const motivazione = document.getElementById('permessiMotivazione')?.value;
    const submitBtn = elements.permessiForm?.querySelector('button[type="submit"]');
    
    if (!dataInput) return;
    
    const data = new Date(dataInput.value);
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    
    if (data < oggi) {
        showFeedback('Errore', "Non puoi richiedere un permesso per una data passata");
        return;
    }

    if (!oraInizio || !oraFine) {
        showFeedback('Errore', "Le ore di inizio e fine sono obbligatorie");
        return;
    }
    
    if (oraInizio >= oraFine) {
        showFeedback('Errore', "L'ora di fine deve essere successiva all'ora di inizio");
        return;
    }

    try {
        if (submitBtn) setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            data: data,
            oraInizio: oraInizio,
            oraFine: oraFine,
            motivazione: motivazione || '',
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        if (elements.permessiForm) elements.permessiForm.reset();
        showFeedback('Successo', 'Richiesta permesso inviata con successo!');
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        if (submitBtn) setLoadingState(submitBtn, false);
    }
}

// ========== EXPORT FUNCTIONS ==========
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Elenco Richieste', 105, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 14, 25);
    
    const headers = [["Tipo", "Dipendente", "Periodo", "Dettagli", "Stato", "Data Creazione"]];
    
    const rows = [];
    document.querySelectorAll('#richiesteBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5 && !cells[0].textContent.includes('Nessuna')) {
            rows.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                new Date().toLocaleDateString('it-IT')
            ]);
        }
    });
    
    doc.autoTable({
        head: headers,
        body: rows,
        startY: 30,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 133, 244], textColor: 255 }
    });
    
    const dateStr = new Date().toISOString().slice(0, 10);
    doc.save(`richieste_${dateStr}.pdf`);
}

function exportToPDF() {
    const btn = document.getElementById('exportPDF');
    if (btn) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparando PDF...';
        
        setTimeout(() => {
            generatePDF();
            btn.disabled = false;
            btn.textContent = originalText;
        }, 100);
    }
}

function exportToExcel() {
    const rows = [];
    rows.push(['Tipo', 'Dipendente', 'Periodo', 'Dettagli', 'Stato', 'Data Creazione']);
    
    document.querySelectorAll('#richiesteBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5 && !cells[0].textContent.includes('Nessuna')) {
            rows.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                new Date().toLocaleDateString('it-IT')
            ]);
        }
    });
    
    const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `richieste_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Esportazione Excel completata', 'success');
}

// ========== EMPLOYEE MANAGEMENT ==========
async function registerEmployee(employeeName, employeeEmail, tempPassword = "Union14.it") {
    try {
        console.log('Registrazione nuovo dipendente:', employeeName, employeeEmail);
        
        const userCredential = await auth.createUserWithEmailAndPassword(employeeEmail, tempPassword);
        
        await userCredential.user.updateProfile({
            displayName: employeeName
        });
        
        const userData = {
            name: employeeName,
            email: employeeEmail,
            role: 'dipendente',
            temporaryPassword: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('users').doc(userCredential.user.uid).set(userData);
        
        return { 
            success: true, 
            message: `Dipendente "${employeeName}" registrato con successo! Email: ${employeeEmail}, Password temporanea: ${tempPassword}` 
        };
        
    } catch (error) {
        console.error("Errore registrazione dipendente:", error);
        throw error;
    }
}

async function handleEmployeeRegistration() {
    const employeeName = prompt("Nome completo dipendente:");
    if (!employeeName?.trim()) {
        showFeedback('Errore', 'Nome obbligatorio');
        return;
    }
    
    const employeeEmail = prompt("Email dipendente:");
    if (!employeeEmail || !validateEmail(employeeEmail)) {
        showFeedback('Errore', 'Email non valida');
        return;
    }

    try {
        if (elements.registerEmployeeBtn) setLoadingState(elements.registerEmployeeBtn, true);
        
        const result = await registerEmployee(employeeName, employeeEmail);
        showFeedback('Successo', result.message);
        
        if (elements.employeesList?.style.display === 'block') {
            await loadEmployeesList();
        }
        
    } catch (error) {
        console.error("Errore registrazione dipendente:", error);
        showFeedback('Errore', getAuthErrorMessage(error));
    } finally {
        if (elements.registerEmployeeBtn) setLoadingState(elements.registerEmployeeBtn, false);
    }
}

async function toggleEmployeesList() {
    const employeesList = elements.employeesList;
    const btn = elements.showEmployeesBtn;
    
    if (!employeesList || !btn) return;
    
    const btnText = btn.querySelector('.btn-text');
    
    if (employeesList.style.display === 'none') {
        if (btnText) btnText.textContent = 'Nascondi Dipendenti';
        employeesList.style.display = 'block';
        await loadEmployeesList();
    } else {
        if (btnText) btnText.textContent = 'Visualizza Dipendenti';
        employeesList.style.display = 'none';
    }
}

async function loadEmployeesList() {
    const employeesBody = elements.employeesBody;
    if (!employeesBody) return;
    
    employeesBody.innerHTML = '<tr><td colspan="6">Caricamento in corso...</td></tr>';

    try {
        const snapshot = await db.collection('users').orderBy('name').get();
        
        employeesBody.innerHTML = '';
        
        if (snapshot.empty) {
            employeesBody.innerHTML = '<tr><td colspan="6">Nessun dipendente registrato</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const employeeData = doc.data();
            const row = createEmployeeRow(doc.id, employeeData);
            employeesBody.appendChild(row);
        });
        
    } catch (error) {
        console.error("Errore caricamento dipendenti:", error);
        employeesBody.innerHTML = '<tr><td colspan="6">Errore nel caricamento</td></tr>';
    }
}

function createEmployeeRow(employeeId, employeeData) {
    const row = document.createElement('tr');
    
    const createdAt = employeeData.createdAt ? 
        (employeeData.createdAt.toDate ? employeeData.createdAt.toDate() : new Date(employeeData.createdAt)) : 
        new Date();
    
    const formattedDate = createdAt.toLocaleDateString('it-IT');
    
    const passwordStatus = employeeData.temporaryPassword ? 
        '<span class="status-badge rifiutato">Temporanea</span>' : 
        '<span class="status-badge approvato">Definitiva</span>';
    
    // Evidenzia l'utente corrente
    if (appState.currentUser && appState.currentUser.uid === employeeId) {
        row.classList.add('current-user');
    }
    
    row.innerHTML = `
        <td>${employeeData.name || 'N/D'}</td>
        <td>${employeeData.email}</td>
        <td>
            <select class="role-select form-control" data-employee-id="${employeeId}">
                <option value="dipendente" ${employeeData.role === 'dipendente' ? 'selected' : ''}>Dipendente</option>
                <option value="admin" ${employeeData.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
        </td>
        <td>${formattedDate}</td>
        <td>${passwordStatus}</td>
        <td class="actions-cell">
            <button class="btn btn-small update-role-btn" data-employee-id="${employeeId}">Aggiorna Ruolo</button>
            <button class="btn btn-small reset-password-btn" data-employee-id="${employeeId}" data-email="${employeeData.email}">Reset Password</button>
            ${employeeData.role !== 'admin' ? 
                `<button class="btn btn-small btn-danger delete-employee-btn" data-employee-id="${employeeId}">Elimina</button>` : 
                ''}
        </td>
    `;
    
    const updateBtn = row.querySelector('.update-role-btn');
    const resetBtn = row.querySelector('.reset-password-btn');
    const deleteBtn = row.querySelector('.delete-employee-btn');
    
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            const newRole = row.querySelector('.role-select').value;
            updateEmployeeRole(employeeId, newRole);
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            const email = resetBtn.getAttribute('data-email');
            resetEmployeePassword(email);
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            deleteEmployee(employeeId, employeeData.name);
        });
    }
    
    return row;
}

async function updateEmployeeRole(employeeId, newRole) {
    showConfirmation(
        'Cambio Ruolo',
        `Sei sicuro di voler cambiare il ruolo a "${newRole}"?`,
        async () => {
            try {
                await db.collection('users').doc(employeeId).update({
                    role: newRole,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                showFeedback('Successo', 'Ruolo aggiornato con successo!');
                await loadEmployeesList();
                
                if (appState.currentUser && appState.currentUser.uid === employeeId) {
                    location.reload();
                }
                
            } catch (error) {
                console.error("Errore aggiornamento ruolo:", error);
                showFeedback('Errore', 'Errore durante l\'aggiornamento del ruolo');
            }
        }
    );
}

async function resetEmployeePassword(email) {
    showConfirmation(
        'Reset Password',
        `Inviare email di reset password a ${email}?`,
        async () => {
            try {
                await auth.sendPasswordResetEmail(email);
                showFeedback('Successo', 'Email di reset password inviata con successo!');
                
                const employee = employeesList?.find(emp => emp.email === email);
                if (employee) {
                    await db.collection('users').doc(employee.id).update({
                        temporaryPassword: true,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    await loadEmployeesList();
                }
                
            } catch (error) {
                console.error("Errore reset password:", error);
                showFeedback('Errore', 'Errore durante l\'invio della email di reset');
            }
        }
    );
}

async function deleteEmployee(employeeId, employeeName) {
    showConfirmation(
        'Elimina Dipendente',
        `Sei sicuro di voler eliminare definitivamente il dipendente "${employeeName}"? Questa azione non può essere annullata.`,
        async () => {
            try {
                const requestsSnapshot = await db.collection('richieste')
                    .where('userId', '==', employeeId)
                    .get();
                
                const batch = db.batch();
                requestsSnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                batch.delete(db.collection('users').doc(employeeId));
                await batch.commit();
                
                showFeedback('Successo', 'Dipendente eliminato con successo!');
                await loadEmployeesList();
                
            } catch (error) {
                console.error("Errore eliminazione dipendente:", error);
                showFeedback('Errore', 'Errore durante l\'eliminazione del dipendente');
            }
        }
    );
}

// ========== PAGINATION ==========
function updatePaginationControls() {
    const totalPages = Math.ceil(appState.totalRequests / appState.pageSize);
    
    if (elements.pageInfo) {
        elements.pageInfo.textContent = `Pagina ${appState.currentPage} di ${totalPages || 1}`;
    }
    if (elements.prevPage) {
        elements.prevPage.disabled = appState.currentPage <= 1;
    }
    if (elements.nextPage) {
        elements.nextPage.disabled = appState.currentPage >= totalPages;
    }
    
    if (elements.paginationControls) {
        elements.paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';
    }
}

function goToPreviousPage() {
    if (appState.currentPage > 1) {
        appState.currentPage--;
        if (appState.currentUser) {
            loadRequests(appState.currentUser, appState.userRole === 'admin');
        }
    }
}

function goToNextPage() {
    const totalPages = Math.ceil(appState.totalRequests / appState.pageSize);
    if (appState.currentPage < totalPages) {
        appState.currentPage++;
        if (appState.currentUser) {
            loadRequests(appState.currentUser, appState.userRole === 'admin');
        }
    }
}

// ========== TAB SWITCH ==========
function handleTabSwitch(e) {
    const tabId = this.getAttribute('data-tab');
    
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

// ========== INIZIALIZZAZIONE ==========
function initializeEventListeners() {
    if (elements.loginForm) elements.loginForm.addEventListener('submit', handleLogin);
    if (elements.registerForm) elements.registerForm.addEventListener('submit', handleRegister);
    if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', handleLogout);
    if (elements.registerLink) elements.registerLink.addEventListener('click', showRegisterForm);
    if (elements.loginLink) elements.loginLink.addEventListener('click', showLoginForm);
    if (elements.resetPasswordLink) elements.resetPasswordLink.addEventListener('click', handlePasswordReset);
    
    if (elements.ferieForm) elements.ferieForm.addEventListener('submit', handleFerieSubmit);
    if (elements.malattiaForm) elements.malattiaForm.addEventListener('submit', handleMalattiaSubmit);
    if (elements.permessiForm) elements.permessiForm.addEventListener('submit', handlePermessiSubmit);
    
    if (elements.exportPDF) elements.exportPDF.addEventListener('click', exportToPDF);
    if (elements.exportExcel) elements.exportExcel.addEventListener('click', exportToExcel);
    if (elements.registerEmployeeBtn) elements.registerEmployeeBtn.addEventListener('click', handleEmployeeRegistration);
    if (elements.showEmployeesBtn) elements.showEmployeesBtn.addEventListener('click', toggleEmployeesList);
    if (elements.applyFilters) elements.applyFilters.addEventListener('click', applyFilters);
    if (elements.resetFilters) elements.resetFilters.addEventListener('click', resetFilters);
    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', handleTabSwitch);
    });
    
    if (elements.prevPage) elements.prevPage.addEventListener('click', goToPreviousPage);
    if (elements.nextPage) elements.nextPage.addEventListener('click', goToNextPage);
    
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    if (ferieDataInizio) ferieDataInizio.addEventListener('change', calcolaGiorni);
    if (ferieDataFine) ferieDataFine.addEventListener('change', calcolaGiorni);
    
    const filterEmployee = document.getElementById('filterEmployee');
    if (filterEmployee) {
        filterEmployee.addEventListener('input', debounce(() => {
            appState.currentPage = 1;
            applyFilters();
        }, 300));
    }
    
    // Imposta data minima per le richieste (oggi)
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = ['ferieDataInizio', 'ferieDataFine', 'malattiaDataInizio', 'malattiaDataFine', 'permessiData'];
    dateInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });
}

function initializeModals() {
    if (elements.confirmationDialog) {
        elements.confirmationDialog.addEventListener('click', (e) => {
            if (e.target === elements.confirmationDialog) {
                closeModal(elements.confirmationDialog);
            }
        });
    }
    
    const cancelAction = document.getElementById('cancelAction');
    if (cancelAction) {
        cancelAction.addEventListener('click', () => {
            closeModal(elements.confirmationDialog);
        });
    }
    
    if (elements.feedbackDialog) {
        elements.feedbackDialog.addEventListener('click', (e) => {
            if (e.target === elements.feedbackDialog) {
                closeModal(elements.feedbackDialog);
            }
        });
    }
    
    const closeFeedback = document.getElementById('closeFeedback');
    if (closeFeedback) {
        closeFeedback.addEventListener('click', () => {
            closeModal(elements.feedbackDialog);
        });
    }
}

function setupFirebaseAuth() {
    auth.onAuthStateChanged(async (user) => {
        try {
            if (user) {
                await handleUserAuthentication(user);
            } else {
                showLogin();
            }
        } catch (error) {
            console.error("Errore durante l'autenticazione:", error);
            showFeedback('Errore', 'Si è verificato un errore durante l\'accesso. Riprova.');
            showLogin();
        }
    });
}

function initializeApp() {
    initializeEventListeners();
    initializeModals();
    showLogin();
    setupFirebaseAuth();
}

// Avvio applicazione
document.addEventListener('DOMContentLoaded', initializeApp);
