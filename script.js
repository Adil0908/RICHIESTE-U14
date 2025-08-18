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

// Elementi UI
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerLink = document.getElementById('registerLink');
const loginLink = document.getElementById('loginLink');
const resetPasswordLink = document.getElementById('resetPasswordLink');
const logoutBtn = document.getElementById('logoutBtn');
const richiesteDiv = document.getElementById('richiesteInviate');
const loginContainer = document.getElementById('loginContainer');
const mainContainer = document.getElementById('mainContainer');
const ferieForm = document.getElementById('ferieForm');
const malattiaForm = document.getElementById('malattiaForm');
const permessiForm = document.getElementById('permessiForm');
const exportDataBtn = document.getElementById('exportDataBtn');
const manageUsersBtn = document.getElementById('manageUsersBtn');
// Variabili globali
let currentFilters = {
    type: '',
    employee: '',
    year: '',
    month: '',  // Aggiunto il filtro mese
    status: ''
};

// In initFilters()
function initFilters() {
    // Mostra la sezione filtri per gli admin
    document.getElementById('adminFilters').style.display = 'block';
    
    // Resetta i valori dei filtri
    document.getElementById('filterType').value = '';
    document.getElementById('filterEmployee').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterStatus').value = '';
    
    // Setup event listeners
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Ricerca in tempo reale per nome dipendente
    document.getElementById('filterEmployee').addEventListener('input', function() {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            applyFilters();
        }, 300);
    });
    
    console.log("Filtri inizializzati correttamente");
}
// Alterna tra login e registrazione
registerLink.addEventListener('click', function(e) {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    loginError.textContent = '';
});

loginLink.addEventListener('click', function(e) {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    loginError.textContent = '';
});

// Login con Firebase
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            loginError.textContent = '';
            showMainApp(userCredential.user);
            setupUI(userCredential.user);
        })
        .catch((error) => {
            loginError.textContent = getAuthErrorMessage(error);
        });
});

// Registrazione con Firebase
// ...existing code...

registerForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Aggiorna il profilo Firebase Auth
            return userCredential.user.updateProfile({ displayName: name }).then(() => userCredential);
        })
        .then((userCredential) => {
            // CREA SUBITO IL DOCUMENTO NELLA COLLEZIONE USERS
            return db.collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email,
                role: 'dipendente' // o 'admin' se vuoi creare un admin
            });
        })
        .then(() => {
            registerForm.reset();
            showMainApp(auth.currentUser);
            setupUI(auth.currentUser);
        })
        .catch((error) => {
            loginError.textContent = getAuthErrorMessage(error);
        });
});



// Reset password
resetPasswordLink.addEventListener('click', function(e) {
    e.preventDefault();
    const email = prompt("Inserisci la tua email per reimpostare la password:");
    
    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert("Email per il reset della password inviata!");
            })
            .catch((error) => {
                alert(getAuthErrorMessage(error));
            });
    }
});

// Logout
logoutBtn.addEventListener('click', function() {
    auth.signOut().then(() => {
        showLogin();
    }).catch((error) => {
        console.error("Errore durante il logout:", error);
    });
});

// Mostra/nascondi UI in base all'autenticazione
// Gestione dell'autenticazione




