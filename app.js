// app.js
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from './firebase.js';

// --- CONFIGURATION ---
const TAGS_CONFIG = {
    'urgent': { name: 'Urgent', color: 'bg-red-100 text-red-700' },
    'work': { name: 'Travail', color: 'bg-blue-100 text-blue-700' },
    'perso': { name: 'Perso', color: 'bg-green-100 text-green-700' },
    'none': { name: '', color: '' }
};

const COLORS_CONFIG = {
    'blue': 'text-blue-600',
    'red': 'text-red-600',
    'green': 'text-green-600',
    'purple': 'text-purple-600'
};

// --- STORE (Gestion des données) ---
class Store {
    constructor() {
        this.tasks = [];
        this.deadlines = [];
        this.currentDate = new Date();
    }

    async init() {
        await this.refresh();
    }

    async refresh() {
        try {
            // Récupérer Deadlines
            const dlSnapshot = await getDocs(collection(db, "deadlines"));
            this.deadlines = dlSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Récupérer Tâches
            const tkSnapshot = await getDocs(collection(db, "tasks"));
            this.tasks = tkSnapshot.docs.map(t => ({ id: t.id, ...t.data() }));
            
            // Trier Deadlines par date
            this.deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (e) {
            console.error("Erreur chargement:", e);
        }
    }

    getDeadline(id) { return this.deadlines.find(d => d.id === id); }
    
    getTasksForDeadline(dlId) { return this.tasks.filter(t => t.deadlineId === dlId); }
    
    getOrphanTasks() { return this.tasks.filter(t => !t.deadlineId); }

    // ACTIONS
    async addDeadline(data) {
        await addDoc(collection(db, "deadlines"), data);
        await this.refresh();
    }

   async addTask(data) {
        // CORRECTION : On mappe correctement les champs du formulaire
        const task = {
            title: data.title,
            // C'est ici que ça bloquait : on récupère 'taskType' du formulaire et on l'enregistre dans 'type'
            type: data.taskType || 'CLASSIC', 
            done: false,
            current: 0,
            // On s'assure que target est un nombre, sinon 0
            target: parseInt(data.target) || 0,
            // Si deadlineId est vide (chaîne vide), on met null
            deadlineId: data.deadlineId || null,
            tag: data.tag || 'none',
            createdAt: new Date().toISOString()
        };
        
        // Envoi à Firebase
        await addDoc(collection(db, "tasks"), task);
        await this.refresh();
    }

    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;
        
        task.done = !task.done;
        await updateDoc(doc(db, "tasks", id), { done: task.done });
        return task.done;
    }

    async updateGradual(id, delta) {
        const task = this.tasks.find(t => t.id === id);
        if(!task) return;

        let newVal = task.current + delta;
        if(newVal < 0) newVal = 0;
        if(newVal > task.target) newVal = task.target;
        
        task.current = newVal;
        await updateDoc(doc(db, "tasks", id), { current: newVal });
        return task;
    }

