// Configurazione Firebase
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

// Stato applicazione
const appState = {
    currentUser: null,
    currentUserData: null,
    isAdmin: false,
    filters: { type: '', employee: '', year: '', month: '', status: '' },
    currentPage: 1,
    pageSize: 10,
    totalRequests: 0,
    realtimeListener: null,
    employeesPage: 1,
    employeesPageSize: 5,  // CAMBIA DA 10 A 5
    totalEmployees: 0,
    allEmployees: []
};

// Elementi UI
const elements = {
    loginContainer: document.getElementById('loginContainer'),
    mainContainer: document.getElementById('mainContainer'),
    loginForm: document.getElementById('loginForm'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    loginError: document.getElementById('loginError'),
    logoutBtn: document.getElementById('logoutBtn'),
    resetPasswordLink: document.getElementById('resetPasswordLink'),
    loggedInUser: document.getElementById('loggedInUser'),
    adminControls: document.getElementById('adminControls'),
    requestForms: document.getElementById('requestForms'),
    adminFilters: document.getElementById('adminFilters'),
    employeesList: document.getElementById('employeesList'),
    employeesBody: document.getElementById('employeesBody'),
    richiesteBody: document.getElementById('richiesteBody'),
    ferieForm: document.getElementById('ferieForm'),
    malattiaForm: document.getElementById('malattiaForm'),
    permessiForm: document.getElementById('permessiForm'),
    exportPDF: document.getElementById('exportPDF'),
    exportExcel: document.getElementById('exportExcel'),
    registerEmployeeBtn: document.getElementById('registerEmployeeBtn'),
    showEmployeesBtn: document.getElementById('showEmployeesBtn'),
    applyFilters: document.getElementById('applyFilters'),
    resetFilters: document.getElementById('resetFilters'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    paginationControls: document.getElementById('paginationControls'),
    filterType: document.getElementById('filterType'),
    filterEmployee: document.getElementById('filterEmployee'),
    filterYear: document.getElementById('filterYear'),
    filterMonth: document.getElementById('filterMonth'),
    filterStatus: document.getElementById('filterStatus'),
    srAnnouncement: document.getElementById('srAnnouncement'),
    passwordSection: document.getElementById('passwordSection'),
    changePasswordBtn: document.getElementById('changePasswordBtn'),
    changePasswordDialog: document.getElementById('changePasswordDialog'),
    changePasswordForm: document.getElementById('changePasswordForm'),
    closeChangePassword: document.getElementById('closeChangePassword'),
    currentPassword: document.getElementById('currentPassword'),
    newPassword: document.getElementById('newPassword'),
    confirmPassword: document.getElementById('confirmPassword'),
    passwordStrength: document.getElementById('passwordStrength'),
    employeesPagination: document.getElementById('employeesPagination'),
    prevEmployeesPage: document.getElementById('prevEmployeesPage'),
    nextEmployeesPage: document.getElementById('nextEmployeesPage'),
    employeesPageInfo: document.getElementById('employeesPageInfo')
};

// ========== FUNZIONE PER CREARE ADMIN (DA USARE UNA VOLTA) ==========
// Per creare l'admin, apri la console del browser e digita: createAdmin()
async function createAdmin() {
    const adminEmail = "eliraoui.a@union14.it";
    const adminPassword = "Eliraoui0101!";
    const adminName = "Amministratore";
    
    try {
        // Crea utente in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
        await userCredential.user.updateProfile({ displayName: adminName });
        
        // Crea documento in Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            name: adminName,
            email: adminEmail,
            role: 'admin',
            temporaryPassword: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Admin creato con successo!');
        console.log('📧 Email:', adminEmail);
        console.log('🔑 Password:', adminPassword);
        console.log('🆔 UID:', userCredential.user.uid);
        
        alert('Admin creato! Ora puoi fare login con:\nEmail: ' + adminEmail + '\nPassword: ' + adminPassword);
        
    } catch (error) {
        console.error('❌ Errore creazione admin:', error);
        alert('Errore: ' + error.message);
    }
}
// ========== VALIDAZIONE FORZA PASSWORD ==========
function checkPasswordStrength(password) {
    if (!password) return { score: 0, label: '', class: '' };
    
    let score = 0;
    
    // Lunghezza
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    
    // Lettere maiuscole
    if (/[A-Z]/.test(password)) score++;
    
    // Numeri
    if (/[0-9]/.test(password)) score++;
    
    // Caratteri speciali
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
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
    
    return { score, label, className };
}

// Aggiungi listener per forza password
function initPasswordStrengthChecker() {
    const newPasswordInput = elements.newPassword;
    if (!newPasswordInput) return;
    
    newPasswordInput.addEventListener('input', (e) => {
        const strength = checkPasswordStrength(e.target.value);
        if (elements.passwordStrength) {
            elements.passwordStrength.textContent = `Forza password: ${strength.label}`;
            elements.passwordStrength.className = `password-strength ${strength.className}`;
            
            if (strength.label === 'Debole' && e.target.value.length > 0) {
                elements.passwordStrength.innerHTML += ' ⚠️ Usa lettere maiuscole, numeri e caratteri speciali';
            }
        }
    });
}

// ========== FUNZIONE CAMBIO PASSWORD ==========
async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = elements.currentPassword?.value;
    const newPassword = elements.newPassword?.value;
    const confirmPassword = elements.confirmPassword?.value;
    
    // Validazioni
    if (!currentPassword || !newPassword || !confirmPassword) {
        showFeedback('Errore', 'Tutti i campi sono obbligatori');
        return;
    }
    
    if (newPassword.length < 6) {
        showFeedback('Errore', 'La password deve avere almeno 6 caratteri');
        return;
    }
    
    // Verifica forza password
    const strength = checkPasswordStrength(newPassword);
    if (strength.score <= 2 && newPassword.length > 0) {
        const confirm = confirm('La password è debole. Vuoi comunque procedere?');
        if (!confirm) return;
    }
    
    if (newPassword !== confirmPassword) {
        showFeedback('Errore', 'Le password non coincidono');
        return;
    }
    
    if (newPassword === currentPassword) {
        showFeedback('Errore', 'La nuova password deve essere diversa da quella attuale');
        return;
    }
    
    try {
        const submitBtn = elements.changePasswordForm?.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        const user = auth.currentUser;
        if (!user) throw new Error('Utente non autenticato');
        
        // Re-autenticazione
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        
        // Aggiorna password
        await user.updatePassword(newPassword);
        
        // Aggiorna Firestore - rimuovi flag temporaryPassword
        await db.collection('users').doc(user.uid).update({
            temporaryPassword: false,
            passwordUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            passwordUpdatedBy: user.uid
        });
        
        // Aggiorna stato locale
        if (appState.currentUserData) {
            appState.currentUserData.temporaryPassword = false;
        }
        
        // Chiudi modale
        elements.changePasswordDialog?.close();
        showFeedback('Successo', '✅ Password cambiata con successo!');
        
        // NASCONDI la sezione password (non serve più)
        if (elements.passwordSection) {
            elements.passwordSection.classList.add('hidden');
            elements.passwordSection.style.display = 'none';
        }
        
        // Resetta form
        elements.changePasswordForm?.reset();
        if (elements.passwordStrength) {
            elements.passwordStrength.textContent = '';
            elements.passwordStrength.className = 'password-strength';
        }
        
        showToast('Password aggiornata! Ora puoi usare la tua nuova password.', 'success');
        
    } catch (error) {
        console.error('Errore cambio password:', error);
        
        let errorMessage = 'Errore durante il cambio password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = '❌ Password attuale non corretta';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = '❌ La password è troppo debole. Usa almeno 6 caratteri.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = '⚠️ Per sicurezza, effettua di nuovo il login prima di cambiare password.';
            setTimeout(() => handleLogout(), 2000);
        }
        
        showFeedback('Errore', errorMessage);
    } finally {
        const submitBtn = elements.changePasswordForm?.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

// ========== MOSTRA SEZIONE PASSWORD SOLO SE NECESSARIO ==========
function showPasswordSectionIfNeeded() {
    // Mostra la sezione cambio password SOLO se:
    // 1. L'utente è un dipendente (non admin)
    // 2. Ha una password temporanea (temporaryPassword === true)
    
    const isAdmin = appState.isAdmin;
    const hasTemporaryPassword = appState.currentUserData?.temporaryPassword === true;
    
    const shouldShow = !isAdmin && hasTemporaryPassword;
    
    if (elements.passwordSection) {
        if (shouldShow) {
            elements.passwordSection.style.display = 'block';
            elements.passwordSection.classList.remove('hidden');
            
            // Aggiungi animazione pulse per attirare attenzione
            elements.passwordSection.classList.add('pulse');
            setTimeout(() => {
                if (elements.passwordSection) {
                    elements.passwordSection.classList.remove('pulse');
                }
            }, 1000);
            
            // Annuncio per screen reader
            announceToScreenReader('Attenzione: la tua password è temporanea. Si prega di cambiarla per maggiore sicurezza.');
        } else {
            elements.passwordSection.style.display = 'none';
            elements.passwordSection.classList.add('hidden');
        }
    }
}
// Per chiamarla, apri la console del browser e scrivi: createAdmin()

// ========== FUNZIONI UTILITY ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showFeedback(title, message) {
    const titleEl = document.getElementById('feedbackTitle');
    const messageEl = document.getElementById('feedbackMessage');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    const dialog = document.getElementById('feedbackDialog');
    if (dialog) dialog.showModal();
    showToast(message, title === 'Errore' ? 'error' : 'success');
}

function showConfirmation(title, message, onConfirm) {
    const titleEl = document.getElementById('confirmationTitle');
    const messageEl = document.getElementById('confirmationMessage');
    const confirmBtn = document.getElementById('confirmAction');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            const dialog = document.getElementById('confirmationDialog');
            if (dialog) dialog.close();
            if (onConfirm) onConfirm();
        };
    }
    const dialog = document.getElementById('confirmationDialog');
    if (dialog) dialog.showModal();
}

