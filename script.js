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

// Riferimenti ai servizi Firebase
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
// Gestione autenticazione
let currentUser = null;

// Ascolta cambiamenti nello stato di autenticazione
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        // Utente loggato
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.email;
        
        // Verifica se l'utente è admin
        checkUserRole(user.uid);
        
        // Carica i dati dell'utente
        loadUserData();
    } else {
        // Utente non loggato
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('dashboard-section').classList.add('hidden');
    }
});

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert('Errore di accesso: ' + error.message);
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// Verifica ruolo utente
async function checkUserRole(uid) {
    const userDoc = await db.collection('dipendenti').doc(uid).get();
    if (userDoc.exists && userDoc.data().ruolo === 'admin') {
        // Mostra tab admin e reports
        document.querySelectorAll('[data-role="admin"]').forEach(el => {
            el.classList.remove('hidden');
        });
    }
}
// Operazioni sul database
async function loadUserData() {
    if (!currentUser) return;
    
    // Carica le richieste dell'utente
    const requestsQuery = db.collection('richieste')
        .where('dipendenteId', '==', currentUser.uid)
        .orderBy('dataInizio', 'desc');
    
    const requestsSnapshot = await requestsQuery.get();
    
    const requestsList = document.getElementById('requests-list');
    requestsList.innerHTML = '';
    
    requestsSnapshot.forEach(doc => {
        const request = doc.data();
        requestsList.appendChild(createRequestCard(request));
    });
    
    // Se admin, carica le richieste in attesa
    if (document.querySelector('[data-role="admin"]:not(.hidden)')) {
        loadPendingRequests();
        loadEmployees();
    }
}

function createRequestCard(request) {
    const card = document.createElement('div');
    card.className = 'request-card';
    
    const typeMap = {
        'ferie': 'Ferie',
        'permesso': 'Permesso',
        'malattia': 'Malattia'
    };
    
    const statusMap = {
        'in attesa': 'status-pending',
        'approvato': 'status-approved',
        'rifiutato': 'status-rejected'
    };
    
    const startDate = request.dataInizio.toDate().toLocaleDateString();
    const endDate = request.dataFine ? request.dataFine.toDate().toLocaleDateString() : startDate;
    
    card.innerHTML = `
        <div class="request-info">
            <div class="request-type">${typeMap[request.tipo]}</div>
            <div class="request-dates">${startDate} - ${endDate}</div>
            ${request.ore ? `<div class="request-hours">${request.ore} ore</div>` : ''}
            ${request.note ? `<div class="request-notes">${request.note}</div>` : ''}
        </div>
        <div class="request-status ${statusMap[request.stato]}">${request.stato}</div>
    `;
    
    return card;
}

async function loadPendingRequests() {
    const pendingQuery = db.collection('richieste')
        .where('stato', '==', 'in attesa')
        .orderBy('dataRichiesta', 'desc');
    
    const pendingSnapshot = await pendingQuery.get();
    
    const pendingList = document.getElementById('pending-requests-list');
    pendingList.innerHTML = '';
    
    // Precarica i dati dei dipendenti
    const employeesSnapshot = await db.collection('dipendenti').get();
    const employees = {};
    employeesSnapshot.forEach(doc => {
        employees[doc.id] = doc.data();
    });
    
    pendingSnapshot.forEach(doc => {
        const request = doc.data();
        const employee = employees[request.dipendenteId] || { nome: 'N/A', cognome: '' };
        
        const card = document.createElement('div');
        card.className = 'request-card';
        card.innerHTML = `
            <div class="request-info">
                <div class="request-type">${employee.nome} ${employee.cognome}</div>
                <div class="request-dates">${request.dataInizio.toDate().toLocaleDateString()}</div>
                <div>${request.tipo}</div>
            </div>
            <div class="request-actions">
                <button class="btn btn-secondary approve-btn" data-id="${doc.id}">Approva</button>
                <button class="btn btn-danger reject-btn" data-id="${doc.id}">Rifiuta</button>
            </div>
        `;
        
        pendingList.appendChild(card);
    });
    
    // Aggiungi event listeners ai pulsanti
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', () => updateRequestStatus(btn.dataset.id, 'approvato'));
    });
    
    document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', () => updateRequestStatus(btn.dataset.id, 'rifiutato'));
    });
}

