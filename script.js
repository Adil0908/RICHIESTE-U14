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
    totalRequests: 0
};

// Cache per le richieste
let requestsCache = {
    data: null,
    timestamp: null,
    ttl: 30000 // 30 secondi
};

// Lista dipendenti globale
let employeesList = [];

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
    manageUsersBtn: document.getElementById('manageUsersBtn'),
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

// Inizializzazione dell'applicazione
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Funzione di inizializzazione principale
function initializeApp() {
    initializeEventListeners();
    initializeModals();
    showLogin();
    setupFirebaseAuth();
}

// Inizializza tutti gli event listeners
function initializeEventListeners() {
    // Authentication
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.registerLink.addEventListener('click', showRegisterForm);
    elements.loginLink.addEventListener('click', showLoginForm);
    elements.resetPasswordLink.addEventListener('click', handlePasswordReset);

    // Request Forms
    elements.ferieForm.addEventListener('submit', handleFerieSubmit);
    elements.malattiaForm.addEventListener('submit', handleMalattiaSubmit);
    elements.permessiForm.addEventListener('submit', handlePermessiSubmit);

    // Admin Functions
    elements.exportPDF.addEventListener('click', handleExportPDF);
    elements.registerEmployeeBtn.addEventListener('click', handleEmployeeRegistration);
    elements.showEmployeesBtn.addEventListener('click', toggleEmployeesList);
    elements.applyFilters.addEventListener('click', applyFilters);
    elements.resetFilters.addEventListener('click', resetFilters);

    // Tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', handleTabSwitch);
    });

    // Pagination
    elements.prevPage.addEventListener('click', goToPreviousPage);
    elements.nextPage.addEventListener('click', goToNextPage);

    // Calcolo giorni ferie
    document.getElementById('ferieDataInizio').addEventListener('change', calcolaGiorni);
    document.getElementById('ferieDataFine').addEventListener('change', calcolaGiorni);

    // Ricerca in tempo reale
    document.getElementById('filterEmployee').addEventListener('input', debounce(() => {
        appState.currentPage = 1;
        applyFilters();
    }, 300));
}

// Inizializza i modali
function initializeModals() {
    // Conferma dialog
    elements.confirmationDialog.addEventListener('click', (e) => {
        if (e.target === elements.confirmationDialog) {
            closeModal(elements.confirmationDialog);
        }
    });

    document.getElementById('cancelAction').addEventListener('click', () => {
        closeModal(elements.confirmationDialog);
    });

    // Feedback dialog
    elements.feedbackDialog.addEventListener('click', (e) => {
        if (e.target === elements.feedbackDialog) {
            closeModal(elements.feedbackDialog);
        }
    });

    document.getElementById('closeFeedback').addEventListener('click', () => {
        closeModal(elements.feedbackDialog);
    });
}

// Setup Firebase Auth
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

// Gestione autenticazione utente
async function handleUserAuthentication(user) {
    try {
        setAppLoadingState(true);
        
        // Verifica esistenza documento utente
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            await createMissingUserDocument(user);
            // Ricarica per applicare i cambiamenti
            location.reload();
            return;
        }
        
        const userData = userDoc.data();
        appState.currentUser = user;
        appState.userData = userData;
        appState.userRole = userData.role;
        
        await setupUI(user, userData);
        announceToScreenReader(`Accesso effettuato come ${userData.name || user.email}`);
        
    } catch (error) {
        console.error("Errore gestione utente:", error);
        throw error;
    } finally {
        setAppLoadingState(false);
    }
}