function formatDate(dateValue) {
    if (!dateValue) return 'N/D';
    try {
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString('it-IT');
    } catch { return 'N/D'; }
}

function announceToScreenReader(message) {
    if (elements.srAnnouncement) {
        elements.srAnnouncement.textContent = message;
        setTimeout(() => { elements.srAnnouncement.textContent = ''; }, 3000);
    }
}

function getAuthErrorMessage(error) {
    const errors = {
        'auth/invalid-email': 'Email non valida',
        'auth/user-disabled': 'Account disabilitato',
        'auth/user-not-found': 'Utente non trovato',
        'auth/wrong-password': 'Password errata',
        'auth/too-many-requests': 'Troppi tentativi. Riprova più tardi',
        'auth/network-request-failed': 'Errore di rete. Verifica la connessione',
        'auth/invalid-login-credentials': 'Email o password non validi'
    };
    return errors[error.code] || `Errore: ${error.message}`;
}

// ========== FUNZIONE CAMBIO PASSWORD ==========
async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = elements.currentPassword?.value;
    const newPassword = elements.newPassword?.value;
    const confirmPassword = elements.confirmPassword?.value;
    
    // Validazioni
    if (!currentPassword || !newPassword || !confirmPassword) {
        showFeedback('Errore', 'Tutti i campi sono obbligatori');
        return;
    }
    
    if (newPassword.length < 6) {
        showFeedback('Errore', 'La password deve avere almeno 6 caratteri');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showFeedback('Errore', 'Le password non coincidono');
        return;
    }
    
    // Verifica che non sia uguale alla vecchia
    if (newPassword === currentPassword) {
        showFeedback('Errore', 'La nuova password deve essere diversa da quella attuale');
        return;
    }
    
    try {
        // Mostra loading sul bottone
        const submitBtn = elements.changePasswordForm?.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true);
        
        // 1. Riautentica l'utente
        const user = auth.currentUser;
        if (!user) throw new Error('Utente non autenticato');
        
        // Re-autenticazione
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        
        // 2. Aggiorna password
        await user.updatePassword(newPassword);
        
        // 3. Aggiorna Firestore (rimuovi flag temporaryPassword)
        await db.collection('users').doc(user.uid).update({
            temporaryPassword: false,
            passwordUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. Aggiorna stato locale
        if (appState.currentUserData) {
            appState.currentUserData.temporaryPassword = false;
        }
        
        // 5. Chiudi modale e mostra successo
        elements.changePasswordDialog?.close();
        showFeedback('Successo', 'Password cambiata con successo!');
        
        // 6. Se stava visualizzando lista dipendenti, ricarica
        if (elements.employeesList?.style.display === 'block') {
            await loadEmployeesList();
        }
        
        // Resetta form
        elements.changePasswordForm?.reset();
        
    } catch (error) {
        console.error('Errore cambio password:', error);
        
        let errorMessage = 'Errore durante il cambio password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Password attuale non corretta';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La password è troppo debole. Usa almeno 6 caratteri.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Per sicurezza, effettua di nuovo il login prima di cambiare password.';
            // Logout forzato
            setTimeout(() => handleLogout(), 2000);
        }
        
        showFeedback('Errore', errorMessage);
    } finally {
        const submitBtn = elements.changePasswordForm?.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, false);
    }
}

