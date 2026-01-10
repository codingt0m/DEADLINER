import { db, auth, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';

// --- CONFIG ---
const COLORS_CONFIG = {
    'blue': 'text-blue-600',
    'red': 'text-red-600',
    'green': 'text-green-600',
    'purple': 'text-purple-600',
    'yellow': 'text-yellow-600'
};

const FOLDER_COLORS = {
    'blue': 'bg-blue-100 text-blue-700',
    'red': 'bg-red-100 text-red-700',
    'green': 'bg-green-100 text-green-700',
    'purple': 'bg-purple-100 text-purple-700',
    'gray': 'bg-gray-100 text-gray-700'
};

// --- STORE (Gestion des données) ---
class Store {
    constructor() {
        this.user = null;
        this.tasks = [];
        this.deadlines = [];
        this.folders = [];
        this.tags = [];
        this.currentDate = new Date();
    }

    // Récupère le chemin d'une sous-collection de l'utilisateur
    col(name) {
        return collection(db, `users/${this.user.uid}/${name}`);
    }

    async init(user) {
        this.user = user;
        await this.refresh();
    }

    async refresh() {
        if (!this.user) return;
        try {
            // Fetch All parallel
            const [dlSnap, tkSnap, foSnap, tgSnap] = await Promise.all([
                getDocs(query(this.col('deadlines'))),
                getDocs(query(this.col('tasks'))),
                getDocs(query(this.col('folders'))),
                getDocs(query(this.col('tags')))
            ]);

            this.deadlines = dlSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.date) - new Date(b.date));
            this.tasks = tkSnap.docs.map(t => ({ id: t.id, ...t.data() }));
            this.folders = foSnap.docs.map(f => ({ id: f.id, ...f.data() }));
            this.tags = tgSnap.docs.map(t => ({ id: t.id, ...t.data() }));

        } catch (e) {
            console.error("Erreur chargement:", e);
        }
    }

    // GETTERS
    getTasksForDeadline(dlId) { return this.tasks.filter(t => t.deadlineId === dlId); }
    getOrphanTasks() { return this.tasks.filter(t => !t.deadlineId); }
    getFolder(id) { return this.folders.find(f => f.id === id); }
    getTag(id) { return this.tags.find(t => t.id === id); }

    // ACTIONS
    async addDeadline(data) {
        await addDoc(this.col("deadlines"), data);
        await this.refresh();
    }

    async addTask(data) {
        const task = {
            title: data.title,
            type: data.taskType || 'CLASSIC',
            done: false,
            current: 0,
            target: parseInt(data.target) || 0,
            deadlineId: data.deadlineId || null,
            folderId: data.folderId || null,
            tagId: data.tagId || null,
            description: data.description || '',
            duration: parseInt(data.duration) || 0,
            createdAt: new Date().toISOString()
        };
        await addDoc(this.col("tasks"), task);
        await this.refresh();
    }

    async addFolder(name) {
        await addDoc(this.col("folders"), { name, color: 'gray', createdAt: new Date().toISOString() });
        await this.refresh();
    }

    async addTag(name) {
        await addDoc(this.col("tags"), { name, color: 'blue', createdAt: new Date().toISOString() });
        await this.refresh();
    }

    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;
        task.done = !task.done;
        await updateDoc(doc(db, `users/${this.user.uid}/tasks`, id), { done: task.done });
        return task.done; // Return new state
    }

    async updateGradual(id, delta) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;
        let newVal = Math.min(Math.max(task.current + delta, 0), task.target);
        task.current = newVal;
        await updateDoc(doc(db, `users/${this.user.uid}/tasks`, id), { current: newVal });
        return task;
    }

    async deleteItem(collectionName, id) {
        if(confirm("Supprimer cet élément ?")) {
            await deleteDoc(doc(db, `users/${this.user.uid}/${collectionName}`, id));
            await this.refresh();
            return true;
        }
        return false;
    }
}