    async deleteItem(collectionName, id) {
        if(confirm("Supprimer cet élément ?")) {
            await deleteDoc(doc(db, collectionName, id));
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
        this.currentView = 'view-list'; // 'view-list' ou 'view-calendar'
        this.searchTerm = '';
        this.activeFilter = 'all';
        
        // DOM Elements
        this.containerList = document.getElementById('view-list');
        this.containerCalendar = document.getElementById('view-calendar');
        this.filterContainer = document.getElementById('filters-container');
        this.calendarGrid = document.getElementById('calendar-grid');
        this.calendarTitle = document.getElementById('calendar-title');
    }

    render() {
        this.renderFilters();
        if(this.currentView === 'view-list') this.renderListView();
        else this.renderCalendarView();
    }

    // --- FILTRES ---
    renderFilters() {
        const filters = ['all', 'urgent', 'work', 'perso'];
        this.filterContainer.innerHTML = filters.map(f => {
            const label = f === 'all' ? 'Tout' : TAGS_CONFIG[f].name;
            const isActive = this.activeFilter === f;
            const baseClass = "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer";
            const activeClass = isActive ? "bg-black text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300";
            return `<button class="${baseClass} ${activeClass}" data-filter="${f}">${label}</button>`;
        }).join('');

        // Events
        this.filterContainer.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeFilter = btn.dataset.filter;
                this.render();
            });
        });
    }

    // --- VUE LISTE ---
    renderListView() {
        this.containerList.innerHTML = '';
        
        // Filtrage global
        const matchFilter = (t) => {
            const matchSearch = t.title.toLowerCase().includes(this.searchTerm.toLowerCase());
            const matchTag = this.activeFilter === 'all' || t.tag === this.activeFilter;
            return matchSearch && matchTag;
        };

        // 1. Deadlines
        this.store.deadlines.forEach(dl => {
            // Filtrer les tâches de cette deadline
            const tasks = this.store.getTasksForDeadline(dl.id).filter(matchFilter);
            
            // Si on cherche et qu'il n'y a pas de tâche correspondante, on n'affiche pas la deadline
            // SAUF si le titre de la deadline correspond à la recherche
            const matchDlTitle = dl.title.toLowerCase().includes(this.searchTerm.toLowerCase());
            
            if(tasks.length === 0 && !matchDlTitle) return;

            const daysLeft = Math.ceil((new Date(dl.date) - new Date()) / (1000 * 60 * 60 * 24));
            const dlColor = COLORS_CONFIG[dl.color] || 'text-gray-800';

            const section = document.createElement('div');
            section.className = 'card-anim mb-4';
            section.innerHTML = `
                <div class="flex items-baseline justify-between mb-2 border-b border-gray-100 pb-1 group">
                    <h2 class="text-lg font-bold ${dlColor}">${dl.title}</h2>
                    <div class="flex items-center gap-2">
                         <span class="text-xs font-mono font-medium text-gray-400">${daysLeft}j</span>
                         <button class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-del-dl="${dl.id}"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="space-y-3"></div>
            `;
            
            const taskContainer = section.querySelector('.space-y-3');
            tasks.forEach(t => taskContainer.appendChild(this.createTaskEl(t)));
            
            // Event suppression Deadline
            section.querySelector('[data-del-dl]').addEventListener('click', async () => {
                if(await this.store.deleteItem("deadlines", dl.id)) this.render();
            });

            this.containerList.appendChild(section);
        });

        // 2. Orphelins
        const orphanTasks = this.store.getOrphanTasks().filter(matchFilter);
        if(orphanTasks.length > 0) {
            const section = document.createElement('div');
            section.className = 'mt-6 pt-4 border-t-2 border-dashed border-gray-200';
            section.innerHTML = `<h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Autres tâches</h3><div class="space-y-3"></div>`;
            const container = section.querySelector('.space-y-3');
            orphanTasks.forEach(t => container.appendChild(this.createTaskEl(t)));
            this.containerList.appendChild(section);
        }
    }

    createTaskEl(task) {
        const el = document.createElement('div');
        el.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 relative group';
        
        // Bouton suppression (caché par défaut, visible au survol)
        const delBtn = document.createElement('button');
        delBtn.className = 'absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity';
        delBtn.innerHTML = '<i class="ph ph-trash"></i>';
        delBtn.onclick = async (e) => { e.stopPropagation(); if(await this.store.deleteItem("tasks", task.id)) this.render(); };
        el.appendChild(delBtn);

        const tagHtml = task.tag && task.tag !== 'none' 
            ? `<span class="text-[10px] px-2 py-0.5 rounded ${TAGS_CONFIG[task.tag].color} ml-2">${TAGS_CONFIG[task.tag].name}</span>` 
            : '';

        if(task.type === 'CLASSIC') {
            const inner = document.createElement('div');
            inner.className = 'flex items-center gap-3 pr-6';
            inner.innerHTML = `
                <label class="checkbox-wrapper relative cursor-pointer w-6 h-6 flex-shrink-0">
                    <input type="checkbox" class="sr-only" ${task.done ? 'checked' : ''}>
                    <div class="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center transition-colors">
                        <i class="ph ph-check text-white text-sm opacity-0 transform scale-50 transition-all duration-200 font-bold"></i>
                    </div>
                </label>
                <div class="flex-1 min-w-0">
                    <p class="${task.done ? 'text-gray-400 line-through' : 'text-gray-800'} text-sm font-medium truncate transition-colors">${task.title} ${tagHtml}</p>
                </div>
            `;
            // Check logic
            inner.querySelector('input').addEventListener('change', async () => {
                await this.store.toggleTask(task.id);
                this.render(); 
            });
            el.appendChild(inner);

        } else {
            // GRADUAL
            const ratio = (task.current / task.target) * 100;
            const inner = document.createElement('div');
            inner.className = 'w-full pr-4';
            inner.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium text-gray-800 flex items-center">${task.title} ${tagHtml}</span>
                    <span class="text-xs font-mono text-gray-500">${task.current}/${task.target}</span>
                </div>
                <div class="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div class="h-full bg-brand progress-bar" style="width: ${ratio}%"></div>
                </div>
                <div class="flex gap-3">
                    <button class="flex-1 py-1 bg-gray-100 rounded-lg text-gray-600 text-sm hover:bg-gray-200" data-act="-1"><i class="ph ph-minus"></i></button>
                    <button class="flex-1 py-1 bg-black text-white rounded-lg text-sm hover:opacity-80" data-act="1"><i class="ph ph-plus"></i></button>
                </div>
            `;
            // Buttons logic
            inner.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const delta = parseInt(btn.dataset.act);
                    await this.store.updateGradual(task.id, delta);
                    this.render();
                });
            });
            el.appendChild(inner);
        }
        return el;
    }

    // --- VUE CALENDRIER ---
    renderCalendarView() {
        this.calendarGrid.innerHTML = '';
        const year = this.store.currentDate.getFullYear();
        const month = this.store.currentDate.getMonth();
        
        // Titre du mois
        this.calendarTitle.innerText = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.store.currentDate);

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // Jours vides avant le 1er (Lundi start)
        let startDay = firstDay.getDay() || 7; // 1=Lundi, 7=Dimanche
        for(let i=1; i<startDay; i++) {
            this.calendarGrid.appendChild(document.createElement('div'));
        }

        // Jours du mois
        for(let d=1; d<=lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            
            const cell = document.createElement('div');
            cell.className = `calendar-day flex flex-col items-center ${isToday ? 'today' : ''}`;
            cell.innerHTML = `<span class="text-[10px] font-bold text-gray-500 mb-1">${d}</span>`;

            // Trouver les deadlines pour ce jour
            const dls = this.store.deadlines.filter(dl => dl.date === dateStr);
            dls.forEach(dl => {
                const dot = document.createElement('div');
                dot.className = `w-full text-[9px] truncate px-1 rounded ${dl.color === 'red' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} mb-0.5`;
                dot.innerText = dl.title;
                cell.appendChild(dot);
            });

            this.calendarGrid.appendChild(cell);
        }
    }
}

// --- MODAL & FORM LOGIC ---
const setupModal = (store, ui) => {
    const fab = document.getElementById('fab-add');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const form = document.getElementById('add-form');
    
    // Tabs
    const tabTask = document.getElementById('tab-task');
    const tabDl = document.getElementById('tab-deadline');
    const fieldsTask = document.getElementById('fields-task');
    const fieldsDl = document.getElementById('fields-deadline');
    const dlSelect = document.getElementById('deadline-select');

    let currentMode = 'TASK'; // 'TASK' or 'DEADLINE'

    const openModal = () => {
        // Remplir le select des deadlines
        dlSelect.innerHTML = '<option value="">Aucune (Tâche orpheline)</option>';
        store.deadlines.forEach(dl => {
            dlSelect.innerHTML += `<option value="${dl.id}">${dl.title}</option>`;
        });

        document.body.classList.add('modal-active');
        // Reset animation
        setTimeout(() => { modalOverlay.classList.remove('opacity-0'); }, 10);
    };

    const closeModal = () => {
        modalOverlay.classList.add('opacity-0');
        setTimeout(() => { document.body.classList.remove('modal-active'); }, 300);
    };

    fab.onclick = openModal;
    modalClose.onclick = closeModal;

    // Switch Tabs
    const setMode = (mode) => {
        currentMode = mode;
        if(mode === 'TASK') {
            tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            fieldsTask.classList.remove('hidden');
            fieldsDl.classList.add('hidden');
        } else {
            tabDl.className = "flex-1 py-2 text-sm font-medium rounded-md bg-white shadow-sm transition-all text-black";
            tabTask.className = "flex-1 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-all";
            fieldsTask.classList.add('hidden');
            fieldsDl.classList.remove('hidden');
        }
    };

    tabTask.onclick = (e) => { e.preventDefault(); setMode('TASK'); };
    tabDl.onclick = (e) => { e.preventDefault(); setMode('DEADLINE'); };

    // Toggle Gradual Inputs
    const typeSelect = document.getElementById('task-type-select');
    const targetField = document.getElementById('gradual-target-field');
    typeSelect.addEventListener('change', (e) => {
        if(e.target.value === 'GRADUAL') targetField.classList.remove('hidden');
        else targetField.classList.add('hidden');
    });

    // Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        if(currentMode === 'DEADLINE') {
            await store.addDeadline({
                title: data.title,
                date: data.date,
                color: data.color
            });
        } else {
            await store.addTask(data);
        }
        
        form.reset();
        closeModal();
        ui.render();
    });
};

// --- NAVIGATION & SEARCH ---
const setupNav = (ui) => {
    // Tabs Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI Active State
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.replace('text-brand', 'text-gray-400'));
            btn.classList.replace('text-gray-400', 'text-brand');
            
            // Switch View
            const targetId = btn.dataset.target;
            document.getElementById('view-list').classList.add('hidden');
            document.getElementById('view-calendar').classList.add('hidden');
            document.getElementById(targetId).classList.remove('hidden');
            
            ui.currentView = targetId;
            ui.render();
        });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        ui.searchTerm = e.target.value;
        ui.render();
    });

    // Calendar Navigation
    document.getElementById('prev-month').onclick = () => {
        ui.store.currentDate.setMonth(ui.store.currentDate.getMonth() - 1);
        ui.render();
    };
    document.getElementById('next-month').onclick = () => {
        ui.store.currentDate.setMonth(ui.store.currentDate.getMonth() + 1);
        ui.render();
    };
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    // Affichage date header
    document.getElementById('date-display').innerText = new Date().toLocaleDateString('fr-FR');

    const store = new Store();
    const ui = new UI(store);
    
    await store.init();
    ui.render();
    
    setupModal(store, ui);
    setupNav(ui);
});