// Funzione per mostrare il dialog cambio password
function showChangePasswordDialog() {
    if (!elements.changePasswordDialog) return;
    elements.changePasswordForm?.reset();
    elements.changePasswordDialog.showModal();
}

// ========== PAGINAZIONE DIPENDENTI MIGLIORATA ==========
async function loadEmployeesList() {
    if (!elements.employeesBody) return;
    
    // Mostra skeleton loading
    elements.employeesBody.innerHTML = `
        <tr><td colspan="6">
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
        </td></tr>
    `;
    
    try {
        // Carica tutti i dipendenti (senza paginazione lato server per semplicità)
        const snapshot = await db.collection('users').orderBy('name').get();
        
        appState.allEmployees = [];
        snapshot.forEach(doc => {
            appState.allEmployees.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        appState.totalEmployees = appState.allEmployees.length;
        updateEmployeesPagination();
        
        // Renderizza pagina corrente
        renderEmployeesPage();
        
    } catch (error) {
        console.error('Errore caricamento dipendenti:', error);
        elements.employeesBody.innerHTML = '<tr><td colspan="6" class="error text-center">Errore caricamento dipendenti</td></tr>';
    }
}

function renderEmployeesPage() {
    if (!elements.employeesBody) return;
    
    const start = (appState.employeesPage - 1) * appState.employeesPageSize;
    const end = start + appState.employeesPageSize;
    const pageEmployees = appState.allEmployees.slice(start, end);
    
    elements.employeesBody.innerHTML = '';
    
    if (pageEmployees.length === 0) {
        elements.employeesBody.innerHTML = ' hilab<td colspan="6" class="text-center">Nessun dipendente trovato</td> </tr>';
        return;
    }
    
    pageEmployees.forEach(employee => {
        const data = employee;
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === employee.id;
        
        const row = document.createElement('tr');
        if (isCurrentUser) row.classList.add('current-user');
        
        const safeEmail = escapeHtml(data.email || '');
        const safeName = escapeHtml(data.name || 'N/D');
        
        row.innerHTML = `
            <td data-label="Nome">${safeName}</td>
            <td data-label="Email">${safeEmail}</td>
            <td data-label="Ruolo">
                <select class="role-select form-control" data-id="${employee.id}" ${isCurrentUser ? 'disabled' : ''}>
                    <option value="dipendente" ${data.role === 'dipendente' ? 'selected' : ''}>Dipendente</option>
                    <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td data-label="Data Registrazione">${createdAt.toLocaleDateString('it-IT')}</td>
            <td data-label="Stato Password">
                ${data.temporaryPassword ? 
                    '<span class="status-badge rifiutato">⚠️ Temporanea</span>' : 
                    '<span class="status-badge approvato">✓ Definitiva</span>'}
            </td>
            <td data-label="Azioni" class="actions-cell">
                ${!isCurrentUser ? `
                   
                    <button class="btn-small reset-password" data-email="${safeEmail}" data-name="${safeName}">🔄 Reset Password</button>
                    <button class="btn-small btn-danger delete-employee" data-id="${employee.id}" data-name="${safeName}">🗑️ Elimina</button>
                ` : '<span class="text-muted">(Utente corrente)</span>'}
            </td>
        `;
        
        // Event listeners
        if (!isCurrentUser) {
            const roleSelect = row.querySelector('.role-select');
            const updateBtn = row.querySelector('.update-role');
            const resetBtn = row.querySelector('.reset-password');
            const deleteBtn = row.querySelector('.delete-employee');
            
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    const newRole = roleSelect.value;
                    updateEmployeeRole(employee.id, newRole);
                });
            }
            
            if (resetBtn) {
                resetBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const email = resetBtn.getAttribute('data-email');
                    if (email) {
                        resetEmployeePassword(email);
                    }
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteEmployee(employee.id, data.name);
                });
            }
        }
        
        elements.employeesBody.appendChild(row);
    });
}

// ========== AGGIORNA PAGINAZIONE DIPENDENTI ==========
function updateEmployeesPagination() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    
    if (elements.employeesPageInfo) {
        elements.employeesPageInfo.textContent = `Pagina ${appState.employeesPage} di ${totalPages || 1}`;
    }
    
    if (elements.prevEmployeesPage) {
        elements.prevEmployeesPage.disabled = appState.employeesPage <= 1;
    }
    
    if (elements.nextEmployeesPage) {
        elements.nextEmployeesPage.disabled = appState.employeesPage >= totalPages;
    }
    
    // Mostra/nascondi la paginazione (mostra solo se ci sono più di 5 dipendenti)
    if (elements.employeesPagination) {
        elements.employeesPagination.style.display = totalPages > 1 ? 'flex' : 'none';
    }
}