// --- UI MANAGER ---
class UI {
    constructor(store) {
        this.store = store;
        this.currentView = 'view-list';
        this.searchTerm = '';
        this.activeFilter = 'all'; // 'all' or folderId
        
        // DOM Elements
        this.els = {
            list: document.getElementById('view-list'),
            calendar: document.getElementById('view-calendar'),
            projects: document.getElementById('view-projects'),
            filters: document.getElementById('filters-container'),
            calGrid: document.getElementById('calendar-grid'),
            calTitle: document.getElementById('calendar-title'),
            authContainer: document.getElementById('auth-container'),
            mainContent: document.getElementById('main-content'),
            header: document.getElementById('app-header'),
            nav: document.getElementById('app-nav'),
            fab: document.getElementById('fab-add'),
            projectGrid: document.getElementById('projects-grid'),
            tagsList: document.getElementById('tags-list')
        };
    }

    showAuth() {
        this.els.authContainer.classList.remove('hidden');
        this.els.mainContent.classList.add('hidden');
        this.els.header.classList.add('hidden');
        this.els.nav.classList.add('hidden');
        this.els.fab.classList.add('hidden');
        this.els.filters.classList.add('hidden');
    }

    showApp() {
        this.els.authContainer.classList.add('hidden');
        this.els.mainContent.classList.remove('hidden');
        this.els.header.classList.remove('hidden');
        this.els.nav.classList.remove('hidden');
        this.els.fab.classList.remove('hidden');
        this.els.filters.classList.remove('hidden');
        this.render();
    }

    render() {
        this.renderFilters();
        if(this.currentView === 'view-list') this.renderListView();
        else if(this.currentView === 'view-calendar') this.renderCalendarView();
        else if(this.currentView === 'view-projects') this.renderProjectsView();
    }

    // --- FILTRES (DOSSIERS) ---
    renderFilters() {
        let html = `<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${this.activeFilter === 'all' ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'}" data-filter="all">Tout</button>`;
        
        this.store.folders.forEach(f => {
            const isActive = this.activeFilter === f.id;
            const cls = isActive ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600';
            html += `<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${cls}" data-filter="${f.id}">${f.name}</button>`;
        });

        this.els.filters.innerHTML = html;
        this.els.filters.querySelectorAll('button').forEach(btn => {
            btn.onclick = () => { this.activeFilter = btn.dataset.filter; this.render(); };
        });
    }

    // --- VUE LISTE ---
    renderListView() {
        this.els.list.innerHTML = '';

        const matchFilter = (t) => {
            const matchSearch = t.title.toLowerCase().includes(this.searchTerm.toLowerCase());
            const matchFolder = this.activeFilter === 'all' || t.folderId === this.activeFilter;
            return matchSearch && matchFolder;
        };

        // 1. Deadlines
        this.store.deadlines.forEach(dl => {
            const tasks = this.store.getTasksForDeadline(dl.id).filter(matchFilter);
            if(tasks.length === 0 && !dl.title.toLowerCase().includes(this.searchTerm.toLowerCase())) return;

            const daysLeft = Math.ceil((new Date(dl.date) - new Date()) / (1000 * 60 * 60 * 24));
            const dlColor = COLORS_CONFIG[dl.color] || 'text-gray-800';

            const div = document.createElement('div');
            div.className = 'card-anim mb-4';
            div.innerHTML = `
                <div class="flex items-baseline justify-between mb-2 border-b border-gray-100 pb-1 group">
                    <h2 class="text-lg font-bold ${dlColor}">${dl.title}</h2>
                    <div class="flex items-center gap-2">
                         <span class="text-xs font-mono font-medium text-gray-400">${daysLeft}j</span>
                         <button class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-del-dl="${dl.id}"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="space-y-3 task-container"></div>
            `;
            const container = div.querySelector('.task-container');
            tasks.forEach(t => container.appendChild(this.createTaskEl(t)));
            
            div.querySelector('[data-del-dl]').onclick = async () => { if(await this.store.deleteItem("deadlines", dl.id)) this.render(); };
            this.els.list.appendChild(div);
        });

        // 2. Orphelins
        const orphanTasks = this.store.getOrphanTasks().filter(matchFilter);
        if(orphanTasks.length > 0) {
            const div = document.createElement('div');
            div.className = 'mt-6 pt-4 border-t-2 border-dashed border-gray-200';
            div.innerHTML = `<h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Autres tâches</h3><div class="space-y-3 task-container"></div>`;
            const container = div.querySelector('.task-container');
            orphanTasks.forEach(t => container.appendChild(this.createTaskEl(t)));
            this.els.list.appendChild(div);
        }
    }