async function updateRequestStatus(requestId, status) {
    try {
        await db.collection('richieste').doc(requestId).update({ stato: status });
        loadPendingRequests();
        loadUserData(); // Aggiorna anche la vista dell'utente
    } catch (error) {
        alert('Errore durante l\'aggiornamento: ' + error.message);
    }
}

async function loadEmployees() {
    const employeesSnapshot = await db.collection('dipendenti').get();
    
    const employeesList = document.getElementById('employees-list');
    employeesList.innerHTML = '';
    
    employeesSnapshot.forEach(doc => {
        const employee = doc.data();
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.innerHTML = `
            <div class="employee-name">${employee.nome} ${employee.cognome}</div>
            <div class="employee-details">
                <div>Email: ${employee.email}</div>
                <div>Ruolo: ${employee.ruolo}</div>
                <div>Ferie residue: ${employee.giorniFerieResidui}</div>
            </div>
        `;
        employeesList.appendChild(card);
    });
}

// Invia nuova richiesta
document.getElementById('new-request-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const type = document.getElementById('request-type').value;
    const startDate = new Date(document.getElementById('start-date').value);
    const endDate = type !== 'permesso' ? new Date(document.getElementById('end-date').value) : startDate;
    const hours = type === 'permesso' ? parseInt(document.getElementById('hours').value) : 0;
    const notes = document.getElementById('notes').value;
    
    try {
        await db.collection('richieste').add({
            dipendenteId: currentUser.uid,
            tipo: type,
            dataInizio: firebase.firestore.Timestamp.fromDate(startDate),
            dataFine: firebase.firestore.Timestamp.fromDate(endDate),
            ore: hours,
            stato: 'in attesa',
            dataRichiesta: firebase.firestore.FieldValue.serverTimestamp(),
            note: notes
        });
        
        alert('Richiesta inviata con successo!');
        document.getElementById('new-request-form').reset();
        loadUserData();
    } catch (error) {
        alert('Errore durante l\'invio della richiesta: ' + error.message);
    }
});

// Gestione cambio tipo richiesta
document.getElementById('request-type').addEventListener('change', (e) => {
    const type = e.target.value;
    const endDateGroup = document.getElementById('end-date-group');
    const hoursGroup = document.getElementById('hours-group');
    
    if (type === 'permesso') {
        endDateGroup.classList.add('hidden');
        hoursGroup.classList.remove('hidden');
    } else {
        endDateGroup.classList.remove('hidden');
        hoursGroup.classList.add('hidden');
    }
});
// Generazione report PDF
document.getElementById('generate-report').addEventListener('click', async () => {
    const month = parseInt(document.getElementById('report-month').value);
    const year = parseInt(document.getElementById('report-year').value);
    
    // Crea un nuovo documento PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Aggiungi titolo
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text(`Report ferie/permessi - ${month}/${year}`, 105, 20, { align: 'center' });
    
    // Recupera i dati da Firebase
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const requestsQuery = db.collection('richieste')
        .where('dataInizio', '>=', startDate)
        .where('dataInizio', '<=', endDate);
    
    const requestsSnapshot = await requestsQuery.get();
    
    // Recupera i dipendenti
    const employeesSnapshot = await db.collection('dipendenti').get();
    const employees = {};
    employeesSnapshot.forEach(doc => {
        employees[doc.id] = doc.data();
    });
    
    // Prepara i dati per la tabella
    const tableData = [];
    
    requestsSnapshot.forEach(doc => {
        const request = doc.data();
        const employee = employees[request.dipendenteId] || { nome: 'N/A', cognome: '' };
        
        tableData.push([
            `${employee.nome} ${employee.cognome}`,
            request.tipo,
            request.dataInizio.toDate().toLocaleDateString(),
            request.dataFine ? request.dataFine.toDate().toLocaleDateString() : '-',
            request.ore || '-',
            request.stato
        ]);
    });
    
    // Aggiungi la tabella al PDF
    doc.autoTable({
        head: [['Dipendente', 'Tipo', 'Data Inizio', 'Data Fine', 'Ore', 'Stato']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 133, 244] },
        columnStyles: {
            0: { cellWidth: 40 },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 },
            3: { cellWidth: 25 },
            4: { cellWidth: 15 },
            5: { cellWidth: 20 }
        }
    });
    
    // Salva il PDF
    doc.save(`report_ferie_${month}_${year}.pdf`);
    
    // Opzionale: salva su Firebase Storage
    const blob = doc.output('blob');
    const storageRef = storage.ref(`reports/report_${year}_${month}.pdf`);
    await storageRef.put(blob);
});
// Gestione UI e tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Rimuovi active da tutti i tab buttons
        document.querySelectorAll('.tab-btn').forEach(tb => {
            tb.classList.remove('active');
        });
        
        // Aggiungi active al tab button cliccato
        btn.classList.add('active');
        
        // Nascondi tutti i tab content
        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.classList.remove('active');
        });
        
        // Mostra il tab content corrispondente
        const tabId = btn.id.replace('tab-', '') + '-tab';
        document.getElementById(tabId).classList.add('active');
        
        // Se è il tab del calendario, aggiorna il calendario
        if (btn.id === 'tab-calendar') {
            updateCalendar();
        }
    });
});