// Gestione Login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = elements.loginForm.querySelector('button[type="submit"]');
    
    if (!validateEmail(email)) {
        showError('Inserisci un indirizzo email valido');
        return;
    }

    try {
        setLoadingState(submitBtn, true);
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        showError(''); // Clear errors
        
    } catch (error) {
        console.error("Errore login:", error);
        showError(getAuthErrorMessage(error));
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Gestione Registrazione
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const submitBtn = elements.registerForm.querySelector('button[type="submit"]');
    
    // Validazione
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
        
        // Crea documento utente
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name,
            email: email,
            role: 'dipendente',
            temporaryPassword: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showError('');
        elements.registerForm.reset();
        showFeedback('Successo', 'Registrazione completata con successo!');
        
    } catch (error) {
        console.error("Errore registrazione:", error);
        showError(getAuthErrorMessage(error));
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Gestione Logout
async function handleLogout() {
    try {
        await auth.signOut();
        appState.currentUser = null;
        appState.userRole = null;
        appState.userData = null;
        showLogin();
        announceToScreenReader('Logout effettuato con successo');
    } catch (error) {
        console.error("Errore durante il logout:", error);
        showFeedback('Errore', 'Si è verificato un errore durante il logout');
    }
}

// Reset Password
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

// Setup UI in base al ruolo
async function setupUI(user, userData) {
    try {
        const isAdmin = userData.role === 'admin';
        
        // Configura elementi UI
        elements.adminControls.style.display = isAdmin ? 'block' : 'none';
        elements.requestForms.style.display = isAdmin ? 'none' : 'block';
        elements.adminFilters.style.display = isAdmin ? 'block' : 'none';
        
        // Mostra nome utente
        const userName = userData.name || user.email;
        elements.loggedInUser.textContent = `Benvenuto, ${userName}`;
        
        // Imposta valori form
        setFormUserValues(userName);
        
        // Inizializza filtri per admin
        if (isAdmin) {
            initFilters();
        }
        
        // Mostra app principale
        showMainApp(user);
        
        // Carica richieste
        await loadRequests(user, isAdmin);
        
    } catch (error) {
        console.error("Errore setup UI:", error);
        throw error;
    }
}

// Imposta valori utente nei form
function setFormUserValues(userName) {
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = userName || '';
            if (field.readOnly) {
                field.style.backgroundColor = '#f5f5f5';
            }
        }
    });
}

// Inizializza filtri
function initFilters() {
    // Setup valori iniziali
    document.getElementById('filterType').value = '';
    document.getElementById('filterEmployee').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterStatus').value = '';
    
    console.log("Filtri inizializzati correttamente");
}

// Applica filtri
function applyFilters() {
    appState.filters = {
        type: document.getElementById('filterType').value,
        employee: document.getElementById('filterEmployee').value.trim(),
        year: document.getElementById('filterYear').value,
        month: document.getElementById('filterMonth').value,
        status: document.getElementById('filterStatus').value
    };
    
    // Se è selezionato il mese ma non l'anno, usa l'anno corrente
    if (appState.filters.month && !appState.filters.year) {
        appState.filters.year = new Date().getFullYear().toString();
        document.getElementById('filterYear').value = appState.filters.year;
    }
    
    appState.currentPage = 1;
    loadRequests(appState.currentUser, true);
}

// Reset filtri
function resetFilters() {
    document.getElementById('filterType').value = '';
    document.getElementById('filterEmployee').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterStatus').value = '';
    
    appState.filters = {
        type: '',
        employee: '',
        year: '',
        month: '',
        status: ''
    };
    
    appState.currentPage = 1;
    loadRequests(appState.currentUser, true);
}