    createTaskEl(task) {
        const el = document.createElement('div');
        el.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 relative group';
        
        // Suppression
        const delBtn = document.createElement('button');
        delBtn.className = 'absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity';
        delBtn.innerHTML = '<i class="ph ph-trash"></i>';
        delBtn.onclick = async (e) => { e.stopPropagation(); if(await this.store.deleteItem("tasks", task.id)) this.render(); };
        el.appendChild(delBtn);

        // Metadata (Tag + Folder)
        let metaHtml = '';
        if(task.tagId) {
            const tag = this.store.getTag(task.tagId);
            if(tag) metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 mr-1">#${tag.name}</span>`;
        }
        if(task.folderId) {
            const folder = this.store.getFolder(task.folderId);
            if(folder) metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">📁 ${folder.name}</span>`;
        }
        if(task.duration > 0) {
             metaHtml += `<span class="text-[9px] px-1.5 py-0.5 rounded text-gray-400 ml-1">⏱️ ${task.duration}min</span>`;
        }

        const metaDiv = metaHtml ? `<div class="mb-1">${metaHtml}</div>` : '';

        if(task.type === 'CLASSIC') {
            const inner = document.createElement('div');
            inner.className = 'flex items-start gap-3 pr-6';
            inner.innerHTML = `
                <label class="checkbox-wrapper relative cursor-pointer w-6 h-6 flex-shrink-0 mt-0.5">
                    <input type="checkbox" class="sr-only" ${task.done ? 'checked' : ''}>
                    <div class="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center transition-colors">
                        <i class="ph ph-check text-white text-sm opacity-0 transform scale-50 transition-all duration-200 font-bold"></i>
                    </div>
                </label>
                <div class="flex-1 min-w-0">
                    <p class="${task.done ? 'text-gray-400 line-through' : 'text-gray-800'} text-sm font-medium transition-colors">${task.title}</p>
                    ${metaDiv}
                    ${task.description ? `<p class="text-xs text-gray-500 mt-1 line-clamp-2">${task.description}</p>` : ''}
                </div>
            `;
            inner.querySelector('input').addEventListener('change', async (e) => {
                const newDone = await this.store.toggleTask(task.id);
                this.render();
                if(newDone) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            });
            el.appendChild(inner);
        } else {
            // GRADUAL
            const ratio = (task.current / task.target) * 100;
            const inner = document.createElement('div');
            inner.className = 'w-full pr-4';
            inner.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium text-gray-800">${task.title}</span>
                    <span class="text-xs font-mono text-gray-500">${task.current}/${task.target}</span>
                </div>
                ${metaDiv}
                <div class="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-3 mt-2">
                    <div class="h-full bg-brand progress-bar" style="width: ${ratio}%"></div>
                </div>
                <div class="flex gap-3">
                    <button class="flex-1 py-1 bg-gray-100 rounded-lg text-gray-600 text-sm hover:bg-gray-200" data-act="-1"><i class="ph ph-minus"></i></button>
                    <button class="flex-1 py-1 bg-black text-white rounded-lg text-sm hover:opacity-80" data-act="1"><i class="ph ph-plus"></i></button>
                </div>
            `;
            inner.querySelectorAll('button').forEach(btn => {
                btn.onclick = async () => {
                    const taskUpdated = await this.store.updateGradual(task.id, parseInt(btn.dataset.act));
                    this.render();
                    if(taskUpdated.current === taskUpdated.target) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                };
            });
            el.appendChild(inner);
        }
        return el;
    }

    // --- VUE CALENDRIER ---
    renderCalendarView() {
        this.els.calGrid.innerHTML = '';
        const year = this.store.currentDate.getFullYear();
        const month = this.store.currentDate.getMonth();
        
        this.els.calTitle.innerText = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.store.currentDate);

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let startDay = firstDay.getDay() || 7; 
        
        for(let i=1; i<startDay; i++) this.els.calGrid.appendChild(document.createElement('div'));

        for(let d=1; d<=lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            
            const cell = document.createElement('div');
            cell.className = `calendar-day flex flex-col items-center ${isToday ? 'today' : ''}`;
            cell.innerHTML = `<span class="text-[10px] font-bold text-gray-500 mb-1">${d}</span>`;

            this.store.deadlines.filter(dl => dl.date === dateStr).forEach(dl => {
                const dot = document.createElement('div');
                dot.className = `w-full text-[9px] truncate px-1 rounded bg-blue-100 text-blue-700 mb-0.5`;
                dot.innerText = dl.title;
                cell.appendChild(dot);
            });
            this.els.calGrid.appendChild(cell);
        }
    }

    // --- VUE PROJETS ---
    renderProjectsView() {
        this.els.projectGrid.innerHTML = '';
        this.store.folders.forEach(f => {
            const el = document.createElement('div');
            el.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center relative group aspect-square hover:bg-gray-50 transition-colors cursor-pointer';
            el.innerHTML = `
                <i class="ph ph-folder-simple text-4xl text-yellow-400 mb-2"></i>
                <span class="font-medium text-sm text-center truncate w-full">${f.name}</span>
                <button class="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" data-del><i class="ph ph-trash"></i></button>
            `;
            el.querySelector('[data-del]').onclick = (e) => { e.stopPropagation(); this.store.deleteItem('folders', f.id).then(() => this.render()); };
            el.onclick = () => {
                this.activeFilter = f.id;
                document.querySelector('[data-target="view-list"]').click(); // Switch to list view with filter
            };
            this.els.projectGrid.appendChild(el);
        });

        this.els.tagsList.innerHTML = '';
        this.store.tags.forEach(t => {
            const el = document.createElement('span');
            el.className = 'px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium flex items-center gap-1 group';
            el.innerHTML = `#${t.name} <button class="text-gray-300 hover:text-red-500 w-0 overflow-hidden group-hover:w-auto transition-all" data-del><i class="ph ph-x"></i></button>`;
            el.querySelector('[data-del]').onclick = () => this.store.deleteItem('tags', t.id).then(() => this.render());
            this.els.tagsList.appendChild(el);
        });
    }
}