// Gestione calendario
let currentCalendarDate = new Date();

function updateCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Aggiorna il titolo del mese
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;
    
    // Calcola il primo giorno del mese e l'ultimo giorno
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Calcola i giorni del mese precedente e successivo da mostrare
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Lun=0, Dom=6
    
    // Pulisci il calendario
    const calendarGrid = document.getElementById('calendar-grid');
    calendarGrid.innerHTML = '';
    
    // Aggiungi i giorni della settimana
    const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    dayNames.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day;
        calendarGrid.appendChild(dayHeader);
    });
    
    // Aggiungi i giorni vuoti all'inizio se necessario
    for (let i = 0; i < firstDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDay);
    }
    
    // Aggiungi i giorni del mese
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);
        
        calendarGrid.appendChild(dayElement);
    }
    
    // Carica gli eventi per questo mese
    loadCalendarEvents(year, month + 1);
}

async function loadCalendarEvents(year, month) {
    if (!currentUser) return;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    let queryRef;
    
    if (document.querySelector('[data-role="admin"]:not(.hidden)')) {
        // Admin: vede tutti gli eventi
        queryRef = db.collection('richieste')
            .where('dataInizio', '>=', startDate)
            .where('dataInizio', '<=', endDate);
    } else {
        // Dipendente: vede solo i propri eventi
        queryRef = db.collection('richieste')
            .where('dipendenteId', '==', currentUser.uid)
            .where('dataInizio', '>=', startDate)
            .where('dataInizio', '<=', endDate);
    }
    
    const snapshot = await queryRef.get();
    
    // Recupera i nomi dei dipendenti (solo per admin)
    let employees = {};
    if (document.querySelector('[data-role="admin"]:not(.hidden)')) {
        const employeesSnapshot = await db.collection('dipendenti').get();
        employeesSnapshot.forEach(doc => {
            employees[doc.id] = doc.data();
        });
    }
    
    // Aggiungi gli eventi al calendario
    snapshot.forEach(doc => {
        const request = doc.data();
        const startDate = request.dataInizio.toDate();
        const day = startDate.getDate();
        
        const dayElements = document.querySelectorAll('.calendar-day:not(.empty)');
        const dayElement = dayElements[day - 1];
        
        if (dayElement) {
            const event = document.createElement('div');
            event.className = `calendar-event event-${request.tipo}`;
            
            let eventText = request.tipo;
            if (document.querySelector('[data-role="admin"]:not(.hidden)')) {
                const employee = employees[request.dipendenteId] || { nome: 'N/A', cognome: '' };
                eventText = `${employee.nome.charAt(0)}. ${employee.cognome}: ${request.tipo}`;
            }
            
            event.textContent = eventText;
            dayElement.appendChild(event);
        }
    });
}

// Navigazione mese
document.getElementById('prev-month').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    updateCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    updateCalendar();
});
// Inizializzazione dell'app
document.addEventListener('DOMContentLoaded', () => {
    // Imposta la data di oggi nel form di nuova richiesta
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('start-date').value = today;
    document.getElementById('end-date').value = today;
    
    // Inizializza il calendario
    updateCalendar();
});