function goToPrevEmployeesPage() {
    if (appState.employeesPage > 1) {
        appState.employeesPage--;
        renderEmployeesPage();
        updateEmployeesPagination();
        
        // Scroll alla tabella
        elements.employeesList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function goToNextEmployeesPage() {
    const totalPages = Math.ceil(appState.totalEmployees / appState.employeesPageSize);
    if (appState.employeesPage < totalPages) {
        appState.employeesPage++;
        renderEmployeesPage();
        updateEmployeesPagination();
        
        // Scroll alla tabella
        elements.employeesList?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ========== MIGLIORAMENTO PAGINAZIONE RICHIESTE ==========
function updatePagination() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    if (elements.pageInfo) {
        elements.pageInfo.textContent = `Pagina ${appState.currentPage} di ${total || 1}`;
    }
    if (elements.prevPage) elements.prevPage.disabled = appState.currentPage <= 1;
    if (elements.nextPage) elements.nextPage.disabled = appState.currentPage >= total;
    if (elements.paginationControls) {
        elements.paginationControls.style.display = total > 1 ? 'flex' : 'none';
    }
}
// ========== AUTENTICAZIONE ==========
async function handleLogin(e) {
    e.preventDefault();
    
    let email = elements.email?.value?.trim().toLowerCase() || '';
    const password = elements.password?.value || '';
    const submitBtn = elements.loginForm?.querySelector('button[type="submit"]');
    
    if (!email || !password) {
        showError('Inserisci email e password');
        return;
    }
    
    try {
        setLoadingState(submitBtn, true);
        
        console.log('Tentativo login per:', email);
        
        // 1. Login con Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        console.log('Auth OK, UID:', user.uid);
        
        // 2. Cerca il documento utente in Firestore
        let userDoc = await db.collection('users').doc(user.uid).get();
        
        // 3. Se non trova per UID, cerca per email
        if (!userDoc.exists) {
            console.log('Documento non trovato per UID, cerco per email...');
            const querySnapshot = await db.collection('users').where('email', '==', email).get();
            
            if (!querySnapshot.empty) {
                userDoc = querySnapshot.docs[0];
                console.log('Documento trovato per email, ID:', userDoc.id);
                
                // Aggiorna il documento con l'UID corretto
                await db.collection('users').doc(user.uid).set(userDoc.data());
                await db.collection('users').doc(userDoc.id).delete();
                userDoc = await db.collection('users').doc(user.uid).get();
                console.log('Documento migrato al nuovo UID');
            }
        }
        
        // 4. Se ancora non esiste, crea il documento
        if (!userDoc.exists) {
            console.log('Documento non trovato, creazione automatica...');
            const newUserData = {
                name: user.displayName || email.split('@')[0],
                email: email,
                role: email === 'eliraoui.a@union14.it' ? 'admin' : 'dipendente',
                temporaryPassword: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('users').doc(user.uid).set(newUserData);
            userDoc = await db.collection('users').doc(user.uid).get();
            console.log('Documento creato:', newUserData);
        }
        
        const userData = userDoc.data();
        console.log('Dati utente:', { name: userData.name, role: userData.role });
        
        // 5. Aggiorna stato app
        appState.currentUser = user;
        appState.currentUserData = userData;
        appState.isAdmin = userData.role === 'admin';
        
        // 6. Setup UI
        setupUI();
        
        showError('');
        showToast(`Benvenuto ${userData.name}`, 'success');
        
    } catch (error) {
        console.error('Errore login:', error.code, error.message);
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
        appState.currentUserData = null;
        appState.isAdmin = false;
        showLogin();
        showToast('Logout effettuato', 'success');
    } catch (error) {
        console.error("Errore logout:", error);
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
        showFeedback('Successo', 'Email di reset inviata! Controlla la tua casella.');
    } catch (error) {
        showFeedback('Errore', getAuthErrorMessage(error));
    }
}

function showLogin() {
    if (elements.loginContainer) elements.loginContainer.style.display = 'flex';
    if (elements.mainContainer) elements.mainContainer.style.display = 'none';
    if (elements.loginForm) elements.loginForm.reset();
    showError('');
}

function showError(message) {
    if (elements.loginError) {
        elements.loginError.textContent = message;
        elements.loginError.style.display = message ? 'block' : 'none';
    }
}

function setLoadingState(element, isLoading) {
    if (!element) return;
    if (isLoading) {
        element.disabled = true;
        const loadingEl = element.querySelector('.btn-loading');
        const textSpan = element.querySelector('.btn-text');
        if (loadingEl) {
            loadingEl.style.display = 'inline-flex';
            if (textSpan) textSpan.style.display = 'none';
        } else {
            element.textContent = 'Caricamento...';
        }
    } else {
        element.disabled = false;
        const loadingEl = element.querySelector('.btn-loading');
        const textSpan = element.querySelector('.btn-text');
        if (loadingEl) {
            loadingEl.style.display = 'none';
            if (textSpan) textSpan.style.display = 'inline';
        } else {
            element.textContent = element.dataset.originalText || 'Accedi';
        }
    }
}

// ========== SETUP UI ==========
async function setupUI() {
    const userData = appState.currentUserData;
    const isAdmin = appState.isAdmin;
    
    // Mostra nome utente
    if (elements.loggedInUser) {
        elements.loggedInUser.textContent = `${userData.name}${isAdmin ? ' (Admin)' : ''}`;
    }
    
    // Mostra/nascondi controlli admin
    if (elements.adminControls) {
        elements.adminControls.style.display = isAdmin ? 'block' : 'none';
    }
    
    // Mostra/nascondi form richieste
    if (elements.requestForms) {
        elements.requestForms.style.display = isAdmin ? 'none' : 'block';
    }
    
    // Mostra/nascondi sezione cambio password (solo per dipendenti con password temporanea)
    showPasswordSectionIfNeeded();
    
    // Imposta nome nei form
    const nameFields = ['ferieNome', 'malattiaNome', 'permessiNome'];
    nameFields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = userData.name;
    });
    
    // Mostra app principale
    if (elements.loginContainer) elements.loginContainer.style.display = 'none';
    if (elements.mainContainer) elements.mainContainer.style.display = 'block';
    
    // Carica richieste
    await loadRequests();
    setupRealtimeListener();
    
    announceToScreenReader(`Accesso effettuato come ${userData.name}`);
}


// ========== REAL-TIME LISTENER ==========
function setupRealtimeListener() {
    if (appState.realtimeListener) appState.realtimeListener();
    
    let query = db.collection('richieste');
    if (!appState.isAdmin && appState.currentUser) {
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
        if (appState.currentUser) loadRequests();
    }, (error) => console.error("Errore real-time:", error));
}

// ========== RICHIESTE ==========
function calcolaGiorniLavorativi(inizio, fine) {
    let giorni = 0;
    const data = new Date(inizio);
    const end = new Date(fine);
    data.setHours(0,0,0);
    end.setHours(0,0,0);
    
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
        giorniInput.value = calcolaGiorniLavorativi(inizio, fine);
    }
}