// --- LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    const store = new Store();
    const ui = new UI(store);
    
    // Auth Listener
    onAuthStateChanged(auth, async (user) => {
        if(user) {
            await store.init(user);
            ui.showApp();
        } else {
            ui.showAuth();
        }
    });

    // Auth Form Logic
    let isLogin = true;
    const authForm = document.getElementById('auth-form');
    const switchBtn = document.getElementById('auth-switch-btn');
    const authError = document.getElementById('auth-error');
    
    switchBtn.onclick = (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        document.getElementById('auth-btn-text').innerText = isLogin ? "Se connecter" : "S'inscrire";
        document.getElementById('auth-switch-text').innerText = isLogin ? "Pas de compte ?" : "Déjà un compte ?";
        switchBtn.innerText = isLogin ? "Créer un compte" : "Se connecter";
        authError.classList.add('hidden');
    };

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        authError.classList.add('hidden');

        try {
            if(isLogin) await signInWithEmailAndPassword(auth, email, password);
            else await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
            authError.innerText = "Erreur : " + err.message;
            authError.classList.remove('hidden');
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth);

    // Initial Nav Setup
    setupNav(ui);
    setupModal(store, ui);
    setupProjects(store, ui);
});

// --- HELPERS ---
const setupNav = (ui) => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.replace('text-brand', 'text-gray-400'));
            btn.classList.replace('text-gray-400', 'text-brand');
            
            ['view-list', 'view-calendar', 'view-projects'].forEach(v => document.getElementById(v).classList.add('hidden'));
            const target = btn.dataset.target;
            document.getElementById(target).classList.remove('hidden');
            ui.currentView = target;
            ui.render();
        });
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        ui.searchTerm = e.target.value;
        ui.render();
    });

    document.getElementById('prev-month').onclick = () => { ui.store.currentDate.setMonth(ui.store.currentDate.getMonth()-1); ui.render(); };
    document.getElementById('next-month').onclick = () => { ui.store.currentDate.setMonth(ui.store.currentDate.getMonth()+1); ui.render(); };
};