auth.onAuthStateChanged(async (user) => {
    try {
        if (user) {
            console.log("Utente autenticato:", user.uid);
            
            // 1. Verifica esistenza documento utente
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            // 2. Se il documento non esiste, crealo
            if (!userDoc.exists) {
                await db.collection('users').doc(user.uid).set({
                    name: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    role: 'dipendente',
                    temporaryPassword: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                // Ricarica per applicare i cambiamenti
                location.reload();
                return;
            }
            
            // 3. Configura l'UI con i dati dell'utente
            await setupUI(user, userDoc.data());
            
        } else {
            showLogin();
        }
    } catch (error) {
        console.error("Errore gestione auth state:", error);
        showLogin();
    }
});
async function handleMissingUserDocument(user) {
    try {
        console.log("Creazione documento per utente:", user.uid);
        
        const newUserDoc = {
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: 'dipendente',
            temporaryPassword: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('users').doc(user.uid).set(newUserDoc);
        console.log("Documento creato con successo");
        
        // Ricarica la pagina per applicare i cambiamenti
        location.reload();
        
    } catch (error) {
        console.error("Errore creazione documento:", error);
        await auth.signOut();
        throw new Error("Impossibile completare la registrazione automatica");
    }
}

async function createMissingUserDocument(user) {
    try {
        await db.collection('users').doc(user.uid).set({
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            role: 'dipendente', // Ruolo di default
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
// Sostituisci le due definizioni con una sola
function showMainApp(user) {
    // Verifica che l'oggetto user esista e abbia le proprietà necessarie
    if (!user || typeof user !== 'object') {
        console.error("Oggetto utente non valido:", user);
        showLogin();
        return;
    }

    loginContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    richiesteDiv.style.display = 'block';
    
    // Usa il nome più appropriato disponibile
    const userName = user.displayName || user.email || 'Utente';
    document.getElementById('loggedInUser').textContent = `Benvenuto, ${userName}`;
    
    // Imposta i valori nei form solo se esistono
    const nameToUse = user.displayName || '';
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = nameToUse;
        }
    });
}

// SOSTITUISCI le due definizioni di showLogin() con questa unica versione:
function showLogin() {
    loginContainer.style.display = 'flex';
    mainContainer.style.display = 'none';
    richiesteDiv.style.display = 'none';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loginError.textContent = '';
    document.getElementById('richiesteBody').innerHTML = '';
}

async function setupUI(user, userData) {
    try {
        // Verifica robusta degli input
        if (!user || typeof user !== 'object') {
            throw new Error("Oggetto utente non valido");
        }
        
        if (!userData || typeof userData !== 'object') {
            const doc = await db.collection('users').doc(user.uid).get();
            if (!doc.exists) throw new Error("Profilo utente non trovato");
            userData = doc.data();
        }

        const isAdmin = userData.role === 'admin';
        
        // Configura elementi UI in base al ruolo
        document.getElementById('adminControls').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('requestForms').style.display = isAdmin ? 'none' : 'block';
        document.getElementById('adminFilters').style.display = isAdmin ? 'block' : 'none';
        
        // Inizializza i filtri solo per admin
        if (isAdmin) {
            initFilters();
        }
        
        // Mostra l'app principale
        showMainApp(user);
        
        // Carica le richieste
        await loadRequests(user, isAdmin);
        
    } catch (error) {
        console.error("Errore setup UI:", error);
        await auth.signOut();
        showLogin();
        alert("Errore nel caricamento dell'interfaccia. Per favore, accedi di nuovo.");
    }
}

function setFormUserValues(userName) {
    const forms = ['ferie', 'malattia', 'permessi'];
    forms.forEach(formType => {
        const field = document.getElementById(`${formType}Nome`);
        if (field) {
            field.value = userName || '';
            if (field.readOnly) {
                field.style.backgroundColor = '#f5f5f5';
            }
        }
    });
}

// Applica i filtri
function applyFilters() {
    currentFilters = {
        type: document.getElementById('filterType').value,
        employee: document.getElementById('filterEmployee').value.trim(),
        year: document.getElementById('filterYear').value,
        month: document.getElementById('filterMonth').value,
        status: document.getElementById('filterStatus').value
    };
    
    // Se è selezionato il mese ma non l'anno, usa l'anno corrente
    if (currentFilters.month && !currentFilters.year) {
        currentFilters.year = new Date().getFullYear().toString();
        document.getElementById('filterYear').value = currentFilters.year;
    }
    
    loadRequests(auth.currentUser, true);
}
   
// Resetta i filtri
function resetFilters() {
    document.getElementById('filterType').value = '';
    document.getElementById('filterEmployee').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';  // Reset del mese
    document.getElementById('filterStatus').value = '';
    
    currentFilters = {
        type: '',
        employee: '',
        year: '',
        month: '',  // Reset del mese
        status: ''
    };
    
    loadRequests(auth.currentUser, true);
}

// Funzione di debug per verificare le date delle richieste
async function debugCheckDates() {
    const snapshot = await db.collection('richieste').get();
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Tipo: ${data.tipo}`);
        
        if (data.tipo === 'Permesso') {
            console.log('Data permesso:', data.data?.toDate?.() || data.data);
        } else {
            console.log('Data inizio:', data.dataInizio?.toDate?.() || data.dataInizio);
        }
    });
}


// Modifica la funzione loadRequests per supportare i filtri
async function loadRequests(user, isAdmin) {
    const richiesteBody = document.getElementById('richiesteBody');
    richiesteBody.innerHTML = '<tr><td colspan="6">Caricamento in corso...</td></tr>';

    try {
        let query = db.collection('richieste');
        
        // Filtro base per ruolo
        if (!isAdmin) {
            query = query.where('userId', '==', user.uid);
        } else {
            // Filtri admin
            if (currentFilters.type) {
                query = query.where('tipo', '==', currentFilters.type);
            }
            if (currentFilters.status) {
                query = query.where('stato', '==', currentFilters.status);
            }
        }
        
        // Gestione separata dei filtri temporali
        if (currentFilters.year || currentFilters.month) {
            const year = currentFilters.year ? parseInt(currentFilters.year) : new Date().getFullYear();
            const month = currentFilters.month ? parseInt(currentFilters.month) - 1 : 0;
            
            const startDate = new Date(year, month, 1);
            const endDate = currentFilters.month 
                ? new Date(year, month + 1, 1) 
                : new Date(year + 1, 0, 1);
            
            // Determiniamo il campo data corretto in base al tipo
            const dateField = currentFilters.type === 'Permesso' ? 'data' : 'dataInizio';
            
            // Applica il filtro temporale con un unico orderBy
            query = query.orderBy(dateField, 'desc')
                         .where(dateField, '>=', startDate)
                         .where(dateField, '<', endDate);
        }
        
        // Se non ci sono filtri temporali, ordina per createdAt
        if (!currentFilters.year && !currentFilters.month) {
            query = query.orderBy('createdAt', 'desc');
        }
        
        const snapshot = await query.get();
        
        // Filtro lato client per nome (se necessario)
        let filteredDocs = snapshot.docs;
        if (isAdmin && currentFilters.employee) {
            const searchTerm = currentFilters.employee.toLowerCase();
            filteredDocs = filteredDocs.filter(doc => {
                const userName = doc.data().userName?.toLowerCase() || '';
                return userName.includes(searchTerm);
            });
        }
        
        // Aggiorna la tabella
        richiesteBody.innerHTML = '';
        if (filteredDocs.length === 0) {
            richiesteBody.innerHTML = '<tr><td colspan="6">Nessuna richiesta trovata</td></tr>';
            return;
        }
        
        filteredDocs.forEach(doc => {
            const row = createRequestRow(doc.id, doc.data(), isAdmin);
            richiesteBody.appendChild(row);
        });
        
    } catch (error) {
        console.error("Errore caricamento richieste:", error);
        richiesteBody.innerHTML = `
            <tr>
                <td colspan="6" class="error">
                    Errore nel caricamento: ${error.message}
                </td>
            </tr>`;
    }
}
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

// ... (continua con le altre funzioni come createRequestRow, updateRequestStatus, etc.)

// Funzione per creare una riga della tabella
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
 console.log('Dati richiesta:', {
        id: requestId,
        tipo: data.tipo,
        data: data.data?.toDate?.() || data.data,
        dataInizio: data.dataInizio?.toDate?.() || data.dataInizio,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
    });
    // Gestione sicura della data di creazione
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
            <span class="status-badge ${data.stato.toLowerCase()}">${data.stato}</span>
        </td>
        ${isAdmin ? `
        <td>
            <select class="status-select" data-request-id="${requestId}">
                <option value="In attesa" ${data.stato === 'In attesa' ? 'selected' : ''}>In attesa</option>
                <option value="Approvato" ${data.stato === 'Approvato' ? 'selected' : ''}>Approvato</option>
                <option value="Rifiutato" ${data.stato === 'Rifiutato' ? 'selected' : ''}>Rifiutato</option>
            </select>
            <button class="save-status-btn" data-request-id="${requestId}">Salva</button>
            <button class="delete-request-btn" data-request-id="${requestId}">Elimina</button>
        </td>
        ` : ''}
    `;

    if (isAdmin) {
        row.querySelector('.save-status-btn').addEventListener('click', () => {
            const newStatus = row.querySelector('.status-select').value;
            updateRequestStatus(requestId, newStatus);
        });
        
        row.querySelector('.delete-request-btn').addEventListener('click', () => {
            if (confirm('Sei sicuro di voler eliminare questa richiesta?')) {
                deleteRequest(requestId);
            }
        });
    }
    
    return row;
}
// Funzione helper per formattare le date
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
// Funzioni per aggiornare/eliminare richieste
function updateRequestStatus(requestId, newStatus) {
    db.collection('richieste').doc(requestId).update({
        stato: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        alert('Stato aggiornato con successo!');
    })
    .catch(error => {
        console.error("Errore durante l'aggiornamento:", error);
        alert('Si è verificato un errore durante l\'aggiornamento');
    });
}

function deleteRequest(requestId) {
     if (!confirm('Sei sicuro di voler eliminare definitivamente questa richiesta?')) {
        return;
    }
    db.collection('richieste').doc(requestId).delete()
    .then(() => {
        alert('Richiesta eliminata con successo!');
    })
    .catch(error => {
        console.error("Errore durante l'eliminazione:", error);
        alert('Si è verificato un errore durante l\'eliminazione');
    });
}



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



async function registerEmployee(employeeName, employeeEmail, tempPassword = "Union14.it") {
    try {
        // 1. Crea l'account di autenticazione
        const userCredential = await auth.createUserWithEmailAndPassword(employeeEmail, tempPassword);
        
        // 2. Aggiorna il profilo con il nome
        await userCredential.user.updateProfile({ displayName: employeeName });
        
        // 3. Crea il documento utente in Firestore
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
        // Rollback: elimina l'utente se la creazione fallisce
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

// Gestione del click sul pulsante
document.getElementById('registerEmployeeBtn').addEventListener('click', async function() {
    const employeeName = prompt("Nome completo dipendente:");
    if (!employeeName?.trim()) {
        alert("Nome obbligatorio");
        return;
    }
    
    const employeeEmail = prompt("Email dipendente:");
    if (!employeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeEmail)) {
        alert("Email non valida");
        return;
    }

    const btn = this;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Registrazione in corso...";

    try {
        const result = await registerEmployee(employeeName, employeeEmail);
        alert(result.message);
    } catch (error) {
        console.error("Errore registrazione:", error);
        alert(`Errore: ${getAuthErrorMessage(error)}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});
function getAuthErrorMessage(error) {
    const errorMap = {
        'auth/email-already-in-use': 'Email già registrata',
        'auth/invalid-email': 'Email non valida',
        'auth/operation-not-allowed': 'Operazione non permessa',
        'auth/weak-password': 'Password troppo debole',
        'auth/user-disabled': 'Account disabilitato',
        'auth/user-not-found': 'Utente non trovato',
        'auth/network-request-failed': 'Errore di rete'
    };
    
    return errorMap[error.code] || error.message;
}
document.addEventListener('DOMContentLoaded', function() {
    showLogin();
    // Gestione dei tab
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Rimuovi la classe active da tutti i bottoni e contenuti
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Aggiungi la classe active al bottone e al contenuto selezionato
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
   // Sostituisci le funzioni di invio richieste con queste:

// Gestione richiesta ferie
ferieForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!auth.currentUser) {
        alert('Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizio = document.getElementById('ferieDataInizio').value;
    const dataFine = document.getElementById('ferieDataFine').value;
    const giorni = document.getElementById('ferieGiorni').value;
    
    try {
        await db.collection('richieste').add({
            tipo: 'Ferie',
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || auth.currentUser.email,
            dataInizio: new Date(dataInizio),
            dataFine: new Date(dataFine),
            giorni: parseInt(giorni),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        
        ferieForm.reset();
        alert('Richiesta ferie inviata con successo!');
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        alert('Si è verificato un errore durante l\'invio della richiesta');
    }
});

// Gestione richiesta malattia
malattiaForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!auth.currentUser) {
        alert('Devi effettuare il login per inviare richieste');
        return;
    }
    
    const dataInizio = document.getElementById('malattiaDataInizio').value;
    const dataFine = document.getElementById('malattiaDataFine').value;
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato').value;
    const dataCertificato = document.getElementById('malattiaDataCertificato').value;
    
    try {
        await db.collection('richieste').add({
            tipo: 'Malattia',
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || auth.currentUser.email,
            dataInizio: new Date(dataInizio),
            dataFine: new Date(dataFine),
            numeroCertificato: numeroCertificato,
            dataCertificato: new Date(dataCertificato),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        
        malattiaForm.reset();
        alert('Richiesta malattia inviata con successo!');
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        alert('Si è verificato un errore durante l\'invio della richiesta');
    }
});

// Gestione richiesta permessi
permessiForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!auth.currentUser) {
        alert('Devi effettuare il login per inviare richieste');
        return;
    }

    const data = document.getElementById('permessiData').value;
    const oraInizio = document.getElementById('permessiOraInizio').value;
    const oraFine = document.getElementById('permessiOraFine').value;
    const motivazione = document.getElementById('permessiMotivazione').value;

    try {
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || auth.currentUser.email,
            data: new Date(data),
            oraInizio: oraInizio,
            oraFine: oraFine,
            motivazione: motivazione,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        permessiForm.reset();
        alert('Richiesta permesso inviata con successo!');
    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        alert('Si è verificato un errore durante l\'invio della richiesta');
    }
});







   // Calcolo automatico dei giorni di ferie
    const ferieDataInizio = document.getElementById('ferieDataInizio');
    const ferieDataFine = document.getElementById('ferieDataFine');
    const ferieGiorni = document.getElementById('ferieGiorni');
    
    ferieDataInizio.addEventListener('change', calcolaGiorni);
    ferieDataFine.addEventListener('change', calcolaGiorni);
    
    function calcolaGiorni() {
        if (ferieDataInizio.value && ferieDataFine.value) {
            const inizio = new Date(ferieDataInizio.value);
            const fine = new Date(ferieDataFine.value);
            
            if (fine < inizio) {
                alert("La data di fine non può essere precedente alla data di inizio");
                ferieDataFine.value = '';
                return;
            }
            
            const diffTime = fine - inizio;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            
            ferieGiorni.value = diffDays;
        }
    }
});


async function repairUserDocuments() {
    try {
        console.log("Inizio riparazione documenti utente...");
        
        // Ottieni tutti gli utenti autenticati
        const { users } = await auth.listUsers();
        
        const batch = db.batch();
        let created = 0;
        let updated = 0;

        for (const userRecord of users) {
            const userRef = db.collection('users').doc(userRecord.uid);
            const doc = await userRef.get();
            
            if (!doc.exists) {
                batch.set(userRef, {
                    name: userRecord.displayName || userRecord.email.split('@')[0],
                    email: userRecord.email,
                    role: 'dipendente',
                    temporaryPassword: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                created++;
            } else {
                const updates = {};
                const data = doc.data();
                
                if (!data.name) updates.name = userRecord.displayName || userRecord.email.split('@')[0];
                if (!data.email) updates.email = userRecord.email;
                if (!data.role) updates.role = 'dipendente';
                if (data.temporaryPassword === undefined) updates.temporaryPassword = false;
                if (!data.createdAt) updates.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                
                updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                
                if (Object.keys(updates).length > 1) {
                    batch.update(userRef, updates);
                    updated++;
                }
            }
        }
        
        await batch.commit();
        console.log(`Riparazione completata. Creati: ${created}, Aggiornati: ${updated}`);
        return { success: true, created, updated };
        
    } catch (error) {
        console.error("Errore durante la riparazione:", error);
        return { success: false, error: error.message };
    }
}