async function loadRequests() {
    if (!elements.richiesteBody) return;
    elements.richiesteBody.innerHTML = '发展<td colspan="6" class="text-center"><div class="loading-spinner"></div> Caricamento...</td></tr>';
    
    try {
        let query = db.collection('richieste');
        
        if (!appState.isAdmin && appState.currentUser) {
            query = query.where('userId', '==', appState.currentUser.uid);
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
        
        if (appState.isAdmin && appState.filters.employee) {
            const searchTerm = appState.filters.employee.toLowerCase();
            docs = docs.filter(doc => doc.data().userName?.toLowerCase().includes(searchTerm));
        }
        
        appState.totalRequests = docs.length;
        updatePagination();
        
        const start = (appState.currentPage - 1) * appState.pageSize;
        const paginated = docs.slice(start, start + appState.pageSize);
        renderRequests(paginated);
        
    } catch (error) {
        console.error("Errore caricamento richieste:", error);
        elements.richiesteBody.innerHTML = `<tr><td colspan="6" class="error text-center">Errore: ${error.message}</td></tr>`;
    }
}

function renderRequests(docs) {
    if (!elements.richiesteBody) return;
    elements.richiesteBody.innerHTML = '';
    
    if (docs.length === 0) {
        const colspan = appState.isAdmin ? 6 : 5;
        elements.richiesteBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">Nessuna richiesta trovata</td></tr>`;
        return;
    }
    
    docs.forEach(doc => {
        const data = doc.data();
        let periodo = '', dettagli = '';
        
        if (data.tipo === 'Ferie') {
            periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
            dettagli = `${data.giorni} giorni`;
        } else if (data.tipo === 'Malattia') {
            periodo = `${formatDate(data.dataInizio)} - ${formatDate(data.dataFine)}`;
            dettagli = `Cert. n. ${escapeHtml(data.numeroCertificato || '')}`;
        } else if (data.tipo === 'Permesso') {
            periodo = formatDate(data.data);
            dettagli = `${data.oraInizio} - ${data.oraFine}${data.motivazione ? ` (${escapeHtml(data.motivazione)})` : ''}`;
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Tipo">${escapeHtml(data.tipo)}</td>
            <td data-label="Nome">${escapeHtml(data.userName)}</td>
            <td data-label="Periodo">${escapeHtml(periodo)}</td>
            <td data-label="Dettagli">${escapeHtml(dettagli)}</td>
            <td data-label="Stato"><span class="status-badge ${data.stato.toLowerCase().replace(' ', '-')}">${escapeHtml(data.stato)}</span></td>
            ${appState.isAdmin ? `
            <td data-label="Azioni" class="actions-cell">
                <select class="status-select" data-id="${doc.id}">
                    <option value="In attesa" ${data.stato === 'In attesa' ? 'selected' : ''}>In attesa</option>
                    <option value="Approvato" ${data.stato === 'Approvato' ? 'selected' : ''}>Approvato</option>
                    <option value="Rifiutato" ${data.stato === 'Rifiutato' ? 'selected' : ''}>Rifiutato</option>
                </select>
                <button class="btn-small save-status" data-id="${doc.id}">Salva</button>
                <button class="btn-small btn-danger delete-request" data-id="${doc.id}">Elimina</button>
            </td>
            ` : ''}
        `;
        
        if (appState.isAdmin) {
            row.querySelector('.save-status')?.addEventListener('click', () => {
                const newStatus = row.querySelector('.status-select').value;
                updateRequestStatus(doc.id, newStatus);
            });
            row.querySelector('.delete-request')?.addEventListener('click', () => {
                showConfirmation('Elimina Richiesta', 'Sei sicuro di voler eliminare questa richiesta?', () => deleteRequest(doc.id));
            });
        }
        
        elements.richiesteBody.appendChild(row);
    });
    
    const azioniHeader = document.getElementById('azioniHeader');
    if (azioniHeader) azioniHeader.style.display = appState.isAdmin ? 'table-cell' : 'none';
}

// ========== MOSTRA CAMBIO PASSWORD SE PASSWORD TEMPORANEA ==========
function checkAndPromptPasswordChange() {
    if (appState.currentUserData && appState.currentUserData.temporaryPassword) {
        // Mostra notifica e offre cambio password
        showFeedback(
            'Password Temporanea', 
            'La tua password è temporanea. Ti consigliamo di cambiarla subito per maggiore sicurezza.'
        );
        
        // Mostra anche un toast più evidente
        showToast('⚠️ Password temporanea! Clicca su "Cambia Password" per impostarne una nuova.', 'warning');
        
        // Evidenzia il bottone cambio password
        const changeBtn = document.getElementById('changePasswordBtn');
        if (changeBtn) {
            changeBtn.style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                if (changeBtn) changeBtn.style.animation = '';
            }, 5000);
        }
    }
}

// Aggiungi keyframes per pulse
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(243, 156, 18, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(243, 156, 18, 0); }
    }
`;
document.head.appendChild(style);

async function updateRequestStatus(requestId, newStatus) {
    try {
        await db.collection('richieste').doc(requestId).update({
            stato: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showFeedback('Successo', 'Stato aggiornato!');
        await loadRequests();
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'aggiornamento');
    }
}

async function deleteRequest(requestId) {
    try {
        await db.collection('richieste').doc(requestId).delete();
        showFeedback('Successo', 'Richiesta eliminata!');
        await loadRequests();
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'eliminazione');
    }
}

// ========== SUBMIT RICHIESTE ==========
async function handleFerieSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const dataInizio = new Date(document.getElementById('ferieDataInizio').value);
    const dataFine = new Date(document.getElementById('ferieDataFine').value);
    const giorni = calcolaGiorniLavorativi(dataInizio, dataFine);
    const oggi = new Date(); oggi.setHours(0,0,0);
    
    if (dataInizio < oggi) { showFeedback('Errore', 'Non puoi richiedere ferie per date passate'); return; }
    if (dataFine < dataInizio) { showFeedback('Errore', 'Data fine precedente a data inizio'); return; }
    if (giorni <= 0) { showFeedback('Errore', 'Nessun giorno lavorativo nel periodo'); return; }
    
    try {
        await db.collection('richieste').add({
            tipo: 'Ferie',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            dataInizio, dataFine, giorni,
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('ferieForm').reset();
        showFeedback('Successo', `Richiesta ferie inviata! ${giorni} giorni`);
        await loadRequests();
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'invio');
    }
}

async function handleMalattiaSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const dataInizio = new Date(document.getElementById('malattiaDataInizio').value);
    const dataFine = new Date(document.getElementById('malattiaDataFine').value);
    const numeroCertificato = document.getElementById('malattiaNumeroCertificato')?.value;
    const dataCertificato = document.getElementById('malattiaDataCertificato')?.value;
    
    if (dataFine < dataInizio) { showFeedback('Errore', 'Data fine precedente a data inizio'); return; }
    if (!numeroCertificato?.trim()) { showFeedback('Errore', 'Numero certificato obbligatorio'); return; }
    if (!dataCertificato) { showFeedback('Errore', 'Data certificato obbligatoria'); return; }
    
    try {
        await db.collection('richieste').add({
            tipo: 'Malattia',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            dataInizio, dataFine,
            numeroCertificato,
            dataCertificato: new Date(dataCertificato),
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('malattiaForm').reset();
        showFeedback('Successo', 'Richiesta malattia inviata!');
        await loadRequests();
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'invio');
    }
}

async function handlePermessiSubmit(e) {
    e.preventDefault();
    if (!appState.currentUser) { showFeedback('Errore', 'Devi effettuare il login'); return; }
    
    const data = new Date(document.getElementById('permessiData').value);
    const oraInizio = document.getElementById('permessiOraInizio')?.value;
    const oraFine = document.getElementById('permessiOraFine')?.value;
    const motivazione = document.getElementById('permessiMotivazione')?.value;
    const oggi = new Date(); oggi.setHours(0,0,0);
    
    if (data < oggi) { showFeedback('Errore', 'Non puoi richiedere permesso per data passata'); return; }
    if (!oraInizio || !oraFine) { showFeedback('Errore', 'Ore obbligatorie'); return; }
    if (oraInizio >= oraFine) { showFeedback('Errore', 'Ora fine deve essere dopo ora inizio'); return; }
    
    try {
        await db.collection('richieste').add({
            tipo: 'Permesso',
            userId: appState.currentUser.uid,
            userName: appState.currentUserData.name,
            data, oraInizio, oraFine,
            motivazione: motivazione || '',
            stato: 'In attesa',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('permessiForm').reset();
        showFeedback('Successo', 'Richiesta permesso inviata!');
        await loadRequests();
    } catch (error) {
        showFeedback('Errore', 'Errore durante l\'invio');
    }
}

// ========== ADMIN FUNCTIONS ==========
async function registerEmployee() {
    const name = prompt("Nome completo dipendente:");
    if (!name?.trim()) { 
        showFeedback('Errore', 'Nome obbligatorio'); 
        return; 
    }
    
    const email = prompt("Email dipendente:");
    if (!email) { 
        showFeedback('Errore', 'Email obbligatoria'); 
        return; 
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { 
        showFeedback('Errore', 'Email non valida'); 
        return; 
    }
    
    const tempPassword = "union14.it";
    
    if (!appState.isAdmin) {
        showFeedback('Errore', 'Solo gli amministratori possono registrare dipendenti');
        return;
    }
    
    try {
        setLoadingState(elements.registerEmployeeBtn, true);
        
        console.log('Registrazione dipendente:', { name, email });
        
        // 1. Crea utente in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, tempPassword);
        console.log('Utente Auth creato:', userCredential.user.uid);
        
        // 2. Aggiorna profilo
        await userCredential.user.updateProfile({ displayName: name });
        
        // 3. Crea documento in Firestore
        const userData = {
            name: name.trim(),
            email: email,
            role: 'dipendente',
            temporaryPassword: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: appState.currentUser.uid,
            createdByEmail: appState.currentUser.email
        };
        
        await db.collection('users').doc(userCredential.user.uid).set(userData);
        console.log('Documento Firestore creato');
        
        showFeedback('Successo', 
            `✅ Dipendente "${name}" registrato!<br><br>` +
            `📧 Email: ${email}<br>` +
            `🔑 Password: ${tempPassword}<br><br>` +
            `⚠️ Il dipendente dovrà cambiare password al primo accesso.`
        );
        
        // Ricarica lista dipendenti
        if (elements.employeesList?.style.display === 'block') {
            await loadEmployeesList();
        }
        
    } catch (error) {
        console.error('Errore registrazione:', error);
        
        let errorMessage = '';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Questa email è già registrata. Usa un\'altra email.';
        } else if (error.code === 'permission-denied') {
            errorMessage = 'Errore di permessi. Verifica le regole Firestore.';
        } else {
            errorMessage = error.message;
        }
        
        showFeedback('Errore', errorMessage);
    } finally {
        setLoadingState(elements.registerEmployeeBtn, false);
    }
}

// ========== LOAD EMPLOYEES LIST CON PAGINAZIONE ==========
async function loadEmployeesList() {
    if (!elements.employeesBody) return;
    
    // Mostra skeleton loading
    elements.employeesBody.innerHTML = `
        <tr><td colspan="6">
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
            <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
        </td></tr>
    `;
    
    try {
        // Carica tutti i dipendenti
        const snapshot = await db.collection('users').orderBy('name').get();
        
        appState.allEmployees = [];
        snapshot.forEach(doc => {
            appState.allEmployees.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        appState.totalEmployees = appState.allEmployees.length;
        
        // Aggiorna i controlli di paginazione
        updateEmployeesPagination();
        
        // Renderizza la prima pagina
        renderEmployeesPage();
        
        // Mostra la paginazione se ci sono più dipendenti della pagina
        if (elements.employeesPagination) {
            elements.employeesPagination.style.display = appState.totalEmployees > appState.employeesPageSize ? 'flex' : 'none';
        }
        
    } catch (error) {
        console.error('Errore caricamento dipendenti:', error);
        elements.employeesBody.innerHTML = '<tr><td colspan="6" class="error text-center">Errore caricamento dipendenti</td></tr>';
    }
}

async function updateEmployeeRole(userId, newRole) {
    showConfirmation('Cambio Ruolo', `Cambiare ruolo a "${newRole}"?`, async () => {
        try {
            await db.collection('users').doc(userId).update({ 
                role: newRole,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showFeedback('Successo', 'Ruolo aggiornato!');
            await loadEmployeesList();
            
            if (appState.currentUser && appState.currentUser.uid === userId) {
                appState.currentUserData.role = newRole;
                appState.isAdmin = newRole === 'admin';
                if (elements.loggedInUser) {
                    elements.loggedInUser.textContent = `${appState.currentUserData.name}${appState.isAdmin ? ' (Admin)' : ''}`;
                }
                if (elements.adminControls) {
                    elements.adminControls.style.display = appState.isAdmin ? 'block' : 'none';
                }
                if (elements.requestForms) {
                    elements.requestForms.style.display = appState.isAdmin ? 'none' : 'block';
                }
            }
        } catch (error) {
            showFeedback('Errore', 'Errore durante l\'aggiornamento');
        }
    });
}



async function deleteEmployee(userId, name) {
    showConfirmation('Elimina Dipendente', `Eliminare "${name}"? Tutte le sue richieste verranno eliminate.`, async () => {
        try {
            const requests = await db.collection('richieste').where('userId', '==', userId).get();
            const batch = db.batch();
            requests.forEach(doc => batch.delete(doc.ref));
            batch.delete(db.collection('users').doc(userId));
            await batch.commit();
            
            showFeedback('Successo', 'Dipendente eliminato');
            await loadEmployeesList();
        } catch (error) {
            showFeedback('Errore', 'Errore durante l\'eliminazione');
        }
    });
}
// ========== RESET PASSWORD SEMPLICE CON union14.it ==========
async function resetEmployeePassword(email) {
    if (!email) {
        showFeedback('Errore', 'Email non valida');
        return;
    }
    
    const tempPassword = "union14.it";
    
    // Conferma con password visibile
    showConfirmation(
        'Reset Password', 
        `⚠️ RESET PASSWORD ⚠️\n\n` +
        `Dipendente: ${email}\n\n` +
        `La nuova password sarà: ${tempPassword}\n\n` +
        `Il dipendente riceverà un'email con il link per il reset.\n` +
        `Usa la password sopra per completare la procedura.\n\n` +
        `Procedere?`,
        async () => {
            try {
                // Mostra loading sul bottone
                const resetBtn = document.querySelector(`.reset-password[data-email="${email}"]`);
                if (resetBtn) {
                    resetBtn.textContent = '⏳ Invio in corso...';
                    resetBtn.disabled = true;
                }
                
                console.log(`📧 Reset password per: ${email}`);
                
                // 1. Invia email di reset Firebase
                await auth.sendPasswordResetEmail(email);
                
                // 2. Trova l'utente e aggiorna Firestore
                const usersSnapshot = await db.collection('users').where('email', '==', email).get();
                
                if (!usersSnapshot.empty) {
                    const userDoc = usersSnapshot.docs[0];
                    await db.collection('users').doc(userDoc.id).update({
                        temporaryPassword: true,
                        temporaryPasswordValue: tempPassword,
                        passwordResetAt: firebase.firestore.FieldValue.serverTimestamp(),
                        passwordResetBy: appState.currentUser?.email,
                        passwordResetByName: appState.currentUserData?.name
                    });
                    console.log('✅ Firestore aggiornato');
                }
                
                // 3. Mostra feedback con la password
                showFeedback(
                    '✅ Reset Password Inviato', 
                    `Email di reset inviata a:\n📧 ${email}\n\n` +
                    `🔑 PASSWORD TEMPORANEA: ${tempPassword}\n\n` +
                    `📌 ISTRUZIONI PER IL DIPENDENTE:\n` +
                    `1. Controlla l'email (anche nello spam)\n` +
                    `2. Clicca sul link ricevuto\n` +
                    `3. Inserisci la password temporanea: ${tempPassword}\n` +
                    `4. Imposta una nuova password personale\n\n` +
                    `⚠️ Comunica subito la password al dipendente!`
                );
                
                showToast(`Email inviata a ${email}`, 'success');
                
                // Ricarica lista per aggiornare lo stato password
                setTimeout(() => {
                    if (elements.employeesList?.style.display === 'block') {
                        loadEmployeesList();
                    }
                }, 1500);
                
            } catch (error) {
                console.error('❌ Errore reset:', error);
                showFeedback('Errore', getAuthErrorMessage(error));
            } finally {
                const resetBtn = document.querySelector(`.reset-password[data-email="${email}"]`);
                if (resetBtn) {
                    resetBtn.textContent = '🔄 Reset Password';
                    resetBtn.disabled = false;
                }
            }
        }
    );
}
// ========== RESET PASSWORD CON CLOUD FUNCTION ==========
async function resetEmployeePasswordDirect(email) {
    if (!email) {
        showFeedback('Errore', 'Email non valida');
        return;
    }
    
    const tempPassword = "union14.it";
    
    showConfirmation(
        'Reset Password', 
        `⚠️ OPERAZIONE IRREVERSIBILE ⚠️\n\n` +
        `Stai per resettare la password per:\n📧 ${email}\n\n` +
        `La nuova password sarà: 🔑 ${tempPassword}\n\n` +
        `L'utente dovrà cambiarla al prossimo accesso.\n\n` +
        `Procedere?`,
        async () => {
            try {
                const resetBtn = document.querySelector(`.reset-password[data-email="${email}"]`);
                if (resetBtn) {
                    resetBtn.textContent = '⏳ Reset in corso...';
                    resetBtn.disabled = true;
                }
                
                // Chiamata alla Cloud Function
                const resetPassword = firebase.functions().httpsCallable('resetPasswordDirect');
                const result = await resetPassword({ email });
                
                if (result.data.success) {
                    showFeedback(
                        '✅ Password Resettata', 
                        `Password reimpostata con successo per:\n📧 ${email}\n\n` +
                        `🔑 NUOVA PASSWORD TEMPORANEA: ${tempPassword}\n\n` +
                        `⚠️ Comunica questa password al dipendente.`
                    );
                    showToast(`Password resettata per ${email}`, 'success');
                    
                    // Ricarica lista
                    setTimeout(() => loadEmployeesList(), 1000);
                }
                
            } catch (error) {
                console.error('Errore:', error);
                showFeedback('❌ Errore', error.message || 'Errore durante il reset');
            } finally {
                const resetBtn = document.querySelector(`.reset-password[data-email="${email}"]`);
                if (resetBtn) {
                    resetBtn.textContent = 'Reset Password';
                    resetBtn.disabled = false;
                }
            }
        }
    );
}
function toggleEmployeesList() {
    if (!elements.employeesList) return;
    const isVisible = elements.employeesList.style.display === 'block';
    elements.employeesList.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) loadEmployeesList();
}

// ========== FILTRI E PAGINAZIONE ==========
function applyFilters() {
    appState.filters = {
        type: elements.filterType?.value || '',
        employee: elements.filterEmployee?.value.trim() || '',
        year: elements.filterYear?.value || '',
        month: elements.filterMonth?.value || '',
        status: elements.filterStatus?.value || ''
    };
    appState.currentPage = 1;
    loadRequests();
}

function resetFilters() {
    if (elements.filterType) elements.filterType.value = '';
    if (elements.filterEmployee) elements.filterEmployee.value = '';
    if (elements.filterYear) elements.filterYear.value = '';
    if (elements.filterMonth) elements.filterMonth.value = '';
    if (elements.filterStatus) elements.filterStatus.value = '';
    appState.filters = { type: '', employee: '', year: '', month: '', status: '' };
    appState.currentPage = 1;
    loadRequests();
}

function updatePagination() {
    const total = Math.ceil(appState.totalRequests / appState.pageSize);
    if (elements.pageInfo) elements.pageInfo.textContent = `Pagina ${appState.currentPage} di ${total || 1}`;
    if (elements.prevPage) elements.prevPage.disabled = appState.currentPage <= 1;
    if (elements.nextPage) elements.nextPage.disabled = appState.currentPage >= total;
    if (elements.paginationControls) elements.paginationControls.style.display = total > 1 ? 'flex' : 'none';
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

// ========== EXPORT ==========
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

// ========== TAB SWITCH ==========
function handleTabSwitch(e) {
    const tabId = this.dataset.tab;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    this.classList.add('active');
    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');
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

// ========== INIZIALIZZAZIONE ==========
function initializeEventListeners() {
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.logoutBtn?.addEventListener('click', handleLogout);
    elements.resetPasswordLink?.addEventListener('click', handlePasswordReset);
    elements.ferieForm?.addEventListener('submit', handleFerieSubmit);
    elements.malattiaForm?.addEventListener('submit', handleMalattiaSubmit);
    elements.permessiForm?.addEventListener('submit', handlePermessiSubmit);
    elements.exportPDF?.addEventListener('click', exportToPDF);
    elements.exportExcel?.addEventListener('click', exportToExcel);
    elements.registerEmployeeBtn?.addEventListener('click', registerEmployee);
    elements.showEmployeesBtn?.addEventListener('click', toggleEmployeesList);
    elements.applyFilters?.addEventListener('click', applyFilters);
    elements.resetFilters?.addEventListener('click', resetFilters);
    elements.prevPage?.addEventListener('click', goToPreviousPage);
    elements.nextPage?.addEventListener('click', goToNextPage);
   elements.prevEmployeesPage?.addEventListener('click', goToPrevEmployeesPage);
    elements.nextEmployeesPage?.addEventListener('click', goToNextEmployeesPage);
    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', handleTabSwitch));
    document.getElementById('ferieDataInizio')?.addEventListener('change', calcolaGiorniFerie);
    document.getElementById('ferieDataFine')?.addEventListener('change', calcolaGiorniFerie);
    
    const filterEmployee = document.getElementById('filterEmployee');
    if (filterEmployee) {
        filterEmployee.addEventListener('input', debounce(() => {
            appState.currentPage = 1;
            applyFilters();
        }, 300));
    }
    
    const today = new Date().toISOString().split('T')[0];
    ['ferieDataInizio', 'ferieDataFine', 'malattiaDataInizio', 'malattiaDataFine', 'permessiData'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.min = today;
    });
     // Cambio password
    elements.changePasswordBtn?.addEventListener('click', () => {
        elements.changePasswordDialog?.showModal();
        // Resetta il form e la forza password
        elements.changePasswordForm?.reset();
        if (elements.passwordStrength) {
            elements.passwordStrength.textContent = '';
            elements.passwordStrength.className = 'password-strength';
        }
    });
    
    elements.changePasswordForm?.addEventListener('submit', handleChangePassword);
    elements.closeChangePassword?.addEventListener('click', () => {
        elements.changePasswordDialog?.close();
    });
    
    // Chiusura modale click outside
    elements.changePasswordDialog?.addEventListener('click', (e) => {
        if (e.target === elements.changePasswordDialog) {
            elements.changePasswordDialog.close();
        }
    });
    
    // Paginazione dipendenti
    elements.prevEmployeesPage?.addEventListener('click', goToPrevEmployeesPage);
    elements.nextEmployeesPage?.addEventListener('click', goToNextEmployeesPage);
    
    // Chiusura modale click outside
    elements.changePasswordDialog?.addEventListener('click', (e) => {
        if (e.target === elements.changePasswordDialog) {
            elements.changePasswordDialog.close();
        }
    });
}
// ========== FUNZIONE ESCAPE HTML (PREVENZIONE XSS) ==========
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function initializeModals() {
    const confirmDialog = document.getElementById('confirmationDialog');
    const cancelAction = document.getElementById('cancelAction');
    const feedbackDialog = document.getElementById('feedbackDialog');
    const closeFeedback = document.getElementById('closeFeedback');
    
    confirmDialog?.addEventListener('click', (e) => { if (e.target === confirmDialog) confirmDialog.close(); });
    cancelAction?.addEventListener('click', () => confirmDialog?.close());
    feedbackDialog?.addEventListener('click', (e) => { if (e.target === feedbackDialog) feedbackDialog.close(); });
    closeFeedback?.addEventListener('click', () => feedbackDialog?.close());
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
                console.error("Errore recupero utente:", error);
                await auth.signOut();
                showLogin();
            }
        } else if (!user) {
            showLogin();
        }
    });
}

// ========== AVVIO ==========
function initializeApp() {
    initializeModals();
    initializeEventListeners();
    initPasswordToggle();
    initPasswordStrengthChecker(); // Nuovo!
    setupFirebaseAuth();
}

document.addEventListener('DOMContentLoaded', initializeApp);