const setupModal = (store, ui) => {
    const els = {
        fab: document.getElementById('fab-add'),
        overlay: document.getElementById('modal-overlay'),
        close: document.getElementById('modal-close'),
        form: document.getElementById('add-form'),
        tabTask: document.getElementById('tab-task'),
        tabDl: document.getElementById('tab-deadline'),
        fieldsTask: document.getElementById('fields-task'),
        fieldsDl: document.getElementById('fields-deadline'),
        dlSelect: document.getElementById('deadline-select'),
        folderSelect: document.getElementById('folder-select'),
        tagSelect: document.getElementById('tag-select'),
        typeSelect: document.getElementById('task-type-select'),
        targetField: document.getElementById('gradual-target-field')
    };

    let mode = 'TASK';

    const open = () => {
        // Populate Selects
        els.dlSelect.innerHTML = '<option value="">Aucune</option>' + store.deadlines.map(d => `<option value="${d.id}">${d.title}</option>`).join('');
        els.folderSelect.innerHTML = '<option value="">Aucun</option>' + store.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        els.tagSelect.innerHTML = '<option value="">Aucun</option>' + store.tags.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        document.body.classList.add('modal-active');
        setTimeout(() => els.overlay.classList.remove('opacity-0'), 10);
    };

    const close = () => {
        els.overlay.classList.add('opacity-0');
        setTimeout(() => document.body.classList.remove('modal-active'), 300);
    };

    els.fab.onclick = open;
    els.close.onclick = close;

    const setMode = (m) => {
        mode = m;
        if(m === 'TASK') {
            els.tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            els.tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            els.fieldsTask.classList.remove('hidden');
            els.fieldsDl.classList.add('hidden');
        } else {
            els.tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            els.tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            els.fieldsTask.classList.add('hidden');
            els.fieldsDl.classList.remove('hidden');
        }
    };
    els.tabTask.onclick = (e) => { e.preventDefault(); setMode('TASK'); };
    els.tabDl.onclick = (e) => { e.preventDefault(); setMode('DEADLINE'); };

    els.typeSelect.onchange = (e) => {
        if(e.target.value === 'GRADUAL') els.targetField.classList.remove('hidden');
        else els.targetField.classList.add('hidden');
    };

    els.form.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(els.form).entries());
        if(mode === 'DEADLINE') await store.addDeadline(data);
        else await store.addTask(data);
        els.form.reset();
        close();
        ui.render();
    };
};

const setupProjects = (store, ui) => {
    document.getElementById('btn-create-folder').onclick = async () => {
        const input = document.getElementById('new-folder-name');
        if(input.value.trim()) {
            await store.addFolder(input.value.trim());
            input.value = '';
            ui.render();
        }
    };
    document.getElementById('btn-create-tag').onclick = async () => {
        const input = document.getElementById('new-tag-name');
        if(input.value.trim()) {
            await store.addTag(input.value.trim());
            input.value = '';
            ui.render();
        }
    };
};