// Carica richieste con paginazione
async function loadRequests(user, isAdmin) {
    const richiesteBody = elements.richiesteBody;
    
    // Mostra loading
    showTableLoading(richiesteBody);
    
    try {
        let query = db.collection('richieste');
        
        // Filtro base per ruolo
        if (!isAdmin) {
            query = query.where('userId', '==', user.uid);
        } else {
            // Filtri admin
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
        
        const snapshot = await query.get();
        
        // Filtro lato client per nome
        let filteredDocs = snapshot.docs;
        if (isAdmin && appState.filters.employee) {
            const searchTerm = appState.filters.employee.toLowerCase();
            filteredDocs = filteredDocs.filter(doc => {
                const userName = doc.data().userName?.toLowerCase() || '';
                return userName.includes(searchTerm);
            });
        }
        
        // Aggiorna stato paginazione
        appState.totalRequests = filteredDocs.length;
        updatePaginationControls();
        
        // Applica paginazione
        const startIndex = (appState.currentPage - 1) * appState.pageSize;
        const endIndex = startIndex + appState.pageSize;
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        // Renderizza richieste
        renderRequests(paginatedDocs, isAdmin);
        
    } catch (error) {
        console.error("Errore caricamento richieste:", error);
        showTableError(richiesteBody, error);
    }
}

// Renderizza richieste nella tabella
function renderRequests(docs, isAdmin) {
    const richiesteBody = elements.richiesteBody;
    
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
    
    // Mostra/nascondi colonna azioni per admin
    const azioniHeader = document.getElementById('azioniHeader');
    if (azioniHeader) {
        azioniHeader.style.display = isAdmin ? 'table-cell' : 'none';
    }
}

// Crea riga tabella richieste
function createRequestRow(requestId, data, isAdmin) {
    let periodo = '';
    let dettagli = '';
    
    if (data.tipo === 'Ferie') {
        periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
        dettagli = `${data.giorni} giorni`;
    } else if (data.tipo === 'Malattia') {
        periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
        dettagli = `Cert. n. ${data.numeroCertificato} del ${formatDate(data.dataCertificato)}`;
    } else if (data.tipo === 'Permesso') {
        periodo = formatDate(data.data);
        dettagli = `${data.oraInizio} - ${data.oraFine} (${data.motivazione || 'Nessuna motivazione'})`;
    }
    
    const createdAt = data.createdAt ? 
        (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : 
        new Date();
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${data.tipo}</td>
        <td>${data.userName}</td>
        <td>${periodo}</td>
        <td>${dettagli}</td>
        <td class="request-status" data-createdat="${createdAt.toISOString()}">
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
        
        saveBtn.addEventListener('click', () => {
            const newStatus = row.querySelector('.status-select').value;
            updateRequestStatus(requestId, newStatus);
        });
        
        deleteBtn.addEventListener('click', () => {
            showConfirmation(
                'Elimina Richiesta',
                'Sei sicuro di voler eliminare definitivamente questa richiesta?',
                () => deleteRequest(requestId)
            );
        });
    }
    
    return row;
}

// Aggiorna stato richiesta
async function updateRequestStatus(requestId, newStatus) {
    try {
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showFeedback('Successo', 'Stato aggiornato con successo!');
        await loadRequests(appState.currentUser, true);
        
    } catch (error) {
        console.error("Errore durante l'aggiornamento:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'aggiornamento');
    }
}

// Elimina richiesta
async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata con successo!');
        await loadRequests(appState.currentUser, true);
        
    } catch (error) {
        console.error("Errore durante l'eliminazione:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'eliminazione');
    }
}

// Gestione invio richieste
// VERSIONE SEMPLIFICATA - Sostituisci le funzioni di submit esistenti:

// Gestione richiesta ferie (versione semplificata)
async function handleFerieSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizio = document.getElementById('ferieDataInizio').value;
    const dataFine = document.getElementById('ferieDataFine').value;
    const giorni = document.getElementById('ferieGiorni').value;
    const submitBtn = elements.ferieForm.querySelector('button[type="submit"]');
    
    // Validazione semplice
    if (!dataInizio || !dataFine) {
        showFeedback('Errore', 'Le date di inizio e fine sono obbligatorie');
        return;
    }
    
    if (new Date(dataFine) < new Date(dataInizio)) {
        showFeedback('Errore', "La data di fine non può essere precedente alla data di inizio");
        return;
    }
    
    const giorniLavorativi = calcolaGiorniLavorativi(new Date(dataInizio), new Date(dataFine));
    
    if (giorniLavorativi <= 0) {
        showFeedback('Errore', "Il periodo selezionato non contiene giorni lavorativi (sabato e domenica non sono considerati)");
        return;
    }

    try {
        setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Ferie',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio: new Date(dataInizio),
            dataFine: new Date(dataFine),
            giorni: giorniLavorativi, // Usa il calcolo corretto
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        elements.ferieForm.reset();
        showFeedback('Successo', `Richiesta ferie inviata con successo! Giorni richiesti: ${giorniLavorativi}`);
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Gestione richiesta malattia (versione semplificata)
async function handleMalattiaSubmit(e) {
    e.preventDefault();
    
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizio = document.getElementById('malattiaDataInizio').value;
    const dataFine = document.getElementById('malattiaDataFine').value;
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato').value;
    const dataCertificato = document.getElementById('malattiaDataCertificato').value;
    const submitBtn = elements.malattiaForm.querySelector('button[type="submit"]');
    
    // Validazione semplice
    if (!dataInizio || !dataFine) {
        showFeedback('Errore', 'Le date di inizio e fine sono obbligatorie');
        return;
    }
    
    if (new Date(dataFine) < new Date(dataInizio)) {
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
        setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Malattia',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            dataInizio: new Date(dataInizio),
            dataFine: new Date(dataFine),
            numeroCertificato: numeroCertificato,
            dataCertificato: new Date(dataCertificato),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        elements.malattiaForm.reset();
        showFeedback('Successo', 'Richiesta malattia inviata con successo!');
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Gestione richiesta permessi (versione semplificata)
async function handlePermessiSubmit(e) {
    e.preventDefault();

    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }

    const data = document.getElementById('permessiData').value;
    const oraInizio = document.getElementById('permessiOraInizio').value;
    const oraFine = document.getElementById('permessiOraFine').value;
    const motivazione = document.getElementById('permessiMotivazione').value;
    const submitBtn = elements.permessiForm.querySelector('button[type="submit"]');

    // Validazione semplice
    if (!data) {
        showFeedback('Errore', "La data del permesso è obbligatoria");
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
        setLoadingState(submitBtn, true);
        
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            data: new Date(data),
            oraInizio: oraInizio,
            oraFine: oraFine,
            motivazione: motivazione,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        elements.permessiForm.reset();
        showFeedback('Successo', 'Richiesta permesso inviata con successo!');
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Funzione generica per invio richieste
async function submitRequest(type, formElement) {
    if (!appState.currentUser) {
        showFeedback('Errore', 'Devi effettuare il login per inviare richieste');
        return;
    }

    const submitBtn = formElement.querySelector('button[type="submit"]');
    const formData = getFormData(formElement, type);
    
    // Validazione
    const validationErrors = validateRequest(formData, type);
    if (validationErrors.length > 0) {
        showFeedback('Errore', validationErrors.join('\n'));
        return;
    }

    try {
        setLoadingState(submitBtn, true);
        
        const requestData = {
            tipo: type,
            userId: appState.currentUser.uid,
            userName: appState.userData.name || appState.currentUser.email,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...formData
        };

        // Conversione date
        if (formData.dataInizio) requestData.dataInizio = new Date(formData.dataInizio);
        if (formData.dataFine) requestData.dataFine = new Date(formData.dataFine);
        if (formData.data) requestData.data = new Date(formData.data);
        if (formData.dataCertificato) requestData.dataCertificato = new Date(formData.dataCertificato);

        await db.collection('richieste').add(requestData);
        
        formElement.reset();
        showFeedback('Successo', `Richiesta ${type.toLowerCase()} inviata con successo!`);
        
        // Ricarica le richieste
        await loadRequests(appState.currentUser, false);
        
    } catch (error) {
        console.error(`Errore invio richiesta ${type}:`, error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'invio della richiesta');
    } finally {
        setLoadingState(submitBtn, false);
    }
}

// Ottiene i dati dal form
function getFormData(formElement, type) {
    const formData = new FormData(formElement);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
        // Rimuovi il prefisso (es: "ferie", "malattia")
        const cleanKey = key.replace(/^(ferie|malattia|permessi)/, '').toLowerCase();
        data[cleanKey] = value;
    }
    
    // Gestione speciale per alcuni campi
    if (type === 'Ferie') {
        data.giorni = parseInt(data.giorni) || 0;
    }
    
    return data;
}

// Gestione Export PDF
async function handleExportPDF() {
    const btn = elements.exportPDF;
    
    try {
        setLoadingState(btn, true);
        await exportToPDF();
    } catch (error) {
        console.error("Errore esportazione PDF:", error);
        showFeedback('Errore', 'Si è verificato un errore durante l\'esportazione');
    } finally {
        setLoadingState(btn, false);
    }
}

// Gestione registrazione dipendente
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
        setLoadingState(elements.registerEmployeeBtn, true);
        
        const result = await registerEmployee(employeeName, employeeEmail);
        showFeedback('Successo', result.message);
        
        // Ricarica lista se visibile
        if (elements.employeesList.style.display === 'block') {
            await loadEmployeesList();
        }
        
    } catch (error) {
        console.error("Errore registrazione dipendente:", error);
        showFeedback('Errore', getAuthErrorMessage(error));
    } finally {
        setLoadingState(elements.registerEmployeeBtn, false);
    }
}

// Registra dipendente
async function registerEmployee(employeeName, employeeEmail, tempPassword = "Union14.it") {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(employeeEmail, tempPassword);
        await userCredential.user.updateProfile({ displayName: employeeName });
        
        await db.collection('users').doc(userCredential.user.uid).set({
            name: employeeName,
            email: employeeEmail,
            role: 'dipendente',
            temporaryPassword: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, message: `Dipendente registrato con successo!` };
    } catch (error) {
        if (auth.currentUser) {
            try {
                await auth.currentUser.delete();
            } catch (deleteError) {
                console.error("Errore durante il rollback:", deleteError);
            }
        }
        throw error;
    }
}

// Mostra/nascondi lista dipendenti
async function toggleEmployeesList() {
    const employeesList = elements.employeesList;
    const btn = elements.showEmployeesBtn;
    const btnText = btn.querySelector('.btn-text');
    
    if (employeesList.style.display === 'none') {
        btnText.textContent = 'Nascondi Dipendenti';
        employeesList.style.display = 'block';
        await loadEmployeesList();
    } else {
        btnText.textContent = 'Visualizza Dipendenti';
        employeesList.style.display = 'none';
    }
}

// Carica lista dipendenti
async function loadEmployeesList() {
    const employeesBody = elements.employeesBody;
    employeesBody.innerHTML = '<tr><td colspan="6">Caricamento in corso...</td></tr>';

    try {
        const snapshot = await db.collection('users').orderBy('name').get();
        employeesList = [];
        
        employeesBody.innerHTML = '';
        
        if (snapshot.empty) {
            employeesBody.innerHTML = '<tr><td colspan="6">Nessun dipendente registrato</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const employeeData = doc.data();
            employeesList.push({ id: doc.id, ...employeeData });
            const row = createEmployeeRow(doc.id, employeeData);
            employeesBody.appendChild(row);
        });
        
    } catch (error) {
        console.error("Errore caricamento dipendenti:", error);
        employeesBody.innerHTML = '<tr><td colspan="6">Errore nel caricamento</td></tr>';
    }
}

// Crea riga dipendente
function createEmployeeRow(employeeId, employeeData) {
    const row = document.createElement('tr');
    
    // Formatta la data di creazione
    const createdAt = employeeData.createdAt ? 
        (employeeData.createdAt.toDate ? employeeData.createdAt.toDate() : new Date(employeeData.createdAt)) : 
        new Date();
    
    const formattedDate = createdAt.toLocaleDateString('it-IT');
    
    // Determina lo stato della password
    const passwordStatus = employeeData.temporaryPassword ? 
        '<span class="status-badge rifiutato">Temporanea</span>' : 
        '<span class="status-badge approvato">Definitiva</span>';
    
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
                ''
            }
        </td>
    `;
    
    // Aggiungi event listeners per i pulsanti
    row.querySelector('.update-role-btn').addEventListener('click', function() {
        const newRole = row.querySelector('.role-select').value;
        updateEmployeeRole(employeeId, newRole);
    });
    
    row.querySelector('.reset-password-btn').addEventListener('click', function() {
        const email = this.getAttribute('data-email');
        resetEmployeePassword(email);
    });
    
    if (employeeData.role !== 'admin') {
        row.querySelector('.delete-employee-btn').addEventListener('click', function() {
            deleteEmployee(employeeId, employeeData.name);
        });
    }
    
    return row;
}

// Aggiorna ruolo dipendente
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
                
                // Se l'utente modificato è quello corrente, ricarica l'UI
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

// Reset password dipendente
async function resetEmployeePassword(email) {
    showConfirmation(
        'Reset Password',
        `Inviare email di reset password a ${email}?`,
        async () => {
            try {
                await auth.sendPasswordResetEmail(email);
                showFeedback('Successo', 'Email di reset password inviata con successo!');
                
                // Aggiorna lo stato della password a temporanea
                const employee = employeesList.find(emp => emp.email === email);
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

// Elimina dipendente
async function deleteEmployee(employeeId, employeeName) {
    showConfirmation(
        'Elimina Dipendente',
        `Sei sicuro di voler eliminare definitivamente il dipendente "${employeeName}"? Questa azione non può essere annullata.`,
        async () => {
            try {
                // 1. Elimina tutte le richieste del dipendente
                const requestsSnapshot = await db.collection('richieste')
                    .where('userId', '==', employeeId)
                    .get();
                
                const batch = db.batch();
                requestsSnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                // 2. Elimina il documento utente
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

// ========== FUNZIONI DI UTILITY ==========

// Validazione email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validazione richiesta
function validateRequest(data, type) {
    const errors = [];
    
    switch(type) {
        case 'Ferie':
            if (!validateDateRange(data.dataInizio, data.dataFine)) {
                errors.push("La data di fine non può essere precedente alla data di inizio");
            }
            if (!data.giorni || data.giorni <= 0) {
                errors.push("Il numero di giorni deve essere positivo");
            }
            break;
        case 'Malattia':
            if (!validateDateRange(data.dataInizio, data.dataFine)) {
                errors.push("La data di fine non può essere precedente alla data di inizio");
            }
            if (!data.numeroCertificato?.trim()) {
                errors.push("Il numero di certificato è obbligatorio");
            }
            break;
        case 'Permesso':
            if (data.oraInizio && data.oraFine && data.oraInizio >= data.oraFine) {
                errors.push("L'ora di fine deve essere successiva all'ora di inizio");
            }
            break;
    }
    
    return errors;
}

// Validazione range date
function validateDateRange(startDate, endDate) {
    return new Date(startDate) <= new Date(endDate);
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

// Formatta data
function formatDate(dateValue) {
    if (!dateValue) return 'N/D';
    
    try {
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString('it-IT');
    } catch (e) {
        console.error("Errore formattazione data:", dateValue, e);
        return 'N/D';
    }
}

// Calcola giorni ferie
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
        
        // Calcola giorni lavorativi (escludendo sabato e domenica)
        const giorniLavorativi = calcolaGiorniLavorativi(inizio, fine);
        
        ferieGiorni.value = giorniLavorativi;
        
        // Aggiorna il tooltip con informazioni dettagliate
        if (giorniHelp) {
            const giorniTotali = Math.ceil((fine - inizio) / (1000 * 60 * 60 * 24)) + 1;
            const weekendDays = giorniTotali - giorniLavorativi;
            giorniHelp.textContent = `${giorniLavorativi} giorni lavorativi (esclusi ${weekendDays} giorni di weekend)`;
        }
    } else {
        if (giorniHelp) {
            giorniHelp.textContent = 'Calcolo automatico basato sulle date selezionate';
        }
    }
}

// AGGIUNGI questa nuova funzione per calcolare i giorni lavorativi:
function calcolaGiorniLavorativi(dataInizio, dataFine) {
    let giorniLavorativi = 0;
    const dataCorrente = new Date(dataInizio);
    
    // Imposta l'ora a mezzanotte per evitare problemi con il fuso orario
    dataCorrente.setHours(0, 0, 0, 0);
    const fine = new Date(dataFine);
    fine.setHours(0, 0, 0, 0);
    
    // Itera attraverso ogni giorno nel range
    while (dataCorrente <= fine) {
        const giornoSettimana = dataCorrente.getDay(); // 0 = Domenica, 6 = Sabato
        
        // Conta solo i giorni da lunedì a venerdì (1-5)
        if (giornoSettimana !== 0 && giornoSettimana !== 6) {
            giorniLavorativi++;
        }
        
        // Passa al giorno successivo
        dataCorrente.setDate(dataCorrente.getDate() + 1);
    }
    
    return giorniLavorativi;
}

// Gestione tab switch
function handleTabSwitch(e) {
    const tabId = this.getAttribute('data-tab');
    
    // Rimuovi active da tutti
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Aggiungi active al selezionato
    this.classList.add('active');
    this.setAttribute('aria-selected', 'true');
    document.getElementById(tabId).classList.add('active');
}

// ========== GESTIONE STATI UI ==========

// Set loading state per elementi specifici
function setLoadingState(element, isLoading) {
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

// Set loading state per l'app intera
function setAppLoadingState(isLoading) {
    appState.isLoading = isLoading;
    document.body.style.opacity = isLoading ? '0.7' : '1';
    document.body.style.pointerEvents = isLoading ? 'none' : 'auto';
}

// Show main app
function showMainApp(user) {
    elements.loginContainer.style.display = 'none';
    elements.mainContainer.style.display = 'block';
    elements.richiesteDiv.style.display = 'block';
    announceToScreenReader('Accesso effettuato con successo');
}

// Show login
function showLogin() {
    elements.loginContainer.style.display = 'flex';
    elements.mainContainer.style.display = 'none';
    elements.richiesteDiv.style.display = 'none';
    elements.loginForm.style.display = 'block';
    elements.registerForm.style.display = 'none';
    showError('');
}

// Show register form
function showRegisterForm(e) {
    e.preventDefault();
    elements.loginForm.style.display = 'none';
    elements.registerForm.style.display = 'block';
    showError('');
}

// Show login form
function showLoginForm(e) {
    e.preventDefault();
    elements.registerForm.style.display = 'none';
    elements.loginForm.style.display = 'block';
    showError('');
}

// Show error
function showError(message) {
    elements.loginError.textContent = message;
    elements.loginError.style.display = message ? 'block' : 'none';
}

// ========== GESTIONE MODALI ==========

// Show confirmation modal
function showConfirmation(title, message, onConfirm) {
    document.getElementById('confirmationTitle').textContent = title;
    document.getElementById('confirmationMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmAction');
    confirmBtn.onclick = () => {
        closeModal(elements.confirmationDialog);
        onConfirm();
    };
    
    elements.confirmationDialog.showModal();
}

// Show feedback modal
function showFeedback(title, message) {
    document.getElementById('feedbackTitle').textContent = title;
    document.getElementById('feedbackMessage').textContent = message;
    elements.feedbackDialog.showModal();
}

// Close modal
function closeModal(modal) {
    modal.close();
}

// ========== SCREEN READER ==========

// Announce to screen reader
function announceToScreenReader(message) {
    elements.srAnnouncement.textContent = message;
    
    // Clear after a delay
    setTimeout(() => {
        elements.srAnnouncement.textContent = '';
    }, 3000);
}

// ========== PAGINAZIONE ==========

// Update pagination controls
function updatePaginationControls() {
    const totalPages = Math.ceil(appState.totalRequests / appState.pageSize);
    
    elements.pageInfo.textContent = `Pagina ${appState.currentPage} di ${totalPages}`;
    elements.prevPage.disabled = appState.currentPage <= 1;
    elements.nextPage.disabled = appState.currentPage >= totalPages;
    
    elements.paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';
}

// Go to previous page
function goToPreviousPage() {
    if (appState.currentPage > 1) {
        appState.currentPage--;
        loadRequests(appState.currentUser, appState.userRole === 'admin');
    }
}

// Go to next page
function goToNextPage() {
    const totalPages = Math.ceil(appState.totalRequests / appState.pageSize);
    if (appState.currentPage < totalPages) {
        appState.currentPage++;
        loadRequests(appState.currentUser, appState.userRole === 'admin');
    }
}

// ========== TABLE STATES ==========

// Show table loading
function showTableLoading(tableBody) {
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                <div class="loading-spinner"></div>
                Caricamento in corso...
            </td>
        </tr>`;
}

