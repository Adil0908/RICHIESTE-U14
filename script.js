import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";


// Configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAVlSo3W578ClzYE4z2qLQfaNaDIk41USI",
  authDomain: "richieste-u14.firebaseapp.com",
  projectId: "richieste-u14",
  storageBucket: "richieste-u14.firebasestorage.app",
  messagingSenderId: "219335255474",
  appId: "1:219335255474:web:b2c411230db39031bf30ab",
  measurementId: "G-0ZP39RC7HL"
};

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();       
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Verifica se l'utente è admin o dipendente
            return db.collection('employees').doc(userCredential.user.uid).get();
        })
        .then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                if (userData.isAdmin) {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'employee.html';
                }
            } else {
                throw new Error('Utente non registrato');
            }
        })
        .catch((error) => {
            document.getElementById('loginError').textContent = error.message;
        });
});
// Gestione tab
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Carica richieste
function loadRequests(filters = {}) {
    let query = db.collection('requests');
    
    if (filters.type) query = query.where('type', '==', filters.type);
    if (filters.year) query = query.where('year', '==', parseInt(filters.year));
    
    query.get().then((querySnapshot) => {
        const tbody = document.querySelector('#requestsTable tbody');
        tbody.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const request = doc.data();
            const row = document.createElement('tr');
            
            // Filtro per nome (lato client per semplicità)
            if (filters.name && !`${request.firstName} ${request.lastName}`.toLowerCase().includes(filters.name.toLowerCase())) {
                return;
            }
            
            row.innerHTML = `
                <td>${request.firstName}</td>
                <td>${request.lastName}</td>
                <td>${request.type}</td>
                <td>${formatRequestDate(request)}</td>
                <td><span class="status-badge ${request.status}">${request.status}</span></td>
                <td>
                    <button class="action-btn view" data-id="${doc.id}"><i class="fas fa-eye"></i></button>
                    <button class="action-btn edit" data-id="${doc.id}"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Aggiungi event listeners ai pulsanti
        addRequestActionListeners();
    });
}

// Formatta la data in base al tipo di richiesta
function formatRequestDate(request) {
    switch(request.type) {
        case 'permesso':
            return `${request.date} (${request.hours} ore)`;
        case 'ferie':
            return `Dal ${request.startDate} al ${request.endDate}`;
        case 'malattia':
            return `Dal ${request.startDate} al ${request.endDate}`;
        default:
            return '';
    }
}

// Filtri
document.getElementById('applyFilters').addEventListener('click', () => {
    const filters = {
        type: document.getElementById('filterType').value,
        name: document.getElementById('filterName').value,
        year: document.getElementById('filterYear').value
    };
    
    loadRequests(filters);
});

// Esporta PDF (utilizzando jsPDF)
document.getElementById('exportPdf').addEventListener('click', () => {
    // Implementa l'esportazione PDF qui
    // Puoi usare la libreria jsPDF
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
});

// Carica le richieste all'avvio
auth.onAuthStateChanged(user => {
    if (user) {
        db.collection('employees').doc(user.uid).get()
            .then(doc => {
                if (doc.exists && doc.data().isAdmin) {
                    loadRequests();
                    loadEmployees();
                } else {
                    window.location.href = 'index.html';
                }
            });
    } else {
        window.location.href = 'index.html';
    }
});
// Gestione tipo di richiesta
document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.request-form').forEach(f => f.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.type).classList.add('active');
    });
});

// Invia richiesta permesso
document.getElementById('permissionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitRequest('permesso', {
        date: document.getElementById('permissionDate').value,
        hours: document.getElementById('permissionHours').value,
        reason: document.getElementById('permissionReason').value
    });
});

// Invia richiesta ferie
document.getElementById('holidayForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitRequest('ferie', {
        startDate: document.getElementById('holidayStart').value,
        endDate: document.getElementById('holidayEnd').value,
        reason: document.getElementById('holidayReason').value
    });
});

// Invia segnalazione malattia
document.getElementById('sicknessForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitRequest('malattia', {
        startDate: document.getElementById('sicknessStart').value,
        endDate: document.getElementById('sicknessEnd').value,
        medicalCert: document.getElementById('medicalCert').value,
        certDate: document.getElementById('certDate').value
    });
});

// Funzione generica per inviare richieste
function submitRequest(type, data) {
    const user = auth.currentUser;
    
    if (user) {
        db.collection('employees').doc(user.uid).get()
            .then(doc => {
                if (doc.exists) {
                    const employee = doc.data();
                    const requestData = {
                        type,
                        ...data,
                        employeeId: user.uid,
                        firstName: employee.firstName,
                        lastName: employee.lastName,
                        status: 'in attesa',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        year: new Date().getFullYear()
                    };
                    
                    return db.collection('requests').add(requestData);
                }
            })
            .then(() => {
                alert('Richiesta inviata con successo!');
                loadMyRequests();
                // Resetta i form
                document.querySelectorAll('form').forEach(form => form.reset());
            })
            .catch(error => {
                console.error('Errore:', error);
                alert('Si è verificato un errore durante l\'invio della richiesta');
            });
    }
}

// Carica le richieste del dipendente
function loadMyRequests() {
    const user = auth.currentUser;
    
    if (user) {
        db.collection('requests')
            .where('employeeId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .get()
            .then(querySnapshot => {
                const tbody = document.querySelector('#myRequestsTable tbody');
                tbody.innerHTML = '';
                
                querySnapshot.forEach(doc => {
                    const request = doc.data();
                    const row = document.createElement('tr');
                    
                    row.innerHTML = `
                        <td>${request.type}</td>
                        <td>${formatRequestDate(request)}</td>
                        <td><span class="status-badge ${request.status}">${request.status}</span></td>
                        <td>${request.createdAt?.toDate().toLocaleDateString() || ''}</td>
                    `;
                    
                    tbody.appendChild(row);
                });
            });
    }
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
});

// Carica i dati all'avvio
auth.onAuthStateChanged(user => {
    if (user) {
        db.collection('employees').doc(user.uid).get()
            .then(doc => {
                if (doc.exists && !doc.data().isAdmin) {
                    const employee = doc.data();
                    document.getElementById('userName').textContent = `${employee.firstName} ${employee.lastName}`;
                    loadMyRequests();
                } else {
                    window.location.href = 'index.html';
                }
            });
    } else {
        window.location.href = 'index.html';
    }
});