// Show table error
function showTableError(tableBody, error) {
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="error text-center">
                ❌ Errore nel caricamento: ${error.message}
                <button onclick="loadRequests(appState.currentUser, appState.userRole === 'admin')" 
                        class="btn btn-retry">
                    Riprova
                </button>
            </td>
        </tr>`;
}

// ========== ESPORTAZIONE PDF ==========

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Titolo
    doc.setFontSize(18);
    doc.text('Elenco Richieste', 105, 15, { align: 'center' });
    
    // Data generazione
    doc.setFontSize(10);
    doc.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 14, 25);
    
    // Intestazioni tabella
    const headers = [
        ["Tipo", "Dipendente", "Periodo", "Dettagli", "Stato", "Data Creazione"]
    ];
    
    // Dati della tabella
    const rows = [];
    document.querySelectorAll('#richiesteBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            const createdAt = cells[4].getAttribute('data-createdat');
            const dateObj = new Date(createdAt);
            
            rows.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                dateObj.toLocaleDateString('it-IT')
            ]);
        }
    });
    
    // Genera la tabella
    doc.autoTable({
        head: headers,
        body: rows,
        startY: 30,
        styles: {
            fontSize: 8,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [66, 133, 244],
            textColor: 255
        }
    });
    
    // Salva il PDF
    const dateStr = new Date().toISOString().slice(0, 10);
    doc.save(`richieste_${dateStr}.pdf`);
}

function exportToPDF() {
    const btn = document.getElementById('exportPDF');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparando PDF...';
    
    // Verifica se le librerie sono già caricate
    if (typeof window.jspdf !== 'undefined' && typeof new window.jspdf.jsPDF().autoTable === 'function') {
        generatePDF();
        btn.disabled = false;
        btn.textContent = originalText;
        return;
    }
    
    // Caricamento dinamico
    const script1 = document.createElement('script');
    script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    
    const script2 = document.createElement('script');
    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';

    script1.onload = () => {
        script2.onload = () => {
            generatePDF();
            btn.disabled = false;
            btn.textContent = originalText;
        };
        script2.onerror = () => {
            alert('Errore nel caricamento del plugin per le tabelle');
            btn.disabled = false;
            btn.textContent = originalText;
        };
        document.head.appendChild(script2);
    };
    
    script1.onerror = () => {
        alert('Errore nel caricamento della libreria PDF');
        btn.disabled = false;
        btn.textContent = originalText;
    };
    
    document.head.appendChild(script1);
}

// ========== GESTIONE UTENTI MANCANTI ==========

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
            return 'Errore di rete';
        default:
            return `Errore: ${error.message}`;
    }
}
